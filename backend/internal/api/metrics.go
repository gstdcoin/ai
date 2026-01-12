package api

import (
	"database/sql"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// MetricsService provides Prometheus-compatible metrics
type MetricsService struct {
	db          *sql.DB
	redisClient *redis.Client
	startTime   time.Time
}

// NewMetricsService creates a new metrics service
func NewMetricsService(db *sql.DB, redisClient *redis.Client) *MetricsService {
	return &MetricsService{
		db:          db,
		redisClient: redisClient,
		startTime:   time.Now(),
	}
}

// GetMetrics returns Prometheus-compatible metrics
func (m *MetricsService) GetMetrics() gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		
		// Database metrics
		var dbConnections int
		m.db.QueryRowContext(ctx, "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()").Scan(&dbConnections)
		
		var dbSize int64
		m.db.QueryRowContext(ctx, "SELECT pg_database_size(current_database())").Scan(&dbSize)
		
		// Task metrics
		var totalTasks, pendingTasks, completedTasks, failedTasks int
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks").Scan(&totalTasks)
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'pending'").Scan(&pendingTasks)
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'completed'").Scan(&completedTasks)
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM tasks WHERE status = 'failed'").Scan(&failedTasks)
		
		// Device metrics
		var totalDevices, activeDevices int
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices").Scan(&totalDevices)
		m.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices WHERE is_active = true AND last_seen_at > NOW() - INTERVAL '5 minutes'").Scan(&activeDevices)
		
		// Redis metrics
		redisInfo, _ := m.redisClient.Info(ctx, "stats").Result()
		redisMemory, _ := m.redisClient.Info(ctx, "memory").Result()
		
		// Uptime
		uptime := time.Since(m.startTime).Seconds()
		
		// Prometheus format
		metrics := `# HELP gstd_platform_uptime_seconds Platform uptime in seconds
# TYPE gstd_platform_uptime_seconds gauge
gstd_platform_uptime_seconds ` + formatFloat(uptime) + `

# HELP gstd_database_connections Current database connections
# TYPE gstd_database_connections gauge
gstd_database_connections ` + formatInt(dbConnections) + `

# HELP gstd_database_size_bytes Database size in bytes
# TYPE gstd_database_size_bytes gauge
gstd_database_size_bytes ` + formatInt64(dbSize) + `

# HELP gstd_tasks_total Total number of tasks
# TYPE gstd_tasks_total gauge
gstd_tasks_total ` + formatInt(totalTasks) + `

# HELP gstd_tasks_pending Number of pending tasks
# TYPE gstd_tasks_pending gauge
gstd_tasks_pending ` + formatInt(pendingTasks) + `

# HELP gstd_tasks_completed Number of completed tasks
# TYPE gstd_tasks_completed gauge
gstd_tasks_completed ` + formatInt(completedTasks) + `

# HELP gstd_tasks_failed Number of failed tasks
# TYPE gstd_tasks_failed gauge
gstd_tasks_failed ` + formatInt(failedTasks) + `

# HELP gstd_devices_total Total number of devices
# TYPE gstd_devices_total gauge
gstd_devices_total ` + formatInt(totalDevices) + `

# HELP gstd_devices_active Number of active devices
# TYPE gstd_devices_active gauge
gstd_devices_active ` + formatInt(activeDevices) + `

# Redis info
# ` + redisInfo + `
# ` + redisMemory + `
`
		
		c.Data(http.StatusOK, "text/plain; version=0.0.4", []byte(metrics))
	}
}

func formatFloat(f float64) string {
	return formatInt64(int64(f))
}

func formatInt(i int) string {
	return formatInt64(int64(i))
}

func formatInt64(i int64) string {
	return fmt.Sprintf("%d", i)
}
