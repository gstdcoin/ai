package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"
)

// MaintenanceService handles autonomous platform maintenance and acts as a personal assistant
type MaintenanceService struct {
	db              *sql.DB
	taskService     *TaskService
	errorLogger     *ErrorLogger
	telegramService *TelegramService
}

func NewMaintenanceService(db *sql.DB, taskService *TaskService, errorLogger *ErrorLogger, telegramService *TelegramService) *MaintenanceService {
	return &MaintenanceService{
		db:              db,
		taskService:     taskService,
		errorLogger:     errorLogger,
		telegramService: telegramService,
	}
}

// Start starts the autonomous maintenance loop
func (s *MaintenanceService) Start(ctx context.Context) {
	log.Println("🤖 Autonomous Assistant & Maintenance Service started")

	// Send startup notification
	if s.telegramService != nil {
		s.telegramService.SendMessage(ctx, "🤖 <b>System Assistant Online</b>\nI am now monitoring the GSTD platform. I will handle maintenance and keep you updated.")
	}

	// Different intervals for different tasks
	pruneTicker := time.NewTicker(24 * time.Hour)      // Daily cleanup
	briefingTicker := time.NewTicker(24 * time.Hour)   // Daily Report
	repairTicker := time.NewTicker(30 * time.Minute)   // Frequent repairs
	monitorTicker := time.NewTicker(15 * time.Minute)  // System Health Pulse

	defer pruneTicker.Stop()
	defer briefingTicker.Stop()
	defer repairTicker.Stop()

	defer monitorTicker.Stop()

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

		case <-monitorTicker.C:
			s.monitorSystemHealth(ctx)
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
	res, err := s.db.ExecContext(ctx, "DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '30 days'")
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Pruned %d old error logs", rows)
		}
	}

	// Delete network measurements older than 30 days
	res, err = s.db.ExecContext(ctx, "DELETE FROM network_measurements WHERE recorded_at < NOW() - INTERVAL '30 days'")
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Pruned %d old network measurements", rows)
		}
	}

	// Delete old wallet access logs
	s.db.ExecContext(ctx, "DELETE FROM wallet_access_logs WHERE accessed_at < NOW() - INTERVAL '30 days'")
}

func (s *MaintenanceService) repairStuckTasks(ctx context.Context) {
	// Repair tasks stuck in 'validating' for > 1 hour
	res, err := s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'queued',
		    updated_at = NOW() 
		WHERE status = 'validating' AND updated_at < NOW() - INTERVAL '1 hour'
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
		WHERE status = 'assigned' AND assigned_at < NOW() - INTERVAL '10 minutes' AND timeout_at IS NULL
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Recovered %d tasks stuck in assigned status without timeout", rows)
		}
	}
}

func (s *MaintenanceService) updateDeviceActivity(ctx context.Context) {
	// Mark dead devices as inactive
	res, err := s.db.ExecContext(ctx, `
		UPDATE devices 
		SET is_active = false 
		WHERE is_active = true AND last_seen_at < NOW() - INTERVAL '1 hour'
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

// monitorSystemHealth checks for anomalies without heavy load
func (s *MaintenanceService) monitorSystemHealth(ctx context.Context) {
	// 1. Check Error Rate (Last 15 mins)
	var errorCount int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '15 minutes' AND severity = 'ERROR'").Scan(&errorCount)
	if err == nil && errorCount > 10 {
		s.sendAlert(ctx, fmt.Sprintf("⚠️ <b>System Alert:</b> High error rate detected (%d errors in last 15m). Check logs.", errorCount))
	}

	// 2. Check Pending Payouts (Stuck?)
	var stuckPayouts int
	err = s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM payout_transactions WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour'").Scan(&stuckPayouts)
	if err == nil && stuckPayouts > 5 {
		s.sendAlert(ctx, fmt.Sprintf("⚠️ <b>Finance Alert:</b> %d payouts are pending for > 1 hour.", stuckPayouts))
	}
}

// sendDailyBriefing sends a summary of platform activity
func (s *MaintenanceService) sendDailyBriefing(ctx context.Context) {
	if s.telegramService == nil {
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
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount), 0) FROM payout_transactions WHERE status = 'confirmed' AND created_at > NOW() - INTERVAL '24 hours'").Scan(&totalPaid)

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
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM error_logs WHERE message LIKE '%Self-Healing%'").Scan(&selfHealedTasks)

	var activeMaintenance bool = true

	return map[string]interface{}{
		"status":              "active",
		"self_healed_tasks":   selfHealedTasks,
		"maintenance_active": activeMaintenance,
		"last_cycle":         time.Now().Format(time.RFC3339),
		"briefing_enabled":   s.telegramService != nil,
	}, nil
}

func (s *MaintenanceService) sendAlert(ctx context.Context, message string) {
	if s.telegramService != nil {
		s.telegramService.SendMessage(ctx, message)
	}
}
