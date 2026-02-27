package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// getMonitorSignals returns real progress data for all planetary signals
func getMonitorSignals(svc *services.MonitorSignalService) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := svc.GetAllSignalStats(c.Request.Context())
		if err != nil {
			log.Printf("[MonitorSignals] GetAllSignalStats error: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		// Build response map keyed by signal_id for easy frontend consumption
		signalMap := make(map[string]services.MonitorSignalStats)
		for _, s := range stats {
			signalMap[s.SignalID] = s
		}

		c.JSON(http.StatusOK, gin.H{
			"signals":    signalMap,
			"total":      len(stats),
			"updated_at": time.Now().UTC().Format(time.RFC3339),
		})
	}
}

// getMonitorSignal returns stats for a single signal
func getMonitorSignal(svc *services.MonitorSignalService) gin.HandlerFunc {
	return func(c *gin.Context) {
		signalID := c.Param("id")
		stat, err := svc.GetSignalStats(c.Request.Context(), signalID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Signal not found"})
			return
		}
		c.JSON(http.StatusOK, stat)
	}
}

// sponsorMonitorSignal records a real sponsorship for a planetary signal
func sponsorMonitorSignal(svc *services.MonitorSignalService, db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		signalID := c.Param("id")

		var req struct {
			UserID     string  `json:"user_id"`
			StarsPaid  int     `json:"stars_paid"`
			GSTDReward float64 `json:"gstd_reward"`
			GSTDGold   float64 `json:"gstd_gold_fee"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
			return
		}

		// Create a real task in the tasks table
		taskID := fmt.Sprintf("signal_%s_%s", signalID, uuid.New().String()[:8])
		_, err := db.ExecContext(c.Request.Context(), `
			INSERT INTO tasks (task_id, requester_address, task_type, operation, status, payload, labor_compensation_gstd, created_at, updated_at)
			VALUES ($1, $2, 'signal_analysis', $3, 'pending', $4, $5, NOW(), NOW())
		`, taskID, req.UserID, signalID,
			fmt.Sprintf(`{"signal_id":"%s","stars_paid":%d,"sponsor":"%s"}`, signalID, req.StarsPaid, req.UserID),
			req.GSTDReward)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task: " + err.Error()})
			return
		}

		// Record sponsorship
		err = svc.RecordSponsorship(c.Request.Context(), signalID, req.UserID, req.StarsPaid, req.GSTDReward, req.GSTDGold, taskID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record sponsorship"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"status":    "sponsored",
			"task_id":   taskID,
			"signal_id": signalID,
			"message":   "Signal analysis task created and dispatched to the Swarm",
		})
	}
}
