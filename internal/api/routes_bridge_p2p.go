package api

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// P2P Cross-Chain Bridge — Order Book Model
//
// How it works:
//  1. User A creates order: "I have 100 GSTD on TON, want on Solana"
//  2. User B creates order: "I have 100 GSTD on Solana, want on TON"
//  3. System auto-matches (A.source=B.dest, A.dest=B.source, amounts match)
//  4. Both users get each other's addresses
//  5. User A sends GSTD to User B's TON address
//  6. User B sends GSTD to User A's Solana address
//  7. Both confirm receipt → status = completed
//  8. If timeout (24h) → status = expired, dispute available
// ═══════════════════════════════════════════════════════════════

var validChains = map[string]bool{"TON": true, "Solana": true, "XRPL": true}

// SetupP2PBridgeRoutes registers all P2P bridge endpoints
func SetupP2PBridgeRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	bridge := v1.Group("/bridge/p2p")

	// Create a new bridge order
	bridge.POST("/order", createBridgeOrder(db))

	// Get open orders (order book)
	bridge.GET("/orders", getBridgeOrders(db))

	// Get my orders
	bridge.GET("/my-orders", getMyBridgeOrders(db))

	// Get order details with match info
	bridge.GET("/order/:id", getBridgeOrderDetail(db))

	// Confirm deposit was sent (with on-chain verification)
	bridge.POST("/order/:id/deposit", confirmDepositWithVerification(db))

	// Verify a transaction on-chain (standalone)
	bridge.POST("/verify-tx", verifyTransactionEndpoint())

	// Confirm receipt of tokens
	bridge.POST("/order/:id/confirm", confirmReceipt(db))

	// Cancel an unmatched order
	bridge.POST("/order/:id/cancel", cancelBridgeOrder(db))

	// Get bridge stats
	bridge.GET("/stats", getBridgeStats(db))

	log.Printf("✅ P2P Bridge routes registered (with on-chain verification)")
}

// POST /bridge/p2p/order — Create a new bridge order
func createBridgeOrder(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			UserWallet    string  `json:"user_wallet" binding:"required"`
			SourceChain   string  `json:"source_chain" binding:"required"`
			DestChain     string  `json:"dest_chain" binding:"required"`
			Amount        float64 `json:"amount" binding:"required"`
			SourceAddress string  `json:"source_address" binding:"required"` // where user holds GSTD now
			DestAddress   string  `json:"dest_address" binding:"required"`   // where user wants to receive
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "Missing fields: user_wallet, source_chain, dest_chain, amount, source_address, dest_address"})
			return
		}

		// Validate chains
		req.SourceChain = strings.ToUpper(strings.TrimSpace(req.SourceChain))
		req.DestChain = strings.ToUpper(strings.TrimSpace(req.DestChain))
		// Normalize Solana casing
		if req.SourceChain == "SOLANA" { req.SourceChain = "Solana" }
		if req.DestChain == "SOLANA" { req.DestChain = "Solana" }
		if req.SourceChain == "TON" || req.SourceChain == "XRPL" { /* ok */ }
		if req.DestChain == "TON" || req.DestChain == "XRPL" { /* ok */ }
		
		if !validChains[req.SourceChain] || !validChains[req.DestChain] {
			c.JSON(400, gin.H{"error": "Invalid chain. Supported: TON, Solana, XRPL"})
			return
		}
		if req.SourceChain == req.DestChain {
			c.JSON(400, gin.H{"error": "Source and destination chains must differ"})
			return
		}
		if req.Amount < 0.001 {
			c.JSON(400, gin.H{"error": "Minimum amount: 0.001 GSTD"})
			return
		}
		if req.Amount > 1000000 {
			c.JSON(400, gin.H{"error": "Maximum amount: 1,000,000 GSTD per order"})
			return
		}

		ctx := c.Request.Context()

		// Check for duplicate open orders from same wallet
		var existingCount int
		db.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM bridge_orders WHERE user_wallet = $1 AND status = 'open'`,
			req.UserWallet).Scan(&existingCount)
		if existingCount >= 3 {
			c.JSON(400, gin.H{"error": "Maximum 3 open orders per wallet"})
			return
		}

		// Insert order
		var orderID string
		err := db.QueryRowContext(ctx,
			`INSERT INTO bridge_orders (user_wallet, source_chain, dest_chain, amount, source_address, dest_address, status, expires_at)
			 VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW() + INTERVAL '24 hours')
			 RETURNING id`,
			req.UserWallet, req.SourceChain, req.DestChain, req.Amount,
			req.SourceAddress, req.DestAddress,
		).Scan(&orderID)
		if err != nil {
			log.Printf("[P2P Bridge] Failed to create order: %v", err)
			c.JSON(500, gin.H{"error": "Failed to create order"})
			return
		}

		// Try to auto-match with an existing open counter-order
		match := tryMatchOrder(db, orderID, req.DestChain, req.SourceChain, req.Amount)

		response := gin.H{
			"order_id":     orderID,
			"status":       "open",
			"source_chain": req.SourceChain,
			"dest_chain":   req.DestChain,
			"amount":       req.Amount,
			"expires_at":   time.Now().Add(24 * time.Hour).Format(time.RFC3339),
		}

		if match != nil {
			response["status"] = "matched"
			response["match"] = match
			response["message"] = "Order matched! Send your GSTD to the counterparty's address, and they will send to yours."
		} else {
			response["message"] = "Order placed in the book. You will be notified when a counterparty is found."
		}

		c.JSON(200, response)
	}
}

// tryMatchOrder attempts to find and match a counter-order
func tryMatchOrder(db *sql.DB, orderID, lookForSource, lookForDest string, amount float64) map[string]interface{} {
	ctx := db

	// Find a matching counter-order:
	// - Counter order's source = our dest
	// - Counter order's dest = our source
	// - Amount matches (within 1% tolerance for partial fills)
	var matchID, matchWallet, matchSourceAddr, matchDestAddr string
	var matchAmount float64

	err := db.QueryRow(
		`SELECT id, user_wallet, source_address, dest_address, amount
		 FROM bridge_orders
		 WHERE status = 'open'
		   AND id != $1
		   AND source_chain = $2
		   AND dest_chain = $3
		   AND amount BETWEEN $4 * 0.99 AND $4 * 1.01
		 ORDER BY created_at ASC
		 LIMIT 1`,
		orderID, lookForSource, lookForDest, amount,
	).Scan(&matchID, &matchWallet, &matchSourceAddr, &matchDestAddr, &matchAmount)

	if err != nil {
		return nil
	}

	// Match both orders
	now := time.Now()
	_, err = db.Exec(
		`UPDATE bridge_orders SET status = 'matched', matched_order_id = $1, matched_at = $2, updated_at = $2 WHERE id = $3`,
		matchID, now, orderID)
	if err != nil {
		log.Printf("[P2P Bridge] Failed to update order %s: %v", orderID, err)
		return nil
	}
	_, err = db.Exec(
		`UPDATE bridge_orders SET status = 'matched', matched_order_id = $1, matched_at = $2, updated_at = $2 WHERE id = $3`,
		orderID, now, matchID)
	if err != nil {
		log.Printf("[P2P Bridge] Failed to update match %s: %v", matchID, err)
		return nil
	}

	_ = ctx // suppress unused warning

	log.Printf("[P2P Bridge] ✅ Matched orders: %s ↔ %s (%.4f GSTD)", orderID, matchID, amount)

	return map[string]interface{}{
		"matched_order_id":  matchID,
		"counterparty":      matchWallet[:8] + "..." + matchWallet[len(matchWallet)-4:],
		"send_to_address":   matchDestAddr, // address on YOUR source chain where counterparty wants to receive
		"receive_from":      matchSourceAddr, // counterparty will send from this address on YOUR dest chain
		"amount":            matchAmount,
	}
}

// GET /bridge/p2p/orders — Get the order book
func getBridgeOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		chain := c.Query("chain")  // optional filter
		status := c.DefaultQuery("status", "open")

		var rows *sql.Rows
		var err error

		if chain != "" {
			rows, err = db.QueryContext(c.Request.Context(),
				`SELECT id, source_chain, dest_chain, amount, status, 
				        LEFT(user_wallet, 8) || '...' AS wallet_short,
				        created_at, expires_at
				 FROM bridge_orders
				 WHERE status = $1 AND (source_chain = $2 OR dest_chain = $2)
				 ORDER BY created_at DESC LIMIT 50`, status, chain)
		} else {
			rows, err = db.QueryContext(c.Request.Context(),
				`SELECT id, source_chain, dest_chain, amount, status,
				        LEFT(user_wallet, 8) || '...' AS wallet_short,
				        created_at, expires_at
				 FROM bridge_orders
				 WHERE status = $1
				 ORDER BY created_at DESC LIMIT 50`, status)
		}
		if err != nil {
			c.JSON(500, gin.H{"error": "Query failed"})
			return
		}
		defer rows.Close()

		type Order struct {
			ID          string  `json:"id"`
			SourceChain string  `json:"source_chain"`
			DestChain   string  `json:"dest_chain"`
			Amount      float64 `json:"amount"`
			Status      string  `json:"status"`
			Wallet      string  `json:"wallet"`
			CreatedAt   string  `json:"created_at"`
			ExpiresAt   string  `json:"expires_at"`
		}

		var orders []Order
		for rows.Next() {
			var o Order
			if err := rows.Scan(&o.ID, &o.SourceChain, &o.DestChain, &o.Amount, &o.Status, &o.Wallet, &o.CreatedAt, &o.ExpiresAt); err != nil {
				continue
			}
			orders = append(orders, o)
		}
		if orders == nil {
			orders = []Order{}
		}

		c.JSON(200, gin.H{"orders": orders, "total": len(orders)})
	}
}

// GET /bridge/p2p/my-orders — Get my orders
func getMyBridgeOrders(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.Query("wallet")
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet parameter or X-Wallet-Address header required"})
			return
		}

		rows, err := db.QueryContext(c.Request.Context(),
			`SELECT o.id, o.source_chain, o.dest_chain, o.amount, o.status,
			        o.source_address, o.dest_address,
			        o.matched_order_id, o.deposit_tx_hash,
			        o.created_at, o.expires_at,
			        m.user_wallet AS match_wallet, m.source_address AS match_source, m.dest_address AS match_dest
			 FROM bridge_orders o
			 LEFT JOIN bridge_orders m ON o.matched_order_id = m.id
			 WHERE o.user_wallet = $1
			 ORDER BY o.created_at DESC LIMIT 20`, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "Query failed"})
			return
		}
		defer rows.Close()

		type MyOrder struct {
			ID             string   `json:"id"`
			SourceChain    string   `json:"source_chain"`
			DestChain      string   `json:"dest_chain"`
			Amount         float64  `json:"amount"`
			Status         string   `json:"status"`
			SourceAddr     string   `json:"source_address"`
			DestAddr       string   `json:"dest_address"`
			MatchedOrderID *string  `json:"matched_order_id"`
			DepositTxHash  *string  `json:"deposit_tx_hash"`
			CreatedAt      string   `json:"created_at"`
			ExpiresAt      string   `json:"expires_at"`
			// Match info
			MatchWallet    *string  `json:"counterparty_wallet,omitempty"`
			SendTo         *string  `json:"send_gstd_to,omitempty"`    // where to send YOUR gstd
			ReceiveFrom    *string  `json:"receive_gstd_from,omitempty"` // counterparty sends from here
		}

		var orders []MyOrder
		for rows.Next() {
			var o MyOrder
			var matchWalletFull *string
			if err := rows.Scan(&o.ID, &o.SourceChain, &o.DestChain, &o.Amount, &o.Status,
				&o.SourceAddr, &o.DestAddr,
				&o.MatchedOrderID, &o.DepositTxHash,
				&o.CreatedAt, &o.ExpiresAt,
				&matchWalletFull, &o.ReceiveFrom, &o.SendTo); err != nil {
				continue
			}
			// Shorten counterparty wallet for privacy
			if matchWalletFull != nil && len(*matchWalletFull) > 12 {
				short := (*matchWalletFull)[:8] + "..." + (*matchWalletFull)[len(*matchWalletFull)-4:]
				o.MatchWallet = &short
			}
			orders = append(orders, o)
		}
		if orders == nil {
			orders = []MyOrder{}
		}

		c.JSON(200, gin.H{"orders": orders, "total": len(orders)})
	}
}

// GET /bridge/p2p/order/:id — Get order detail
func getBridgeOrderDetail(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")

		var sourceChain, destChain, status, sourceAddr, destAddr, createdAt, expiresAt string
		var amount float64
		var matchedID, depositTx, releaseTx, matchWallet, matchSource, matchDest *string
		var matchedAt, depositAt, releaseAt *string

		err := db.QueryRowContext(c.Request.Context(),
			`SELECT o.source_chain, o.dest_chain, o.amount, o.status,
			        o.source_address, o.dest_address,
			        o.matched_order_id, o.deposit_tx_hash, o.release_tx_hash,
			        o.created_at::text, o.expires_at::text,
			        o.matched_at::text, o.deposit_confirmed_at::text, o.release_confirmed_at::text,
			        m.user_wallet, m.source_address, m.dest_address
			 FROM bridge_orders o
			 LEFT JOIN bridge_orders m ON o.matched_order_id = m.id
			 WHERE o.id = $1`, id,
		).Scan(&sourceChain, &destChain, &amount, &status,
			&sourceAddr, &destAddr,
			&matchedID, &depositTx, &releaseTx,
			&createdAt, &expiresAt,
			&matchedAt, &depositAt, &releaseAt,
			&matchWallet, &matchSource, &matchDest)

		if err != nil {
			c.JSON(404, gin.H{"error": "Order not found"})
			return
		}

		result := gin.H{
			"id":            id,
			"source_chain":  sourceChain,
			"dest_chain":    destChain,
			"amount":        amount,
			"status":        status,
			"source_address": sourceAddr,
			"dest_address":  destAddr,
			"created_at":    createdAt,
			"expires_at":    expiresAt,
		}

		if matchedID != nil {
			match := gin.H{"matched_order_id": *matchedID}
			if matchWallet != nil {
				w := *matchWallet
				if len(w) > 12 {
					w = w[:8] + "..." + w[len(w)-4:]
				}
				match["counterparty"] = w
			}
			if matchDest != nil {
				match["send_gstd_to"] = *matchDest // counterparty's address on YOUR source chain
			}
			if matchSource != nil {
				match["receive_gstd_from"] = *matchSource // counterparty sends from here on YOUR dest chain
			}
			if matchedAt != nil { match["matched_at"] = *matchedAt }
			result["match"] = match
		}
		if depositTx != nil { result["deposit_tx"] = *depositTx }
		if depositAt != nil { result["deposit_confirmed_at"] = *depositAt }
		if releaseTx != nil { result["release_tx"] = *releaseTx }
		if releaseAt != nil { result["release_confirmed_at"] = *releaseAt }

		c.JSON(200, result)
	}
}

// POST /bridge/p2p/order/:id/deposit — Confirm deposit with ON-CHAIN verification
func confirmDepositWithVerification(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			TxHash string `json:"tx_hash" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "tx_hash required"})
			return
		}

		// Get order details to know which chain to verify
		var sourceChain string
		var amount float64
		var orderStatus string
		err := db.QueryRowContext(c.Request.Context(),
			`SELECT source_chain, amount, status FROM bridge_orders WHERE id = $1`, id,
		).Scan(&sourceChain, &amount, &orderStatus)
		if err != nil {
			c.JSON(404, gin.H{"error": "Order not found"})
			return
		}
		if orderStatus != "matched" && orderStatus != "deposited" {
			c.JSON(400, gin.H{"error": "Order is not in matched status (current: " + orderStatus + ")"})
			return
		}

		// ═══ ON-CHAIN VERIFICATION ═══
		log.Printf("[P2P Bridge] Verifying TX %s on %s for order %s (%.4f GSTD)", req.TxHash[:16], sourceChain, id[:8], amount)
		verification := VerifyTransaction(sourceChain, req.TxHash, amount)

		if !verification.Verified {
			c.JSON(400, gin.H{
				"error":        "On-chain verification failed",
				"chain":        sourceChain,
				"tx_hash":      req.TxHash,
				"detail":       verification.Error,
				"verified":     false,
			})
			return
		}

		// TX verified on-chain — update order
		_, err = db.ExecContext(c.Request.Context(),
			`UPDATE bridge_orders SET deposit_tx_hash = $1, deposit_confirmed_at = NOW(), 
			        status = 'deposited', updated_at = NOW()
			 WHERE id = $2 AND status IN ('matched', 'deposited')`, req.TxHash, id)
		if err != nil {
			c.JSON(500, gin.H{"error": "Database update failed"})
			return
		}

		// Check if BOTH sides have deposited → auto-complete
		var matchedOrderID string
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(matched_order_id::text, '') FROM bridge_orders WHERE id = $1`, id).Scan(&matchedOrderID)

		bothVerified := false
		if matchedOrderID != "" {
			var otherDeposit *string
			db.QueryRowContext(c.Request.Context(),
				`SELECT deposit_tx_hash FROM bridge_orders WHERE id = $1`, matchedOrderID).Scan(&otherDeposit)
			if otherDeposit != nil && *otherDeposit != "" {
				// Both sides verified on-chain! Auto-complete both orders
				db.ExecContext(c.Request.Context(),
					`UPDATE bridge_orders SET status = 'completed', release_confirmed_at = NOW(), updated_at = NOW() WHERE id IN ($1, $2)`, id, matchedOrderID)
				bothVerified = true
				log.Printf("[P2P Bridge] ✅ BOTH sides verified on-chain! Orders %s ↔ %s COMPLETED", id[:8], matchedOrderID[:8])
			}
		}

		response := gin.H{
			"status":           "deposited",
			"verified":         true,
			"chain":            verification.Chain,
			"tx_hash":          req.TxHash,
			"on_chain_amount":  verification.Amount,
			"on_chain_from":    verification.From,
			"on_chain_to":      verification.To,
			"on_chain_token":   verification.Token,
			"block_time":       verification.BlockTime,
		}

		if bothVerified {
			response["status"] = "completed"
			response["message"] = "Both deposits verified on-chain — bridge swap complete! 🎉"
		} else {
			response["message"] = "Deposit verified on " + sourceChain + ". Waiting for counterparty."
		}

		c.JSON(200, response)
	}
}

// POST /bridge/p2p/verify-tx — Standalone on-chain TX verification
func verifyTransactionEndpoint() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Chain   string  `json:"chain" binding:"required"`
			TxHash  string  `json:"tx_hash" binding:"required"`
			Amount  float64 `json:"amount"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "chain and tx_hash required"})
			return
		}

		log.Printf("[Bridge Verify] Standalone verification: %s on %s", req.TxHash[:16], req.Chain)
		result := VerifyTransaction(req.Chain, req.TxHash, req.Amount)

		c.JSON(200, gin.H{
			"verified":   result.Verified,
			"chain":      result.Chain,
			"tx_hash":    result.TxHash,
			"from":       result.From,
			"to":         result.To,
			"amount":     result.Amount,
			"token":      result.Token,
			"block_time": result.BlockTime,
			"error":      result.Error,
		})
	}
}

// POST /bridge/p2p/order/:id/confirm — Confirm receipt of tokens
func confirmReceipt(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req struct {
			ReceivedTxHash string `json:"received_tx_hash"`
		}
		c.ShouldBindJSON(&req)

		result, err := db.ExecContext(c.Request.Context(),
			`UPDATE bridge_orders SET release_tx_hash = $1, release_confirmed_at = NOW(),
			        status = 'completed', updated_at = NOW()
			 WHERE id = $2 AND status IN ('deposited', 'confirming', 'matched')`,
			req.ReceivedTxHash, id)
		if err != nil {
			c.JSON(500, gin.H{"error": "Update failed"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(400, gin.H{"error": "Order not found or already completed"})
			return
		}

		// Check if counterparty also confirmed
		var matchedOrderID string
		db.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(matched_order_id::text, '') FROM bridge_orders WHERE id = $1`, id).Scan(&matchedOrderID)

		message := "You confirmed receipt of GSTD. "
		if matchedOrderID != "" {
			var otherStatus string
			db.QueryRowContext(c.Request.Context(),
				`SELECT status FROM bridge_orders WHERE id = $1`, matchedOrderID).Scan(&otherStatus)
			if otherStatus == "completed" {
				message += "Both sides confirmed — bridge swap complete! 🎉"
			} else {
				message += "Waiting for counterparty to confirm receipt."
			}
		}

		c.JSON(200, gin.H{
			"status":  "completed",
			"message": message,
		})
	}
}

// POST /bridge/p2p/order/:id/cancel — Cancel an open order
func cancelBridgeOrder(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		wallet := c.Query("wallet")
		if wallet == "" {
			wallet = c.GetHeader("X-Wallet-Address")
		}

		result, err := db.ExecContext(c.Request.Context(),
			`UPDATE bridge_orders SET status = 'cancelled', updated_at = NOW()
			 WHERE id = $1 AND user_wallet = $2 AND status = 'open'`, id, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "Update failed"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(400, gin.H{"error": "Order not found, already matched, or not yours"})
			return
		}

		c.JSON(200, gin.H{"status": "cancelled", "message": "Order cancelled"})
	}
}

// GET /bridge/p2p/stats — Bridge statistics
func getBridgeStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()

		type ChainPair struct {
			Route string `json:"route"`
			Count int    `json:"open_orders"`
			Volume float64 `json:"volume_gstd"`
		}

		var openOrders, matchedOrders, completedOrders int
		var totalVolume float64

		db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bridge_orders WHERE status = 'open'`).Scan(&openOrders)
		db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bridge_orders WHERE status = 'matched'`).Scan(&matchedOrders)
		db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bridge_orders WHERE status = 'completed'`).Scan(&completedOrders)
		db.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount), 0) FROM bridge_orders WHERE status = 'completed'`).Scan(&totalVolume)

		// Open orders by route
		rows, _ := db.QueryContext(ctx,
			`SELECT source_chain || ' → ' || dest_chain AS route, COUNT(*), COALESCE(SUM(amount), 0)
			 FROM bridge_orders WHERE status = 'open'
			 GROUP BY source_chain, dest_chain ORDER BY COUNT(*) DESC`)
		
		var routes []ChainPair
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var r ChainPair
				if err := rows.Scan(&r.Route, &r.Count, &r.Volume); err == nil {
					routes = append(routes, r)
				}
			}
		}
		if routes == nil {
			routes = []ChainPair{}
		}

		c.JSON(200, gin.H{
			"open_orders":      openOrders,
			"matched_orders":   matchedOrders,
			"completed_swaps":  completedOrders,
			"total_volume_gstd": totalVolume,
			"routes":           routes,
			"supported_chains": []string{"TON", "Solana", "XRPL"},
			"fee_percent":      0,
			"model":            "peer-to-peer",
			"message":          fmt.Sprintf("%d open orders, %d completed swaps", openOrders, completedOrders),
		})
	}
}
