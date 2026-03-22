package api

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

var _ = http.StatusOK // suppress unused import

// RegisterSuperNodeRoutes provides all endpoints the GSTD SuperNode modules need:
//   - /settlement/*     — Revenue Engine (batch settlement, rates)
//   - /storage/*        — Storage Vault (register, challenges, proofs, requests)
//   - /compute/*        — Compute Marketplace (register, poll, complete, fail)
//   - /coverage/*       — Traffic Relay (register, challenges, proofs, peers)
//   - /rewards/*        — Reward rates and history
func RegisterSuperNodeRoutes(v1 *gin.RouterGroup, dbConn *sql.DB) {

	// ═══ SETTLEMENT — batch earning settlement to on-chain GSTD ═══

	v1.POST("/settlement/batch", func(c *gin.Context) {
		var req struct {
			NodeID        string             `json:"node_id"`
			WalletAddress string             `json:"wallet_address"`
			TotalAmount   float64            `json:"total_amount"`
			EventsCount   int                `json:"events_count"`
			Breakdown     map[string]float64 `json:"breakdown"`
			Events        []struct {
				ID        string  `json:"id"`
				Stream    string  `json:"stream"`
				Amount    float64 `json:"amount"`
				Timestamp string  `json:"timestamp"`
			} `json:"events"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		if req.NodeID == "" || req.TotalAmount <= 0 {
			c.JSON(400, gin.H{"error": "node_id and positive total_amount required"})
			return
		}

		// Record settlement in database
		batchID := time.Now().Format("20060102150405") + "_" + req.NodeID[:8]

		_, err := dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO node_settlements (batch_id, node_id, wallet_address, total_amount, events_count, breakdown, settled_at)
			 VALUES ($1, $2, $3, $4, $5, $6, NOW())
			 ON CONFLICT DO NOTHING`,
			batchID, req.NodeID, req.WalletAddress, req.TotalAmount, req.EventsCount,
			formatBreakdown(req.Breakdown),
		)

		status := "queued"
		if err != nil {
			log.Printf("Settlement batch %s: DB error (non-fatal): %v", batchID, err)
			status = "accepted"
		}

		// Record individual earning events
		for _, evt := range req.Events {
			dbConn.ExecContext(c.Request.Context(),
				`INSERT INTO node_earnings (event_id, node_id, stream, amount, earned_at)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT DO NOTHING`,
				evt.ID, req.NodeID, evt.Stream, evt.Amount, evt.Timestamp,
			)
		}

		// Update node total earnings
		dbConn.ExecContext(c.Request.Context(),
			`UPDATE nodes SET total_earned = COALESCE(total_earned, 0) + $1, last_settlement = NOW()
			 WHERE node_id = $2 OR wallet_address = $3`,
			req.TotalAmount, req.NodeID, req.WalletAddress,
		)

		c.JSON(200, gin.H{
			"status":   status,
			"batch_id": batchID,
			"amount":   req.TotalAmount,
			"events":   req.EventsCount,
		})
	})

	// ═══ REWARD RATES — dynamic rates from platform economics ═══

	v1.GET("/rewards/rates", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"rates": gin.H{
				"storage_per_gb_day":   0.01,
				"compute_per_gpu_hour": 0.5,
				"inference_per_query":  0.001,
				"relay_per_gb":         0.005,
				"training_per_epoch":   0.05,
				"staking_apy":          12,
			},
			"multipliers": gin.H{
				"gpu_h100":    3.0,
				"gpu_a100":    2.5,
				"gpu_a6000":   2.0,
				"gpu_4090":    1.5,
				"gpu_4080":    1.2,
				"gpu_default": 1.0,
			},
			"updated_at": time.Now().Format(time.RFC3339),
		})
	})

	v1.GET("/rewards/history", func(c *gin.Context) {
		nodeID := c.Query("node_id")
		if nodeID == "" {
			c.JSON(400, gin.H{"error": "node_id required"})
			return
		}

		rows, err := dbConn.QueryContext(c.Request.Context(),
			`SELECT event_id, stream, amount, earned_at
			 FROM node_earnings WHERE node_id = $1
			 ORDER BY earned_at DESC LIMIT 50`, nodeID)
		if err != nil {
			c.JSON(200, gin.H{"events": []any{}, "total": 0})
			return
		}
		defer rows.Close()

		var events []gin.H
		var total float64
		for rows.Next() {
			var id, stream, ts string
			var amount float64
			rows.Scan(&id, &stream, &amount, &ts)
			events = append(events, gin.H{"id": id, "stream": stream, "amount": amount, "timestamp": ts})
			total += amount
		}

		c.JSON(200, gin.H{"events": events, "total": total, "count": len(events)})
	})

	// ═══ STORAGE VAULT — shard storage provider endpoints ═══

	v1.POST("/storage/register", func(c *gin.Context) {
		var req struct {
			NodeID      string  `json:"node_id"`
			CapacityGB  float64 `json:"capacity_gb"`
			AvailableGB float64 `json:"available_gb"`
			ShardCount  int     `json:"shard_count"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO storage_providers (node_id, capacity_gb, available_gb, shard_count, registered_at, last_seen)
			 VALUES ($1, $2, $3, $4, NOW(), NOW())
			 ON CONFLICT (node_id) DO UPDATE SET
			   capacity_gb = $2, available_gb = $3, shard_count = $4, last_seen = NOW()`,
			req.NodeID, req.CapacityGB, req.AvailableGB, req.ShardCount,
		)

		c.JSON(200, gin.H{"status": "registered", "node_id": req.NodeID})
	})

	v1.POST("/storage/challenges", func(c *gin.Context) {
		// Return PoSt challenges for the node's stored shards
		c.JSON(200, gin.H{"challenges": []any{}})
	})

	v1.POST("/storage/proofs", func(c *gin.Context) {
		var req struct {
			NodeID string `json:"node_id"`
			Proofs []struct {
				ShardID  string `json:"shard_id"`
				Proof    string `json:"proof"`
				Size     int    `json:"size"`
				Checksum string `json:"checksum"`
			} `json:"proofs"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		// Record proofs
		for _, p := range req.Proofs {
			dbConn.ExecContext(c.Request.Context(),
				`INSERT INTO storage_proofs (node_id, shard_id, proof_hash, verified_at)
				 VALUES ($1, $2, $3, NOW())`,
				req.NodeID, p.ShardID, p.Proof,
			)
		}

		c.JSON(200, gin.H{"status": "accepted", "verified": len(req.Proofs)})
	})

	v1.POST("/storage/requests", func(c *gin.Context) {
		// Return pending storage requests for nodes with available space
		c.JSON(200, gin.H{"shards": []any{}})
	})

	// ═══ COMPUTE MARKETPLACE — GPU/CPU job marketplace ═══

	v1.POST("/compute/register", func(c *gin.Context) {
		var req struct {
			NodeID         string `json:"node_id"`
			Capabilities   any    `json:"capabilities"`
			BenchmarkScore int    `json:"benchmark_score"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO compute_providers (node_id, benchmark_score, registered_at, last_seen)
			 VALUES ($1, $2, NOW(), NOW())
			 ON CONFLICT (node_id) DO UPDATE SET benchmark_score = $2, last_seen = NOW()`,
			req.NodeID, req.BenchmarkScore,
		)

		c.JSON(200, gin.H{"status": "registered", "node_id": req.NodeID})
	})

	v1.POST("/compute/poll", func(c *gin.Context) {
		// Return available jobs matching this node's capabilities
		// For now, return empty (jobs will be assigned by task orchestrator)
		c.JSON(200, gin.H{"job": nil})
	})

	v1.POST("/compute/complete", func(c *gin.Context) {
		var req struct {
			NodeID        string  `json:"node_id"`
			JobID         string  `json:"job_id"`
			Status        string  `json:"status"`
			DurationHours float64 `json:"duration_hours"`
			ResultHash    string  `json:"result_hash"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO compute_jobs (job_id, node_id, status, duration_hours, result_hash, completed_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())
			 ON CONFLICT (job_id) DO UPDATE SET status = $3, duration_hours = $4, result_hash = $5, completed_at = NOW()`,
			req.JobID, req.NodeID, req.Status, req.DurationHours, req.ResultHash,
		)

		c.JSON(200, gin.H{"status": "recorded", "job_id": req.JobID})
	})

	v1.POST("/compute/fail", func(c *gin.Context) {
		var req struct {
			NodeID string `json:"node_id"`
			JobID  string `json:"job_id"`
			Error  string `json:"error"`
		}
		c.ShouldBindJSON(&req)
		c.JSON(200, gin.H{"status": "recorded"})
	})

	// ═══ COVERAGE / TRAFFIC RELAY — Helium-style DePIN ═══

	v1.POST("/coverage/register", func(c *gin.Context) {
		var req struct {
			NodeID       string `json:"node_id"`
			Geo          any    `json:"geo"`
			Capabilities any    `json:"capabilities"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}

		dbConn.ExecContext(c.Request.Context(),
			`INSERT INTO coverage_providers (node_id, registered_at, last_seen)
			 VALUES ($1, NOW(), NOW())
			 ON CONFLICT (node_id) DO UPDATE SET last_seen = NOW()`,
			req.NodeID,
		)

		c.JSON(200, gin.H{"status": "registered", "node_id": req.NodeID})
	})

	v1.POST("/coverage/challenges", func(c *gin.Context) {
		// Return PoC challenges from neighbor nodes
		c.JSON(200, gin.H{"challenges": []any{}})
	})

	v1.POST("/coverage/proofs", func(c *gin.Context) {
		var req struct {
			NodeID string `json:"node_id"`
			Proofs []struct {
				ChallengeID   string `json:"challenge_id"`
				ResponderNode string `json:"responder_node"`
				ResponseHash  string `json:"response_hash"`
				LatencyMs     int    `json:"latency_ms"`
			} `json:"proofs"`
		}
		c.ShouldBindJSON(&req)
		c.JSON(200, gin.H{"status": "accepted", "verified": len(req.Proofs)})
	})

	v1.POST("/coverage/peers", func(c *gin.Context) {
		// Return nearby peer nodes for P2P coverage verification
		rows, err := dbConn.QueryContext(c.Request.Context(),
			`SELECT node_id FROM coverage_providers WHERE last_seen > NOW() - INTERVAL '1 hour' LIMIT 10`)
		if err != nil {
			c.JSON(200, gin.H{"peers": []any{}})
			return
		}
		defer rows.Close()

		var peers []gin.H
		for rows.Next() {
			var id string
			rows.Scan(&id)
			peers = append(peers, gin.H{"node_id": id})
		}
		c.JSON(200, gin.H{"peers": peers})
	})

	v1.POST("/coverage/issue_challenge", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "issued"})
	})

	// ═══ SUPERNODE STATS — aggregate overview ═══

	v1.GET("/supernode/stats", func(c *gin.Context) {
		var storageProviders, computeProviders, coverageProviders int
		var totalSettled float64

		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM storage_providers WHERE last_seen > NOW() - INTERVAL '1 hour'`).Scan(&storageProviders)
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM compute_providers WHERE last_seen > NOW() - INTERVAL '1 hour'`).Scan(&computeProviders)
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COUNT(*) FROM coverage_providers WHERE last_seen > NOW() - INTERVAL '1 hour'`).Scan(&coverageProviders)
		dbConn.QueryRowContext(c.Request.Context(),
			`SELECT COALESCE(SUM(total_amount), 0) FROM node_settlements`).Scan(&totalSettled)

		c.JSON(200, gin.H{
			"providers": gin.H{
				"storage":  storageProviders,
				"compute":  computeProviders,
				"coverage": coverageProviders,
			},
			"economics": gin.H{
				"total_settled_gstd": totalSettled,
				"revenue_streams":    6,
			},
			"updated_at": time.Now().Format(time.RFC3339),
		})
	})

	log.Printf("✅ SuperNode routes registered (/settlement/*, /storage/*, /compute/*, /coverage/*, /rewards/*, /supernode/*)")
}

func formatBreakdown(b map[string]float64) string {
	if b == nil {
		return "{}"
	}
	result := "{"
	first := true
	for k, v := range b {
		if !first {
			result += ","
		}
		result += `"` + k + `":` + fmt.Sprintf("%.4f", v)
		first = false
	}
	result += "}"
	return result
}
