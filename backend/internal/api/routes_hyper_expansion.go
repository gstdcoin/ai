package api

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

// SetupHyperExpansionRoutes registers viral economy, oracle, leaderboard, brain query
func SetupHyperExpansionRoutes(
	v1 *gin.RouterGroup,
	protected *gin.RouterGroup,
	knowledge *services.KnowledgeService,
	db *sql.DB,
	tonConfig config.TONConfig,
) {
	// Hive Intelligence API: Paid brain query (GSTD -> Gold Pool)
	protected.POST("/brain/query", brainQueryPaid(knowledge, db, tonConfig))

	// TON Proxy-Oracle: External smart contracts query Leviathan's opinion (no auth for oracle)
	v1.GET("/oracle/opinion", oracleOpinion(knowledge))

	// Global Leaderboard by H3 (which region is smartest/most powerful)
	v1.GET("/leaderboard/h3", leaderboardByH3(db))

	// Milestone Awards
	protected.GET("/milestones", getMilestones(db))
	protected.GET("/milestones/check", checkMilestones(db))
}

// brainQueryPaid - Hive Intelligence API: query agent_knowledge, pay GSTD, revenue -> Gold Pool
func brainQueryPaid(knowledge *services.KnowledgeService, db *sql.DB, tonConfig config.TONConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Topic string  `json:"topic" binding:"required"`
			Limit int     `json:"limit"`
			AmountGSTD float64 `json:"amount_gstd"` // Payment for knowledge access
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		if req.AmountGSTD < 0.01 {
			req.AmountGSTD = 0.01 // Minimum 0.01 GSTD per query
		}
		if req.Limit <= 0 {
			req.Limit = 10
		}
		if req.Limit > 50 {
			req.Limit = 50
		}

		ctx := c.Request.Context()
		items, err := knowledge.QueryKnowledge(ctx, req.Topic, req.Limit)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to query knowledge"})
			return
		}

		// Record payment (in production: verify GSTD transfer on-chain first)
		_, _ = db.ExecContext(ctx, `
			INSERT INTO brain_query_payments (wallet_address, query_topic, amount_gstd, gold_pool_credited)
			VALUES ($1, $2, $3, true)
		`, wallet, req.Topic, req.AmountGSTD)

		// Credit Gold Pool (concept - actual transfer would be on payout)
		_, _ = db.ExecContext(ctx, `
			UPDATE platform_funds SET balance_gstd = balance_gstd + $1, total_received_gstd = total_received_gstd + $1, updated_at = NOW()
			WHERE fund_type = 'gold_reserve'
		`, req.AmountGSTD)

		c.JSON(200, gin.H{
			"status":   "ok",
			"topic":    req.Topic,
			"results":  items,
			"paid_gstd": req.AmountGSTD,
			"message":  "Knowledge accessed. Revenue directed to Gold Pool.",
		})
	}
}

// oracleOpinion - TON Proxy-Oracle: External contracts query Leviathan (decentralized oracle)
func oracleOpinion(knowledge *services.KnowledgeService) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("query")
		if query == "" {
			c.JSON(400, gin.H{"error": "query parameter required"})
			return
		}
		ctx := c.Request.Context()
		items, err := knowledge.QueryKnowledge(ctx, query, 5)
		if err != nil {
			c.JSON(500, gin.H{"error": "oracle unavailable"})
			return
		}
		// Oracle response format for smart contracts
		opinion := "NO_DATA"
		if len(items) > 0 {
			opinion = items[0].Content
			if len(opinion) > 500 {
				opinion = opinion[:500] + "..."
			}
		}
		c.JSON(200, gin.H{
			"jsonrpc": "2.0",
			"result": map[string]interface{}{
				"opinion":   opinion,
				"sources":   len(items),
				"query":     query,
			},
		})
	}
}

// leaderboardByH3 - Global Leaderboard: regions by H3 index (smartest/most powerful)
func leaderboardByH3(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		rows, err := db.QueryContext(ctx, `
			SELECT COALESCE(h3_index, 'unknown') as h3_index, 
			       COUNT(*) as node_count,
			       COALESCE(SUM(trust_score), 0) as total_trust,
			       COALESCE(MAX(country), '') as country
			FROM nodes 
			WHERE status = 'online' AND last_seen > NOW() - INTERVAL '1 hour'
			GROUP BY h3_index, country
			ORDER BY node_count DESC, total_trust DESC
			LIMIT 50
		`)
		if err != nil {
			log.Printf("Leaderboard H3 error: %v", err)
			c.JSON(500, gin.H{"error": "Failed to fetch leaderboard"})
			return
		}
		defer rows.Close()

		items := []map[string]interface{}{}
		for rows.Next() {
			var h3, country string
			var count int
			var trust float64
			if err := rows.Scan(&h3, &count, &trust, &country); err != nil {
				continue
			}
			items = append(items, map[string]interface{}{
				"h3_index":   h3,
				"node_count": count,
				"total_trust": trust,
				"country":    country,
			})
		}
		c.JSON(200, gin.H{"leaderboard": items})
	}
}

// getMilestones - User's achieved milestones
func getMilestones(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		ctx := c.Request.Context()
		rows, err := db.QueryContext(ctx, `
			SELECT milestone_type, badge_name, badge_icon, achieved_at
			FROM milestone_awards WHERE wallet_address = $1 ORDER BY achieved_at DESC
		`, wallet)
		if err != nil {
			c.JSON(500, gin.H{"error": "Failed to fetch milestones"})
			return
		}
		defer rows.Close()
		var items []map[string]interface{}
		for rows.Next() {
			var mType, badgeName, badgeIcon string
			var achievedAt interface{}
			if err := rows.Scan(&mType, &badgeName, &badgeIcon, &achievedAt); err != nil {
				continue
			}
			items = append(items, map[string]interface{}{
				"milestone_type": mType,
				"badge_name":    badgeName,
				"badge_icon":    badgeIcon,
				"achieved_at":   achievedAt,
			})
		}
		c.JSON(200, gin.H{"milestones": items})
	}
}

// checkMilestones - Check and award milestones (tasks_1000, uptime_100_days, etc.)
func checkMilestones(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		wallet := c.GetString("wallet_address")
		if wallet == "" {
			c.JSON(401, gin.H{"error": "wallet required"})
			return
		}
		ctx := c.Request.Context()

		var tasksCompleted int
		db.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(total_tasks_completed), 0) FROM worker_ratings WHERE worker_wallet = $1
		`, wallet).Scan(&tasksCompleted)

		// Award tasks_1000 if eligible
		if tasksCompleted >= 1000 {
			_, _ = db.ExecContext(ctx, `
				INSERT INTO milestone_awards (wallet_address, milestone_type, badge_name, badge_icon)
				VALUES ($1, 'tasks_1000', 'Task Master', '🏆')
				ON CONFLICT (wallet_address, milestone_type) DO NOTHING
			`, wallet)
		}

		c.JSON(200, gin.H{
			"tasks_completed": tasksCompleted,
			"message":        "Milestones checked. Achievements may increase free AI limits.",
		})
	}
}
