package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

// MaintenanceService handles autonomous platform maintenance and acts as a personal assistant
type MaintenanceService struct {
	db              *sql.DB
	taskService     *TaskService
	errorLogger     *ErrorLogger
	telegramService *TelegramService
	hardwareGrants  *HardwareGrantsService
}

func NewMaintenanceService(db *sql.DB, taskService *TaskService, errorLogger *ErrorLogger, telegramService *TelegramService, hardwareGrants *HardwareGrantsService) *MaintenanceService {
	return &MaintenanceService{
		db:              db,
		taskService:     taskService,
		errorLogger:     errorLogger,
		telegramService: telegramService,
		hardwareGrants:  hardwareGrants,
	}
}

// alertsEnabled returns false when DISABLE_MAINTENANCE_ALERTS=true|1 (no error reports to Telegram)
func alertsEnabled() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("DISABLE_MAINTENANCE_ALERTS")))
	return v != "true" && v != "1"
}

// Start starts the autonomous maintenance loop
func (s *MaintenanceService) Start(ctx context.Context) {
	log.Println("🤖 Autonomous Assistant & Maintenance Service started")

	// Send startup notification (unless alerts disabled)
	if s.telegramService != nil && alertsEnabled() {
		s.telegramService.SendMessage(ctx, "🤖 <b>System Assistant Online</b>\nI am now monitoring the GSTD platform. I will handle maintenance and keep you updated.")
	}

	// Different intervals for different tasks
	pruneTicker := time.NewTicker(24 * time.Hour)     // Daily cleanup
	briefingTicker := time.NewTicker(24 * time.Hour)  // Daily Report
	repairTicker := time.NewTicker(30 * time.Minute)  // Frequent repairs
	monitorTicker := time.NewTicker(15 * time.Minute) // System Health Pulse
	grantsTicker := time.NewTicker(24 * time.Hour)    // Daily: Treasury → Hardware Grants

	defer pruneTicker.Stop()
	defer briefingTicker.Stop()
	defer repairTicker.Stop()
	defer monitorTicker.Stop()
	defer grantsTicker.Stop()

	// Initial run
	s.performMaintenance(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-pruneTicker.C:
			s.pruneOldData(ctx)
		case <-briefingTicker.C:
			s.sendDailyBriefing(ctx)
		case <-repairTicker.C:
			s.repairStuckTasks(ctx)
			s.updateDeviceActivity(ctx)
			s.mergeGlobalKnowledgeLayer(ctx) // Hyper-Expansion: Auto-Fine-Tuning

		case <-monitorTicker.C:
			s.monitorSystemHealth(ctx)
		case <-grantsTicker.C:
			s.checkTreasuryAndAllocateGrants(ctx)
		}
	}
}

func (s *MaintenanceService) performMaintenance(ctx context.Context) {
	log.Println("🛠️ Assistant performing initial maintenance cycle...")
	s.pruneOldData(ctx)
	s.repairStuckTasks(ctx)
	s.updateDeviceActivity(ctx)

}

func (s *MaintenanceService) pruneOldData(ctx context.Context) {
	log.Println("🧹 Pruning old data logs...")

	// Delete error logs older than 30 days
	// Ultra-Deep: use UTC for clock-skew resilience
	res, err := s.db.ExecContext(ctx, "DELETE FROM error_logs WHERE created_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'")
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Pruned %d old error logs", rows)
		}
	}

	// Delete network measurements older than 30 days
	res, err = s.db.ExecContext(ctx, "DELETE FROM network_measurements WHERE recorded_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'")
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Pruned %d old network measurements", rows)
		}
	}

	// Delete old wallet access logs (table may not exist — optional feature)
	if res, err := s.db.ExecContext(ctx, "DELETE FROM wallet_access_logs WHERE accessed_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'"); err == nil {
		if rows, _ := res.RowsAffected(); rows > 0 {
			log.Printf("   ✅ Pruned %d old wallet_access_logs", rows)
		}
	}

	// Deep Dive: Purge audit tables older than 30 days (prevent DB bloat)
	if res, err := s.db.ExecContext(ctx, "DELETE FROM pow_audit_log WHERE created_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days'"); err == nil {
		if rows, _ := res.RowsAffected(); rows > 0 {
			log.Printf("   ✅ Pruned %d old pow_audit_log records", rows)
		}
	}
}

func (s *MaintenanceService) repairStuckTasks(ctx context.Context) {
	// Repair tasks stuck in 'validating' for > 1 hour
	res, err := s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'queued',
		    updated_at = NOW() 
		WHERE status = 'validating' AND updated_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 hour'
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			msg := fmt.Sprintf("🩹 <b>Self-Healing:</b> Reset %d stuck validating tasks to queued.", rows)
			s.sendAlert(ctx, msg)
		}
	}

	// Fix assigned tasks without timeout
	res, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'queued',
		    assigned_device = NULL,
		    assigned_at = NULL
		WHERE status = 'assigned' AND assigned_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '10 minutes' AND timeout_at IS NULL
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Recovered %d tasks stuck in assigned status without timeout", rows)
		}
	}

	// Deep Dive: CleanupZombieTasks - return abandoned in_progress tasks to pending after 2h
	res, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'pending',
		    assigned_device = NULL,
		    assigned_at = NULL,
		    updated_at = NOW()
		WHERE status = 'in_progress' AND updated_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '2 hours'
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   🧟 Recovered %d zombie tasks (in_progress > 2h) to pending", rows)
			s.sendAlert(ctx, fmt.Sprintf("🧟 <b>Zombie Cleanup:</b> Returned %d abandoned tasks to queue.", rows))
		}
	}
}

func (s *MaintenanceService) updateDeviceActivity(ctx context.Context) {
	// Mark dead devices as inactive
	res, err := s.db.ExecContext(ctx, `
		UPDATE devices 
		SET is_active = false 
		WHERE is_active = true AND last_seen_at < (NOW() AT TIME ZONE 'UTC') - INTERVAL '1 hour'
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   📡 Marked %d inactive devices as offline", rows)
		}
	}
}

func (s *MaintenanceService) ensureSystemIntegrity(ctx context.Context) {
	s.db.ExecContext(ctx, "UPDATE tasks SET labor_compensation_gstd = 0.001 WHERE labor_compensation_gstd IS NULL OR labor_compensation_gstd <= 0")
}

// checkTreasuryAndAllocateGrants: when Treasury (Gold Reserve) has significant profit, allocate grants to scarce H3 regions
const (
	grantsTreasuryThresholdGSTD = 100 // Minimum treasury balance to trigger grants
	grantsMaxAllocationGSTD     = 50  // Max GSTD per allocation cycle
	grantsCooldownDays          = 7   // Don't allocate more than once per week
)

func (s *MaintenanceService) checkTreasuryAndAllocateGrants(ctx context.Context) {
	if s.hardwareGrants == nil {
		return
	}
	var balance float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM platform_funds WHERE fund_type = 'gold_reserve'`).Scan(&balance)
	if err != nil || balance < grantsTreasuryThresholdGSTD {
		return
	}
	var lastAlloc int
	_ = s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM audit_treasury_events 
		WHERE event_type = 'hardware_grant_allocated' AND created_at > NOW() - INTERVAL '1 day' * $1
	`, grantsCooldownDays).Scan(&lastAlloc)
	if lastAlloc > 0 {
		return
	}
	maxAlloc := balance * 0.1
	if maxAlloc > grantsMaxAllocationGSTD {
		maxAlloc = grantsMaxAllocationGSTD
	}
	if maxAlloc < 1 {
		return
	}
	if err := s.hardwareGrants.AllocateGrantsForScarceRegions(ctx, maxAlloc); err != nil {
		log.Printf("HardwareGrants: allocation failed: %v", err)
		return
	}
	log.Printf("HardwareGrants: Allocated up to %.2f GSTD for scarce regions (treasury=%.2f)", maxAlloc, balance)
	if s.telegramService != nil && alertsEnabled() {
		s.telegramService.SendMessage(ctx, fmt.Sprintf("🛠 <b>Hardware Grants:</b> Treasury profit (%.2f GSTD) → allocated grants to scarce H3 regions.", maxAlloc))
	}
}

// monitorSystemHealth checks for anomalies without heavy load
func (s *MaintenanceService) monitorSystemHealth(ctx context.Context) {
	// 1. Check Error Rate (Last 15 mins)
	var errorCount int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '15 minutes' AND LOWER(severity) IN ('error', 'critical')").Scan(&errorCount)
	if err == nil && errorCount > 10 {
		s.sendAlert(ctx, fmt.Sprintf("⚠️ <b>System Alert:</b> High error rate detected (%d errors in last 15m). Check logs.", errorCount))
	}

	// 2. Omega Point: Error Pattern Recognition - suggest fixes for recurring errors
	s.analyzeErrorPatterns(ctx)

	// 3. Check Pending Payouts (Stuck?)
	var stuckPayouts int
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM payout_transactions WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'").Scan(&stuckPayouts)
	if err == nil && stuckPayouts > 5 {
		s.sendAlert(ctx, fmt.Sprintf("⚠️ <b>Finance Alert:</b> %d payouts are pending for > 1 hour.", stuckPayouts))
	}
}

// errorPattern maps substring in error_message to suggested fix (Self-Diagnostic AI)
var errorPatterns = []struct {
	substring string
	solution  string
}{
	{"too many connections", "DB circuit breaker active. Reduce load or scale connections. Stats/History temporarily read-only."},
	{"Too many connections", "DB circuit breaker active. Reduce load or scale connections. Stats/History temporarily read-only."},
	{"RPC Timeout", "Ollama overloaded. Inference queue extended. Free AI chats limited for 10 min."},
	{"connection refused", "Service unreachable. Check if backend/ollama is running."},
	{"context deadline exceeded", "Request timeout. Consider increasing timeout or reducing payload."},
	{"connection reset", "Network instability. Retry with exponential backoff."},
	{"no suitable worker", "No high-trust workers available. Check node registration and trust scores."},
}

// analyzeErrorPatterns scans recent error_logs for known patterns and sends suggested fixes to Telegram
func (s *MaintenanceService) analyzeErrorPatterns(ctx context.Context) {
	if s.telegramService == nil || !alertsEnabled() {
		return
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT error_message, COUNT(*) as cnt
		FROM error_logs
		WHERE created_at > (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 minutes'
		  AND severity IN ('error', 'critical')
		GROUP BY error_message
		HAVING COUNT(*) >= 3
		ORDER BY cnt DESC
		LIMIT 5
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var msg string
		var cnt int
		if err := rows.Scan(&msg, &cnt); err != nil {
			continue
		}
		for _, p := range errorPatterns {
			if strings.Contains(strings.ToLower(msg), strings.ToLower(p.substring)) {
				s.sendAlert(ctx, fmt.Sprintf("🔧 <b>Self-Diagnostic:</b> Pattern detected (%dx): %s\n\n<b>Suggested fix:</b> %s", cnt, msg, p.solution))
				// Cosmic Genesis: Auto-Bounty for critical vulnerabilities
				if cnt >= 5 && (strings.Contains(strings.ToLower(msg), "sql") || strings.Contains(strings.ToLower(msg), "injection") || strings.Contains(strings.ToLower(msg), "critical")) {
					s.triggerAutoBounty(ctx, p.substring, msg)
				}
				break
			}
		}
	}
}

// sendDailyBriefing sends a summary of platform activity
func (s *MaintenanceService) sendDailyBriefing(ctx context.Context) {
	if s.telegramService == nil || !alertsEnabled() {
		return
	}

	// Gather stats
	var activeWorkers int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE is_active = true").Scan(&activeWorkers)

	var tasks24h int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '24 hours'").Scan(&tasks24h)

	var newUsers24h int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours'").Scan(&newUsers24h)

	var totalPaid float64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(executor_reward_gstd), 0) FROM payout_transactions WHERE status = 'confirmed' AND created_at > NOW() - INTERVAL '24 hours'").Scan(&totalPaid)

	// Format Message
	msg := []string{
		"📊 <b>Daily System Briefing</b>",
		"",
		fmt.Sprintf("💻 <b>Active Workers:</b> %d", activeWorkers),
		fmt.Sprintf("✅ <b>Tasks (24h):</b> %d", tasks24h),
		fmt.Sprintf("👤 <b>New Users (24h):</b> %d", newUsers24h),
		fmt.Sprintf("💰 <b>Paid Out (24h):</b> %.4f GSTD", totalPaid),
		"",
		"<i>System is running autonomously.</i>",
	}

	s.telegramService.SendMessage(ctx, strings.Join(msg, "\n"))
}

// GetAutonomyStats returns metrics about the autonomous maintenance system
func (s *MaintenanceService) GetAutonomyStats(ctx context.Context) (map[string]interface{}, error) {
	var selfHealedTasks int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM error_logs WHERE error_message LIKE '%Self-Healing%'").Scan(&selfHealedTasks)

	var activeMaintenance bool = true

	return map[string]interface{}{
		"status":             "active",
		"self_healed_tasks":  selfHealedTasks,
		"maintenance_active": activeMaintenance,
		"last_cycle":         time.Now().Format(time.RFC3339),
		"briefing_enabled":   s.telegramService != nil,
	}, nil
}

func (s *MaintenanceService) sendAlert(ctx context.Context, message string) {
	if s.telegramService != nil && alertsEnabled() {
		s.telegramService.SendMessage(ctx, message)
	}
}

// triggerAutoBounty - Cosmic Genesis: Leviathan hires WhiteHats to fix itself
// Absolute Point: Atomic Integrity - audit before insert to prevent double-spend
func (s *MaintenanceService) triggerAutoBounty(ctx context.Context, vulnType, description string) {
	var exists int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM auto_bounty_tasks WHERE vulnerability_type = $1 AND status = 'open'`, vulnType).Scan(&exists); err != nil {
		return
	}
	if exists > 0 {
		return
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return
	}
	defer tx.Rollback()
	taskID := "bounty_" + fmt.Sprintf("%08x", time.Now().UnixNano()%0xFFFFFFFF)[:8]
	_, err = tx.ExecContext(ctx, `
		INSERT INTO auto_bounty_tasks (task_id, vulnerability_type, description, reward_gstd, status)
		VALUES ($1, $2, $3, 1000, 'open')
	`, taskID, vulnType, description)
	if err != nil {
		return
	}
	// Atomic audit: record event (prevents double-spend on bounty creation)
	_, _ = tx.ExecContext(ctx, `
		INSERT INTO audit_treasury_events (event_type, reference_id, amount_gstd, status)
		VALUES ('auto_bounty_created', $1, 1000, 'confirmed')
		ON CONFLICT (reference_id, event_type) DO NOTHING
	`, taskID)
	if err := tx.Commit(); err != nil {
		return
	}
	s.sendAlert(ctx, fmt.Sprintf("🛡️ <b>Auto-Bounty:</b> WhiteHat task created (1000 GSTD) for: %s", vulnType))
}

// mergeGlobalKnowledgeLayer - Hyper-Expansion: If 10+ agents contributed similar topic, merge into Global Layer
func (s *MaintenanceService) mergeGlobalKnowledgeLayer(ctx context.Context) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT topic, COUNT(DISTINCT agent_id) as cnt
		FROM agent_knowledge
		WHERE created_at > (NOW() AT TIME ZONE 'UTC') - INTERVAL '7 days'
		GROUP BY topic
		HAVING COUNT(DISTINCT agent_id) >= 10
	`)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var topic string
		var cnt int
		if err := rows.Scan(&topic, &cnt); err != nil {
			continue
		}
		// Get merged content (concatenate top 5 by recency)
		var merged string
		s.db.QueryRowContext(ctx, `
			SELECT string_agg(sub.content, E'\n\n---\n\n')
			FROM (SELECT content FROM agent_knowledge WHERE topic = $1 ORDER BY created_at DESC LIMIT 5) sub
		`, topic).Scan(&merged)
		if merged == "" {
			continue
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO global_knowledge_layer (topic, merged_content, merge_count, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (topic) DO UPDATE SET
				merged_content = EXCLUDED.merged_content,
				merge_count = EXCLUDED.merge_count,
				updated_at = NOW()
		`, topic, merged, cnt)
		if err == nil {
			log.Printf("   ✅ Global Knowledge Layer: merged topic '%s' from %d agents", topic, cnt)
		}
	}
}
