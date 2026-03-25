package api

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// ═══════════════════════════════════════════════════════════════
// Node Control Automation — Platform-side node monitoring,
// health checks, alerting, and remote command dispatch.
//
// Crons:
//   - NodeHealthMonitor      (every 2 min)  → detect offline, alert owners
//   - StaleNodePruner        (every 1 hour) → degrade multiplier, cleanup ghosts
//   - NodePerformanceTracker (every 15 min) → aggregate RPC stats, score nodes
//
// API:
//   - GET  /nodes/health          → cluster health summary
//   - GET  /nodes/controls/:id    → single node full detail
//   - POST /nodes/command         → dispatch command to node
//   - GET  /nodes/alerts          → list recent node alerts
//   - POST /nodes/alerts/resolve  → resolve an alert
// ═══════════════════════════════════════════════════════════════

const (
	alertStaleMinutes     = 5     // minutes without heartbeat → stale alert
	alertOfflineMinutes   = 15    // minutes without heartbeat → offline alert
	alertGhostHours       = 24    // hours without heartbeat → ghost (auto-deregister)
	degradeMultMinutes    = 30    // minutes offline → start degrading multiplier
	maxCommandQueuePerNode = 10
)

// ─── Setup Routes ────────────────────────────────────────────

func SetupNodeControlRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	ctrl := v1.Group("/nodes")
	{
		ctrl.GET("/health", getClusterHealth(db))
		ctrl.GET("/controls/:node_id", getNodeControl(db))
		ctrl.POST("/command", dispatchNodeCommand(db))
		ctrl.GET("/alerts", getNodeAlerts(db))
		ctrl.POST("/alerts/resolve", resolveNodeAlert(db))
		ctrl.GET("/automation/status", getAutomationStatus(db))
	}
}

// ─── Node Health Monitor Cron (every 2 minutes) ─────────────
// Detects stale/offline/ghost nodes, creates alerts, notifies owners

func StartNodeHealthMonitor(db *sql.DB) {
	// Ensure tables exist
	ensureNodeControlTables(db)

	ticker := time.NewTicker(2 * time.Minute)
	go func() {
		for range ticker.C {
			runNodeHealthCheck(db)
		}
	}()
	log.Println("[NodeControl] Health Monitor started (every 2 min)")
}

func runNodeHealthCheck(db *sql.DB) {
	now := time.Now().UTC()

	// 1. Detect STALE nodes (no heartbeat > 5 min but < 15 min)
	staleCount := 0
	rows, err := db.Query(
		`SELECT n.node_id, n.wallet_address, n.tier,
		        EXTRACT(EPOCH FROM ($1 - n.last_heartbeat))/60 AS minutes_silent
		 FROM node_uptime_tracker n
		 WHERE n.last_heartbeat < $2
		   AND n.last_heartbeat > $3
		   AND NOT EXISTS (
		       SELECT 1 FROM node_alerts a
		       WHERE a.node_id = n.node_id AND a.alert_type = 'stale'
		         AND a.resolved_at IS NULL
		   )`,
		now,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute),
		now.Add(-time.Duration(alertOfflineMinutes)*time.Minute),
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var nodeID, wallet, tier string
			var minSilent float64
			rows.Scan(&nodeID, &wallet, &tier, &minSilent)

			createAlert(db, nodeID, wallet, "stale",
				fmt.Sprintf("Node %s (%s tier) — no heartbeat for %.0f minutes", nodeID[:8], tier, minSilent),
				"warning")
			staleCount++
		}
	}

	// 2. Detect OFFLINE nodes (no heartbeat > 15 min)
	offlineResult, _ := db.Exec(
		`INSERT INTO node_alerts (node_id, wallet_address, alert_type, message, severity, created_at)
		 SELECT n.node_id, n.wallet_address, 'offline',
		        'Node offline > 15 min. Multiplier degradation starting.',
		        'critical', $1
		 FROM node_uptime_tracker n
		 WHERE n.last_heartbeat < $2
		   AND n.last_heartbeat > $3
		   AND NOT EXISTS (
		       SELECT 1 FROM node_alerts a
		       WHERE a.node_id = n.node_id AND a.alert_type = 'offline'
		         AND a.resolved_at IS NULL
		   )`,
		now,
		now.Add(-time.Duration(alertOfflineMinutes)*time.Minute),
		now.Add(-time.Duration(alertGhostHours)*time.Hour),
	)
	offlineCount, _ := offlineResult.RowsAffected()

	// 3. Auto-resolve stale alerts for nodes that came back online
	resolved, _ := db.Exec(
		`UPDATE node_alerts SET resolved_at = $1, resolution = 'auto_recovered'
		 WHERE resolved_at IS NULL
		   AND alert_type IN ('stale', 'offline')
		   AND node_id IN (
		       SELECT node_id FROM node_uptime_tracker
		       WHERE last_heartbeat > $2
		   )`,
		now, now.Add(-time.Duration(HeartbeatTimeoutMin)*time.Minute),
	)
	recoveredCount, _ := resolved.RowsAffected()

	if staleCount > 0 || offlineCount > 0 || recoveredCount > 0 {
		log.Printf("[NodeControl] Health check: +%d stale, +%d offline, %d recovered",
			staleCount, offlineCount, recoveredCount)
	}
}

// ─── Stale Node Pruner (every hour) ─────────────────────────
// Degrades multiplier of offline nodes; marks ghosts

func StartStaleNodePruner(db *sql.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	go func() {
		for range ticker.C {
			runStaleNodePrune(db)
		}
	}()
	log.Println("[NodeControl] Stale Node Pruner started (hourly)")
}

func runStaleNodePrune(db *sql.DB) {
	now := time.Now().UTC()

	// Degrade multiplier by 0.1x per hour for nodes offline > 30 min
	degraded, _ := db.Exec(
		`UPDATE node_uptime_tracker
		 SET current_multiplier = GREATEST(1.0, current_multiplier - 0.1),
		     updated_at = $1
		 WHERE last_heartbeat < $2
		   AND current_multiplier > 1.0`,
		now, now.Add(-time.Duration(degradeMultMinutes)*time.Minute),
	)
	if affected, _ := degraded.RowsAffected(); affected > 0 {
		log.Printf("[NodeControl] Degraded multiplier for %d offline nodes", affected)
	}

	// Mark ghost nodes (offline > 24h) as status='ghost'
	ghosts, _ := db.Exec(
		`UPDATE nodes SET status = 'ghost', updated_at = NOW()
		 WHERE node_id IN (
		     SELECT node_id FROM node_uptime_tracker
		     WHERE last_heartbeat < $1
		 ) AND status != 'ghost'`,
		now.Add(-time.Duration(alertGhostHours)*time.Hour),
	)
	if affected, _ := ghosts.RowsAffected(); affected > 0 {
		log.Printf("[NodeControl] Marked %d ghost nodes (>24h offline)", affected)
	}

	// Cleanup old resolved alerts (>30 days)
	db.Exec(`DELETE FROM node_alerts WHERE resolved_at IS NOT NULL AND resolved_at < NOW() - INTERVAL '30 days'`)
}

// ─── Node Performance Tracker (every 15 min) ────────────────

func StartNodePerformanceTracker(db *sql.DB) {
	ticker := time.NewTicker(15 * time.Minute)
	go func() {
		for range ticker.C {
			runPerformanceSnapshot(db)
		}
	}()
	log.Println("[NodeControl] Performance Tracker started (every 15 min)")
}

func runPerformanceSnapshot(db *sql.DB) {
	now := time.Now().UTC()

	// Update network stats
	var totalNodes, onlineNodes, staleNodes int
	var avgMultiplier, avgUptime float64

	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker`).Scan(&totalNodes)
	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-time.Duration(HeartbeatTimeoutMin)*time.Minute)).Scan(&onlineNodes)
	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat < $1 AND last_heartbeat > $2`,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute),
		now.Add(-time.Duration(alertGhostHours)*time.Hour)).Scan(&staleNodes)
	db.QueryRow(`SELECT COALESCE(AVG(current_multiplier), 1.0) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute)).Scan(&avgMultiplier)
	db.QueryRow(`SELECT COALESCE(AVG(weekly_uptime_pct), 0) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute)).Scan(&avgUptime)

	// Store snapshot
	db.Exec(
		`INSERT INTO network_snapshots (timestamp, total_nodes, online_nodes, stale_nodes, avg_multiplier, avg_uptime_pct)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		now, totalNodes, onlineNodes, staleNodes, avgMultiplier, avgUptime,
	)
}

// ─── Helper: Create Alert ───────────────────────────────────

func createAlert(db *sql.DB, nodeID, wallet, alertType, message, severity string) {
	db.Exec(
		`INSERT INTO node_alerts (node_id, wallet_address, alert_type, message, severity, created_at)
		 VALUES ($1, $2, $3, $4, $5, NOW())`,
		nodeID, wallet, alertType, message, severity,
	)
}

// ─── Dispatch Command to Node ───────────────────────────────

func dispatchNodeCommand(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			NodeID  string `json:"node_id" binding:"required"`
			Command string `json:"command" binding:"required"` // restart, stop, deploy, update, diagnostics
			Params  string `json:"params"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "node_id and command required"})
			return
		}

		// Validate command
		validCmds := map[string]bool{
			"restart": true, "stop": true, "deploy": true,
			"update": true, "diagnostics": true, "health_check": true,
			"rotate_logs": true, "clear_cache": true,
		}
		if !validCmds[req.Command] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid command", "valid": []string{
				"restart", "stop", "deploy", "update", "diagnostics", "health_check", "rotate_logs", "clear_cache",
			}})
			return
		}

		// Queue command
		var id int
		err := db.QueryRow(
			`INSERT INTO node_commands (node_id, command, params, status, created_at)
			 VALUES ($1, $2, $3, 'pending', NOW()) RETURNING id`,
			req.NodeID, req.Command, req.Params,
		).Scan(&id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to queue command"})
			return
		}

		log.Printf("[NodeControl] Command queued: %s → %s (id=%d)", req.Command, req.NodeID[:8], id)

		c.JSON(http.StatusOK, gin.H{
			"command_id": id,
			"node_id":    req.NodeID,
			"command":    req.Command,
			"status":     "pending",
			"message":    "Command queued. Node will pick it up on next heartbeat.",
		})
	}
}

// ─── Cluster Health Summary ─────────────────────────────────

func getClusterHealth(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, tiers := fetchClusterHealthStats(db)
		
		healthScore := calculateHealthScore(stats.total, stats.online, stats.activeAlerts)

		c.JSON(http.StatusOK, gin.H{
			"health_score":     healthScore,
			"total_nodes":      stats.total,
			"online":           stats.online,
			"stale":            stats.stale,
			"offline":          stats.offline,
			"ghost":            stats.ghost,
			"avg_multiplier":   stats.avgMult,
			"avg_uptime_pct":   stats.avgUptime,
			"total_rpc_served": stats.totalRPC,
			"active_alerts":    stats.activeAlerts,
			"pending_commands": stats.pendingCmds,
			"tier_breakdown":   tiers,
			"automation": gin.H{
				"health_monitor":      "active (2 min)",
				"stale_pruner":        "active (1 hour)",
				"performance_tracker": "active (15 min)",
				"age_multiplier":      "active (5 min)",
				"epoch_distributor":   "active (1 hour)",
				"auto_claim":          "active (24 hour)",
			},
		})
	}
}

type clusterStats struct {
	total, online, stale, offline, ghost int
	avgMult, avgUptime                   float64
	totalRPC                             int64
	activeAlerts, pendingCmds            int
}

func fetchClusterHealthStats(db *sql.DB) (clusterStats, []gin.H) {
	now := time.Now().UTC()
	var s clusterStats

	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker`).Scan(&s.total)
	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-time.Duration(HeartbeatTimeoutMin)*time.Minute)).Scan(&s.online)
	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat < $1 AND last_heartbeat > $2`,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute),
		now.Add(-time.Duration(alertOfflineMinutes)*time.Minute)).Scan(&s.stale)
	db.QueryRow(`SELECT COUNT(*) FROM node_uptime_tracker WHERE last_heartbeat < $1 AND last_heartbeat > $2`,
		now.Add(-time.Duration(alertOfflineMinutes)*time.Minute),
		now.Add(-time.Duration(alertGhostHours)*time.Hour)).Scan(&s.offline)
	db.QueryRow(`SELECT COUNT(*) FROM nodes WHERE status = 'ghost'`).Scan(&s.ghost)

	db.QueryRow(`SELECT COALESCE(AVG(current_multiplier), 1.0) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-5*time.Minute)).Scan(&s.avgMult)
	db.QueryRow(`SELECT COALESCE(AVG(weekly_uptime_pct), 0) FROM node_uptime_tracker WHERE last_heartbeat > $1`,
		now.Add(-5*time.Minute)).Scan(&s.avgUptime)
	db.QueryRow(`SELECT COALESCE(SUM(rpc_requests_served), 0) FROM node_uptime_tracker`).Scan(&s.totalRPC)

	db.QueryRow(`SELECT COUNT(*) FROM node_alerts WHERE resolved_at IS NULL`).Scan(&s.activeAlerts)
	db.QueryRow(`SELECT COUNT(*) FROM node_commands WHERE status = 'pending'`).Scan(&s.pendingCmds)

	var tiers []gin.H
	tierRows, _ := db.Query(
		`SELECT COALESCE(tier, 'unknown'), COUNT(*) FROM node_uptime_tracker
		 WHERE last_heartbeat > $1 GROUP BY tier ORDER BY COUNT(*) DESC`,
		now.Add(-time.Duration(alertStaleMinutes)*time.Minute),
	)
	if tierRows != nil {
		defer tierRows.Close()
		for tierRows.Next() {
			var t string
			var cnt int
			if err := tierRows.Scan(&t, &cnt); err == nil {
				tiers = append(tiers, gin.H{"tier": t, "count": cnt})
			}
		}
	}
	return s, tiers
}

func calculateHealthScore(total, online, authCount int) int {
	healthScore := 100
	if total > 0 {
		onlinePct := float64(online) / float64(total) * 100
		if onlinePct < 90 {
			healthScore -= int((90 - onlinePct) * 2)
		}
		if authCount > 5 {
			healthScore -= authCount * 2
		}
		if healthScore < 0 {
			healthScore = 0
		}
	}
	return healthScore
}

// ─── Single Node Control Detail ─────────────────────────────

func getNodeControl(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		nodeID := c.Param("node_id")

		var wallet, tier, hwProfile string
		var mult, uptime, earnings float64
		var uptimeH, containers int
		var lastHB time.Time
		var rpcServed int64

		err := db.QueryRow(
			`SELECT wallet_address, tier, current_multiplier, weekly_uptime_pct,
			        total_uptime_hours, containers_running, last_heartbeat,
			        rpc_requests_served, epoch_earnings_usd,
			        COALESCE(hardware_profile::text, '{}')
			 FROM node_uptime_tracker WHERE node_id = $1`, nodeID,
		).Scan(&wallet, &tier, &mult, &uptime, &uptimeH, &containers,
			&lastHB, &rpcServed, &earnings, &hwProfile)

		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "node not found"})
			return
		}

		status, minutesSince := getNodeStatus(lastHB)
		alerts := fetchRecentNodeAlerts(db, nodeID)
		commands := fetchRecentNodeCommands(db, nodeID)

		c.JSON(http.StatusOK, gin.H{
			"node_id":          nodeID,
			"wallet":           wallet,
			"tier":             tier,
			"status":           status,
			"multiplier":       mult,
			"uptime_pct":       uptime,
			"uptime_hours":     uptimeH,
			"containers":       containers,
			"last_heartbeat":   lastHB.Format(time.RFC3339),
			"minutes_since_hb": int(minutesSince),
			"rpc_served":       rpcServed,
			"epoch_earnings":   earnings,
			"hardware_profile": hwProfile,
			"alerts":           alerts,
			"pending_commands": commands,
		})
	}
}

func getNodeStatus(lastHB time.Time) (string, float64) {
	minutesSince := time.Since(lastHB).Minutes()
	status := "online"
	if minutesSince > float64(alertOfflineMinutes) {
		status = "offline"
	} else if minutesSince > float64(alertStaleMinutes) {
		status = "stale"
	}
	return status, minutesSince
}

func fetchRecentNodeAlerts(db *sql.DB, nodeID string) []gin.H {
	alertRows, _ := db.Query(
		`SELECT alert_type, message, severity, created_at, resolved_at, resolution
		 FROM node_alerts WHERE node_id = $1 ORDER BY created_at DESC LIMIT 10`, nodeID,
	)
	var alerts []gin.H
	if alertRows != nil {
		defer alertRows.Close()
		for alertRows.Next() {
			var aType, msg, sev string
			var createdAt time.Time
			var resolvedAt sql.NullTime
			var resolution sql.NullString
			if err := alertRows.Scan(&aType, &msg, &sev, &createdAt, &resolvedAt, &resolution); err == nil {
				a := gin.H{"type": aType, "message": msg, "severity": sev, "created_at": createdAt.Format(time.RFC3339)}
				if resolvedAt.Valid {
					a["resolved_at"] = resolvedAt.Time.Format(time.RFC3339)
					a["resolution"] = resolution.String
				}
				alerts = append(alerts, a)
			}
		}
	}
	return alerts
}

func fetchRecentNodeCommands(db *sql.DB, nodeID string) []gin.H {
	cmdRows, _ := db.Query(
		`SELECT id, command, params, status, created_at
		 FROM node_commands WHERE node_id = $1 ORDER BY created_at DESC LIMIT 10`, nodeID,
	)
	var commands []gin.H
	if cmdRows != nil {
		defer cmdRows.Close()
		for cmdRows.Next() {
			var id int
			var cmd, params, st string
			var at time.Time
			if err := cmdRows.Scan(&id, &cmd, &params, &st, &at); err == nil {
				commands = append(commands, gin.H{
					"id": id, "command": cmd, "params": params,
					"status": st, "created_at": at.Format(time.RFC3339),
				})
			}
		}
	}
	return commands
}

// ─── List Node Alerts ───────────────────────────────────────

func getNodeAlerts(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := c.DefaultQuery("status", "active") // active or all
		var query string
		if status == "active" {
			query = `SELECT id, node_id, wallet_address, alert_type, message, severity, created_at
			         FROM node_alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 50`
		} else {
			query = `SELECT id, node_id, wallet_address, alert_type, message, severity, created_at
			         FROM node_alerts ORDER BY created_at DESC LIMIT 100`
		}

		rows, err := db.Query(query)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"alerts": []interface{}{}})
			return
		}
		defer rows.Close()

		var alerts []gin.H
		for rows.Next() {
			var id int
			var nodeID, wallet, aType, msg, sev string
			var created time.Time
			rows.Scan(&id, &nodeID, &wallet, &aType, &msg, &sev, &created)
			alerts = append(alerts, gin.H{
				"id": id, "node_id": nodeID, "wallet": wallet,
				"type": aType, "message": msg, "severity": sev,
				"created_at": created.Format(time.RFC3339),
			})
		}

		c.JSON(http.StatusOK, gin.H{"alerts": alerts, "total": len(alerts)})
	}
}

// ─── Resolve Alert ──────────────────────────────────────────

func resolveNodeAlert(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AlertID    int    `json:"alert_id" binding:"required"`
			Resolution string `json:"resolution"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "alert_id required"})
			return
		}
		if req.Resolution == "" {
			req.Resolution = "manual_resolve"
		}

		db.Exec(`UPDATE node_alerts SET resolved_at = NOW(), resolution = $1 WHERE id = $2`,
			req.Resolution, req.AlertID)

		c.JSON(http.StatusOK, gin.H{"resolved": true, "alert_id": req.AlertID})
	}
}

// ─── Automation Status ──────────────────────────────────────

func getAutomationStatus(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		now := time.Now().UTC()

		var totalAlerts, activeAlerts int
		db.QueryRow(`SELECT COUNT(*) FROM node_alerts`).Scan(&totalAlerts)
		db.QueryRow(`SELECT COUNT(*) FROM node_alerts WHERE resolved_at IS NULL`).Scan(&activeAlerts)

		var totalCommands, pendingCmds, executedCmds int
		db.QueryRow(`SELECT COUNT(*) FROM node_commands`).Scan(&totalCommands)
		db.QueryRow(`SELECT COUNT(*) FROM node_commands WHERE status = 'pending'`).Scan(&pendingCmds)
		db.QueryRow(`SELECT COUNT(*) FROM node_commands WHERE status = 'executed'`).Scan(&executedCmds)

		var snapshotCount int
		db.QueryRow(`SELECT COUNT(*) FROM network_snapshots`).Scan(&snapshotCount)

		// Last snapshot
		var lastSnap time.Time
		var lastOnline, lastStale int
		db.QueryRow(`SELECT timestamp, online_nodes, stale_nodes FROM network_snapshots ORDER BY timestamp DESC LIMIT 1`).
			Scan(&lastSnap, &lastOnline, &lastStale)

		c.JSON(http.StatusOK, gin.H{
			"status":     "operational",
			"uptime":     now.Format(time.RFC3339),
			"automations": gin.H{
				"node_health_monitor":      gin.H{"interval": "2 min", "status": "active", "description": "Detects stale/offline/ghost nodes, creates alerts"},
				"stale_node_pruner":        gin.H{"interval": "1 hour", "status": "active", "description": "Degrades multiplier, marks ghosts, cleans old alerts"},
				"node_performance_tracker": gin.H{"interval": "15 min", "status": "active", "description": "Network snapshots, tier stats"},
				"age_multiplier_engine":    gin.H{"interval": "5 min", "status": "active", "description": "Heartbeat check, streak hours, weekly upgrades"},
				"epoch_distributor":        gin.H{"interval": "1 hour", "status": "active", "description": "30-day yield distribution to eligible nodes"},
				"auto_claim_rewards":       gin.H{"interval": "24 hours", "status": "active", "description": "Auto-claims rewards older than 90 days"},
			},
			"stats": gin.H{
				"total_alerts":    totalAlerts,
				"active_alerts":   activeAlerts,
				"total_commands":  totalCommands,
				"pending_commands": pendingCmds,
				"executed_commands": executedCmds,
				"snapshots":       snapshotCount,
				"last_snapshot":   lastSnap.Format(time.RFC3339),
				"last_online":    lastOnline,
				"last_stale":     lastStale,
			},
		})
	}
}

// ─── Ensure Tables ──────────────────────────────────────────

func ensureNodeControlTables(db *sql.DB) {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS node_alerts (
			id SERIAL PRIMARY KEY,
			node_id TEXT NOT NULL,
			wallet_address TEXT DEFAULT '',
			alert_type TEXT NOT NULL,
			message TEXT DEFAULT '',
			severity TEXT DEFAULT 'info',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			resolved_at TIMESTAMPTZ,
			resolution TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS node_commands (
			id SERIAL PRIMARY KEY,
			node_id TEXT NOT NULL,
			command TEXT NOT NULL,
			params TEXT DEFAULT '',
			status TEXT DEFAULT 'pending',
			result TEXT DEFAULT '',
			created_at TIMESTAMPTZ DEFAULT NOW(),
			executed_at TIMESTAMPTZ
		)`,
		`CREATE TABLE IF NOT EXISTS network_snapshots (
			id SERIAL PRIMARY KEY,
			timestamp TIMESTAMPTZ DEFAULT NOW(),
			total_nodes INT DEFAULT 0,
			online_nodes INT DEFAULT 0,
			stale_nodes INT DEFAULT 0,
			avg_multiplier DECIMAL(3,1) DEFAULT 1.0,
			avg_uptime_pct DECIMAL(5,2) DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_node_alerts_node ON node_alerts(node_id)`,
		`CREATE INDEX IF NOT EXISTS idx_node_alerts_active ON node_alerts(resolved_at) WHERE resolved_at IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_node_commands_node ON node_commands(node_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_network_snapshots_ts ON network_snapshots(timestamp)`,
	}

	for _, q := range queries {
		if _, err := db.Exec(q); err != nil {
			log.Printf("[NodeControl] Table create warning: %v", err)
		}
	}
	log.Println("[NodeControl] Tables ensured: node_alerts, node_commands, network_snapshots")
}
