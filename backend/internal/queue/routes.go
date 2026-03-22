package queue

// ═══════════════════════════════════════════════════════════════
// Queue API Routes — monitoring endpoints for the task queue
// Exposes queue health statistics at /api/v1/queue/stats
// ═══════════════════════════════════════════════════════════════

import (
	"github.com/gin-gonic/gin"
)

// RegisterQueueRoutes adds queue monitoring endpoints to the API
func RegisterQueueRoutes(v1 *gin.RouterGroup, mgr *TaskQueueManager) {
	if mgr == nil {
		return
	}

	queueGroup := v1.Group("/queue")
	{
		queueGroup.GET("/stats", func(c *gin.Context) {
			stats := mgr.GetQueueStats()
			c.JSON(200, gin.H{
				"status":          "healthy",
				"engine":          "asynq",
				"active_tasks":    stats.ActiveTasks,
				"pending_tasks":   stats.PendingTasks,
				"scheduled_tasks": stats.ScheduledTasks,
				"retry_tasks":     stats.RetryTasks,
				"archived_tasks":  stats.ArchivedTasks,
				"completed_tasks": stats.CompletedTasks,
				"queues":          []string{"critical", "default", "low"},
			})
		})
	}
}
