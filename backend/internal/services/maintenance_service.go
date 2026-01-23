package services

import (
	"context"
	"database/sql"
	"log"
	"time"
)

// MaintenanceService handles autonomous platform maintenance tasks
type MaintenanceService struct {
	db          *sql.DB
	taskService *TaskService
	errorLogger *ErrorLogger
}

func NewMaintenanceService(db *sql.DB, taskService *TaskService, errorLogger *ErrorLogger) *MaintenanceService {
	return &MaintenanceService{
		db:          db,
		taskService: taskService,
		errorLogger: errorLogger,
	}
}

// Start starts the autonomous maintenance loop
func (s *MaintenanceService) Start(ctx context.Context) {
	log.Println("🤖 Autonomous Maintenance Service started")
	
	// Different intervals for different tasks
	pruneTicker := time.NewTicker(24 * time.Hour)    // Daily cleanup
	repairTicker := time.NewTicker(30 * time.Minute) // Frequent repairs
	genesisTicker := time.NewTicker(1 * time.Hour)   // Ensure genesis task
	
	defer pruneTicker.Stop()
	defer repairTicker.Stop()
	defer genesisTicker.Stop()

	// Initial run
	s.performMaintenance(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-pruneTicker.C:
			s.pruneOldData(ctx)
		case <-repairTicker.C:
			s.repairStuckTasks(ctx)
			s.updateDeviceActivity(ctx)
		case <-genesisTicker.C:
			s.ensureSystemIntegrity(ctx)
		}
	}
}

func (s *MaintenanceService) performMaintenance(ctx context.Context) {
	log.Println("🛠️ Performing initial maintenance cycle...")
	s.pruneOldData(ctx)
	s.repairStuckTasks(ctx)
	s.updateDeviceActivity(ctx)
	s.ensureSystemIntegrity(ctx)
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
	
	// Note: We DO NOT prune golden_reserve_log as it is needed for historical charting
	// and cumulative total calculations.
}

func (s *MaintenanceService) repairStuckTasks(ctx context.Context) {
	log.Println("🩹 Repairing stuck tasks...")
	
	// Move tasks stuck in 'validating' for > 1 hour back to 'queued' or 'completed' depending on logic
	// For now, if validating exceeds 1 hour, assume validation failure and reset or mark as completed if validation is optional
	res, err := s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'queued',
		    updated_at = NOW() 
		WHERE status = 'validating' AND updated_at < NOW() - INTERVAL '1 hour'
	`)
	if err == nil {
		rows, _ := res.RowsAffected()
		if rows > 0 {
			log.Printf("   ✅ Reset %d tasks stuck in validating status", rows)
		}
	}

	// Double check for tasks in 'assigned' without timeout_at
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
	// Ensure Genesis Task exists
	if s.taskService != nil {
		if err := s.taskService.EnsureGenesisTask(ctx); err != nil {
			log.Printf("   ❌ Genesis Task check failed: %v", err)
		}
	}
	
	// Self-Correction: Fix any null GSTD values in tasks
	s.db.ExecContext(ctx, "UPDATE tasks SET labor_compensation_gstd = 0.001 WHERE labor_compensation_gstd IS NULL OR labor_compensation_gstd <= 0")
}
