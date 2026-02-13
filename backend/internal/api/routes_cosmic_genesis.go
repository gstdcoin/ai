package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"math"

	"github.com/gin-gonic/gin"
)

// SetupCosmicGenesisRoutes registers A2A economy, gold multiplier, hardware grants
func SetupCosmicGenesisRoutes(v1 *gin.RouterGroup, protected *gin.RouterGroup, db *sql.DB, subcontract *services.AgentSubcontractService, goldHash *services.GoldHashRateService) {
	// Gold-to-Hash Rate: public multiplier (more gold = higher base reward)
	v1.GET("/cosmic/gold-multiplier", func(c *gin.Context) {
		mult := goldHash.GetGoldMultiplier(c.Request.Context())
		c.JSON(200, gin.H{"gold_multiplier": mult, "message": "Base mining reward scales with Gold Reserve"})
	})

	// Absolute Point: Predictive Dashboard — 30-day earnings prediction
	protected.GET("/cosmic/earnings-prediction", earningsPrediction(db, goldHash))

	// Agent Subcontract: hire another agent (A2A economy)
	protected.POST("/cosmic/agent/hire", agentHire(subcontract))
	protected.GET("/cosmic/agent/balance", agentBalance(subcontract))

	// Hardware Grants: list pending grants for wallet
	protected.GET("/cosmic/hardware-grants", hardwareGrants(db))

	// Auto-Bounty: list open WhiteHat tasks (public)
	v1.GET("/cosmic/bounties", listBounties(db))

	// Voice & Vision Symbiosis (Cosmic Genesis): Placeholder for streaming voice/video to agent
	v1.GET("/cosmic/agent/voice", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "planned",
			"message": "Voice & Vision Symbiosis: Agent will see and hear the worker's world. WebRTC integration coming.",
		})
	})
	v1.GET("/cosmic/agent/vision", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "planned",
			"message": "Streaming video analysis for agent. Vision API extends InferenceService.",
		})
	})
}

func agentHire(svc *services.AgentSubcontractService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			WorkerAgentID string  `json:"worker_agent_id" binding:"required"`
			TaskID        string  `json:"task_id"`
			AmountGSTD    float64 `json:"amount_gstd" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		hirerID := c.GetString("wallet_address")
		if hirerID == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		if err := svc.HireAgent(c.Request.Context(), hirerID, req.WorkerAgentID, req.TaskID, req.AmountGSTD); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"status": "ok", "message": "Agent hired. Subcontract created."})
	}
}

func agentBalance(svc *services.AgentSubcontractService) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.GetString("wallet_address")
		if agentID == "" {
			agentID = c.Query("agent_id")
		}
		if agentID == "" {
			c.JSON(400, gin.H{"error": "agent_id or wallet required"})
			return
		}
		bal, err := svc.GetAgentBalance(c.Request.Context(), agentID)
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to get balance"})
			return
		}
		c.JSON(200, gin.H{"agent_id": agentID, "balance_gstd": bal})
	}
}

func hardwareGrants(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		rows, err := db.QueryContext(c.Request.Context(), `
			SELECT id, h3_index, grant_amount_gstd, equipment_type, status, created_at
			FROM hardware_grants WHERE wallet_address = $1 ORDER BY created_at DESC
		`, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to fetch grants"})
			return
		}
		defer rows.Close()
		var items []map[string]interface{}
		for rows.Next() {
			var id, h3, eqType, status string
			var amount float64
			var createdAt interface{}
			if err := rows.Scan(&id, &h3, &amount, &eqType, &status, &createdAt); err != nil {
				continue
			}
			items = append(items, map[string]interface{}{
				"id": id, "h3_index": h3, "grant_amount_gstd": amount,
				"equipment_type": eqType, "status": status, "created_at": createdAt,
			})
		}
		c.JSON(200, gin.H{"grants": items})
	}
}

func earningsPrediction(db *sql.DB, goldHash *services.GoldHashRateService) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			wallet = c.Query("wallet")
		}
		if wallet == "" {
			c.JSON(400, gin.H{"error": "wallet required"})
			return
		}
		ctx := c.Request.Context()
		mult := goldHash.GetGoldMultiplier(ctx)
		var totalEarnings float64
		var daysActive float64
		_ = db.QueryRowContext(ctx, `
			SELECT COALESCE(total_earnings_gstd, 0),
			       GREATEST(1, EXTRACT(EPOCH FROM (NOW() - COALESCE(first_task_at, NOW())))/86400)
			FROM worker_ratings WHERE worker_wallet = $1
		`, wallet).Scan(&totalEarnings, &daysActive)
		avgDaily := 0.5
		if daysActive > 0 && totalEarnings > 0 {
			avgDaily = totalEarnings / daysActive
		}
		var nodeCount int
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM nodes WHERE wallet_address = $1 AND status = 'online' AND last_seen > NOW() - INTERVAL '24 hours'`, wallet).Scan(&nodeCount)
		uptimePct := 0.7
		if nodeCount > 0 {
			uptimePct = 0.9
		}
		predicted30d := math.Round((avgDaily*30)*mult*uptimePct*100) / 100
		c.JSON(200, gin.H{
			"wallet":             wallet,
			"predicted_30d_gstd": predicted30d,
			"gold_multiplier":    mult,
			"message":            "Based on your uptime and Gold Reserve growth, your earnings in 30 days",
		})
	}
}

func listBounties(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		rows, err := db.QueryContext(c.Request.Context(), `
			SELECT task_id, vulnerability_type, description, reward_gstd, status, created_at
			FROM auto_bounty_tasks WHERE status = 'open' ORDER BY reward_gstd DESC
		`)
		if err != nil {
			c.JSON(500, gin.H{"error": "failed to fetch bounties"})
			return
		}
		defer rows.Close()
		var items []map[string]interface{}
		for rows.Next() {
			var taskID, vulnType, desc, status string
			var reward float64
			var createdAt interface{}
			if err := rows.Scan(&taskID, &vulnType, &desc, &reward, &status, &createdAt); err != nil {
				continue
			}
			items = append(items, map[string]interface{}{
				"task_id": taskID, "vulnerability_type": vulnType, "description": desc,
				"reward_gstd": reward, "status": status, "created_at": createdAt,
			})
		}
		c.JSON(200, gin.H{"bounties": items})
	}
}
