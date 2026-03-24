package api

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// RPC Proxy Router — "The Gas-Less Router"
// Single endpoint: rpc.gstd.network/v1/{chain}
// Accepts B2B client requests, bills them, proxies to fastest node
// ═══════════════════════════════════════════════════════════════

// RPC pricing per request type (USD)
var rpcPricing = map[string]float64{
	"read":    0.000005,
	"write":   0.00005,
	"archive": 0.0001,
	"ai":      0.001,
}

// RPC methods classification
var archiveMethods = map[string]bool{
	"eth_getLogs": true, "debug_traceTransaction": true, "trace_replayTransaction": true,
	"debug_traceBlockByNumber": true, "eth_getStorageAt": true,
}
var writeMethods = map[string]bool{
	"eth_sendTransaction": true, "eth_sendRawTransaction": true, "ton_sendBoc": true,
	"sendTransaction": true, "sol_sendTransaction": true,
}

func SetupRPCProxyRoutes(rpc *gin.RouterGroup, db *sql.DB) {
	// Main RPC proxy endpoint
	rpc.POST("/v1/:chain", handleRPCRequest(db))

	// Stats
	rpc.GET("/v1/stats", getRPCStats(db))
	rpc.GET("/v1/nodes", getActiveNodes(db))
}

// ─── Find Best Node ──────────────────────────────────────────

type nodeEndpoint struct {
	NodeID  string
	Address string // e.g. "http://172.18.0.5:8545"
	Tier    string
	Latency int
}

func findBestNode(db *sql.DB, chain string) (*nodeEndpoint, error) {
	// Find verified provider nodes running this chain's container
	// ordered by uptime multiplier (reliability) and last latency
	var node nodeEndpoint
	err := db.QueryRow(
		`SELECT nut.node_id, nut.tier,
		        COALESCE(nut.hardware_profile->>'rpc_endpoint', '') as endpoint,
		        COALESCE((nut.hardware_profile->>'ping_ms')::int, 999) as latency
		 FROM node_uptime_tracker nut
		 WHERE nut.last_heartbeat > NOW() - INTERVAL '2 minutes'
		   AND nut.containers_running > 0
		   AND nut.hardware_profile->>'chains' LIKE $1
		 ORDER BY nut.current_multiplier DESC, latency ASC
		 LIMIT 1`,
		"%"+chain+"%",
	).Scan(&node.NodeID, &node.Tier, &node.Address, &node.Latency)

	if err != nil {
		// Fallback: use platform's own RPC if no NaaS nodes available
		fallbacks := map[string]string{
			"ton": "https://toncenter.com/api/v2/jsonRPC",
			"eth": "https://eth.llamarpc.com",
			"sol": "https://api.mainnet-beta.solana.com",
			"btc": "https://blockstream.info/api",
			"bsc": "https://bsc-dataseed.binance.org",
			"arb": "https://arb1.arbitrum.io/rpc",
		}
		if fb, ok := fallbacks[chain]; ok {
			return &nodeEndpoint{
				NodeID:  "platform-fallback",
				Address: fb,
				Tier:    "platform",
				Latency: 100,
			}, nil
		}
		return nil, fmt.Errorf("no nodes available for chain: %s", chain)
	}

	if node.Address == "" {
		// Construct from node_id if no explicit endpoint
		return nil, fmt.Errorf("node %s has no RPC endpoint configured", node.NodeID)
	}

	return &node, nil
}

// ─── Classify RPC Method ─────────────────────────────────────

func classifyRPCMethod(method string) string {
	if writeMethods[method] {
		return "write"
	}
	if archiveMethods[method] {
		return "archive"
	}
	return "read"
}

// ─── Main RPC Handler ────────────────────────────────────────

func handleRPCRequest(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		chain := strings.ToLower(c.Param("chain"))
		startTime := time.Now()

		// 1. Authenticate B2B client
		clientID, _, err := authenticateB2BClient(db, c)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32000, "message": "Authentication failed: " + err.Error()},
				"id":      nil,
			})
			return
		}

		// 2. Check balance
		var balanceUSD, balanceGSTD float64
		db.QueryRow(`SELECT balance_usd, balance_gstd FROM b2b_clients WHERE id = $1`, clientID).Scan(&balanceUSD, &balanceGSTD)

		// Convert GSTD to USD estimate (1 GSTD ≈ $0.01 for billing purposes, dynamic later)
		effectiveBalance := balanceUSD + (balanceGSTD * 0.01)
		if effectiveBalance < 0.000001 {
			c.JSON(http.StatusPaymentRequired, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32001, "message": "Insufficient balance. Top up at https://app.gstdtoken.com/developers/billing"},
				"id":      nil,
			})
			return
		}

		// 3. Read body
		body, err := io.ReadAll(c.Request.Body)
		if err != nil || len(body) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32700, "message": "Parse error"},
				"id":      nil,
			})
			return
		}

		// 4. Quick method extraction for classification
		method := extractJSONRPCMethod(string(body))
		reqType := classifyRPCMethod(method)
		costUSD := rpcPricing[reqType]

		// 5. Find best node
		node, err := findBestNode(db, chain)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32002, "message": "No nodes available for chain: " + chain},
				"id":      nil,
			})
			return
		}

		// 6. Proxy request to node
		proxyReq, err := http.NewRequest("POST", node.Address, strings.NewReader(string(body)))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32603, "message": "Internal error"},
				"id":      nil,
			})
			return
		}
		proxyReq.Header.Set("Content-Type", "application/json")

		httpClient := &http.Client{Timeout: 30 * time.Second}
		resp, err := httpClient.Do(proxyReq)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"jsonrpc": "2.0",
				"error":   gin.H{"code": -32003, "message": "Upstream node error"},
				"id":      nil,
			})
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		latencyMs := int(time.Since(startTime).Milliseconds())

		// 7. Bill the client (deduct from USD first, then GSTD)
		if balanceUSD >= costUSD {
			db.Exec(`UPDATE b2b_clients SET balance_usd = balance_usd - $1, total_requests = total_requests + 1, total_spent_usd = total_spent_usd + $1, updated_at = NOW() WHERE id = $2`, costUSD, clientID)
		} else {
			gstdCost := costUSD / 0.01 // Convert to GSTD
			db.Exec(`UPDATE b2b_clients SET balance_gstd = balance_gstd - $1, total_requests = total_requests + 1, total_spent_usd = total_spent_usd + $2, updated_at = NOW() WHERE id = $3`, gstdCost, costUSD, clientID)
		}

		// 8. Log the request
		db.Exec(
			`INSERT INTO rpc_requests (client_id, node_id, chain, method, request_type, latency_ms, cost_usd, status_code)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			clientID, node.NodeID, chain, method, reqType, latencyMs, costUSD, resp.StatusCode,
		)

		// 9. Route revenue to Sovereign Fund
		go routeRevenue(db, costUSD, "rpc", chain)

		// 10. Update node's served counter
		go func() {
			db.Exec(`UPDATE node_uptime_tracker SET rpc_requests_served = rpc_requests_served + 1 WHERE node_id = $1`, node.NodeID)
		}()

		// 11. Return proxied response
		c.Data(resp.StatusCode, "application/json", respBody)
	}
}

// ─── Revenue Routing (50/20/30 split) ────────────────────────

func routeRevenue(db *sql.DB, amountUSD float64, source, detail string) {
	if amountUSD <= 0 {
		return
	}

	backing := amountUSD * 0.50
	treasury := amountUSD * 0.20
	yieldPortion := amountUSD * 0.30

	// Get current epoch
	var epoch int
	err := db.QueryRow(`SELECT current_epoch FROM sovereign_fund_totals WHERE id = 1`).Scan(&epoch)
	if err != nil {
		epoch = 1
	}

	// Record revenue event
	db.Exec(
		`INSERT INTO revenue_events (source, amount_usd, backing_portion, treasury_portion, yield_portion, epoch, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		source, amountUSD, backing, treasury, yieldPortion, epoch,
		fmt.Sprintf(`{"detail":"%s","timestamp":"%s"}`, detail, time.Now().UTC().Format(time.RFC3339)),
	)

	// Update epoch totals
	db.Exec(
		`UPDATE sovereign_fund SET total_revenue_usd = total_revenue_usd + $1,
		        backing_usd = backing_usd + $2, treasury_usd = treasury_usd + $3,
		        yield_pool_usd = yield_pool_usd + $4
		 WHERE epoch = $5`,
		amountUSD, backing, treasury, yieldPortion, epoch,
	)

	// Update cumulative totals
	db.Exec(
		`UPDATE sovereign_fund_totals SET
		        total_revenue_all_time_usd = total_revenue_all_time_usd + $1,
		        total_backing_usd = total_backing_usd + $2,
		        total_treasury_usd = total_treasury_usd + $3,
		        last_updated = NOW()
		 WHERE id = 1`,
		amountUSD, backing, treasury,
	)

	// Update floor price: backing / circulating_supply
	db.Exec(
		`UPDATE sovereign_fund_totals SET
		        current_floor_price_usd = CASE
		            WHEN (SELECT COALESCE(SUM(balance),0) FROM users WHERE balance > 0) > 0
		            THEN total_backing_usd / (SELECT COALESCE(SUM(balance),1) FROM users WHERE balance > 0)
		            ELSE 0 END
		 WHERE id = 1`,
	)
}

// ─── Extract JSON-RPC method ─────────────────────────────────

func extractJSONRPCMethod(body string) string {
	// Fast extraction without full JSON parse
	idx := strings.Index(body, `"method"`)
	if idx < 0 {
		return "unknown"
	}
	rest := body[idx+8:]
	// Find the value
	startQuote := strings.Index(rest, `"`)
	if startQuote < 0 {
		return "unknown"
	}
	rest = rest[startQuote+1:]
	endQuote := strings.Index(rest, `"`)
	if endQuote < 0 {
		return "unknown"
	}
	return rest[:endQuote]
}

// ─── Stats & Monitoring ──────────────────────────────────────

func getRPCStats(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalReqs int64
		var totalRevenue float64
		var avgLatency float64
		db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(cost_usd),0), COALESCE(AVG(latency_ms),0) FROM rpc_requests WHERE created_at > NOW() - INTERVAL '24 hours'`).Scan(&totalReqs, &totalRevenue, &avgLatency)

		var activeNodes int
		db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat > NOW() - INTERVAL '2 minutes'`).Scan(&activeNodes)

		var totalBacking, floorPrice float64
		db.QueryRow(`SELECT total_backing_usd, current_floor_price_usd FROM sovereign_fund_totals WHERE id = 1`).Scan(&totalBacking, &floorPrice)

		c.JSON(http.StatusOK, gin.H{
			"period_24h": gin.H{
				"total_requests":    totalReqs,
				"total_revenue_usd": totalRevenue,
				"avg_latency_ms":    avgLatency,
			},
			"network": gin.H{
				"active_nodes":     activeNodes,
				"supported_chains": []string{"ton", "eth", "sol", "btc"},
			},
			"sovereign_fund": gin.H{
				"total_backing_usd": totalBacking,
				"floor_price_usd":   floorPrice,
			},
		})
	}
}

func getActiveNodes(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.Query(
			`SELECT node_id, tier, current_multiplier, weekly_uptime_pct, containers_running,
			        rpc_requests_served, last_heartbeat
			 FROM node_uptime_tracker
			 WHERE last_heartbeat > NOW() - INTERVAL '5 minutes'
			 ORDER BY current_multiplier DESC, rpc_requests_served DESC
			 LIMIT 50`,
		)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"nodes": []interface{}{}})
			return
		}
		defer rows.Close()

		var nodes []gin.H
		for rows.Next() {
			var nodeID, tier string
			var mult, uptimePct float64
			var containers int
			var rpcServed int64
			var lastHB time.Time
			rows.Scan(&nodeID, &tier, &mult, &uptimePct, &containers, &rpcServed, &lastHB)
			nodes = append(nodes, gin.H{
				"node_id":         nodeID,
				"tier":            tier,
				"age_multiplier":  mult,
				"uptime_pct":      uptimePct,
				"containers":      containers,
				"requests_served": rpcServed,
				"last_heartbeat":  lastHB.Format(time.RFC3339),
			})
		}
		c.JSON(http.StatusOK, gin.H{"nodes": nodes, "total": len(nodes)})
	}
}
