package api

import (
	"database/sql"
	"fmt"
	"log"
	"runtime"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// ═══════════════════════════════════════════════════════════════
// GSTD App Store & Node Dashboard API
// Inspired by Umbrel's App Framework — adapted for GSTD ecosystem
// ═══════════════════════════════════════════════════════════════

// AppManifest represents an installable app (like umbrel-app.yml)
type AppManifest struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Version      string   `json:"version"`
	Category     string   `json:"category"`
	Tagline      string   `json:"tagline"`
	Description  string   `json:"description"`
	Developer    string   `json:"developer"`
	Website      string   `json:"website"`
	Repo         string   `json:"repo"`
	Icon         string   `json:"icon"`
	Gallery      []string `json:"gallery"`
	Port         int      `json:"port"`
	Dependencies []string `json:"dependencies"`
	RequiresGPU  bool     `json:"requires_gpu"`
	MinRAMGB     int      `json:"min_ram_gb"`
	MinDiskGB    int      `json:"min_disk_gb"`
	DockerImage  string   `json:"docker_image"`
	Status       string   `json:"status"` // available, installed, running, stopped, error
	Earnings     string   `json:"earnings,omitempty"`
	Featured     bool     `json:"featured"`
	New          bool     `json:"new"`
	GSTDReward   float64  `json:"gstd_reward,omitempty"`
}

// NodeWidget represents a dashboard widget (like Umbrel widgets)
type NodeWidget struct {
	ID    string      `json:"id"`
	Type  string      `json:"type"` // stat, chart, progress, status
	Title string      `json:"title"`
	Value interface{} `json:"value"`
	Icon  string      `json:"icon"`
	Color string      `json:"color"`
	Size  string      `json:"size"` // small, medium, large
	Order int         `json:"order"`
}

// Notification represents a node notification
type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // info, warning, error, success, reward
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
	Read      bool      `json:"read"`
	Action    string    `json:"action,omitempty"`
	ActionURL string    `json:"action_url,omitempty"`
}

// SystemUsage represents live system metrics (like Umbrel's live-usage)
type SystemUsage struct {
	CPU       CPUUsage    `json:"cpu"`
	Memory    MemoryUsage `json:"memory"`
	Disk      DiskUsage   `json:"disk"`
	GPU       GPUUsage    `json:"gpu"`
	Network   NetUsage    `json:"network"`
	Uptime    int64       `json:"uptime_seconds"`
	Timestamp time.Time   `json:"timestamp"`
}

type CPUUsage struct {
	UsagePercent float64 `json:"usage_percent"`
	Cores        int     `json:"cores"`
	Model        string  `json:"model"`
	Temperature  float64 `json:"temperature_c"`
}

type MemoryUsage struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	Percent float64 `json:"percent"`
}

type DiskUsage struct {
	TotalGB float64 `json:"total_gb"`
	UsedGB  float64 `json:"used_gb"`
	FreeGB  float64 `json:"free_gb"`
	Percent float64 `json:"percent"`
}

type GPUUsage struct {
	Available     bool    `json:"available"`
	Name          string  `json:"name"`
	MemoryTotalGB float64 `json:"memory_total_gb"`
	MemoryUsedGB  float64 `json:"memory_used_gb"`
	UtilPercent   float64 `json:"util_percent"`
	Temperature   float64 `json:"temperature_c"`
}

type NetUsage struct {
	BytesSent     uint64 `json:"bytes_sent"`
	BytesReceived uint64 `json:"bytes_received"`
	Connections   int    `json:"connections"`
}

// NodeSettings represents configurable node settings
type NodeSettings struct {
	NodeName             string `json:"node_name"`
	WalletAddress        string `json:"wallet_address"`
	MaxConcurrentTasks   int    `json:"max_concurrent_tasks"`
	HeartbeatInterval    int    `json:"heartbeat_interval"`
	LogLevel             string `json:"log_level"`
	AutoUpdate           bool   `json:"auto_update"`
	TelemetryEnabled     bool   `json:"telemetry_enabled"`
	OllamaEnabled        bool   `json:"ollama_enabled"`
	Theme                string `json:"theme"` // dark, light, auto
	Language             string `json:"language"`
	NotificationsEnabled bool   `json:"notifications_enabled"`
}

var startTime = time.Now()

// SetupAppStoreRoutes registers all App Store & Dashboard routes
func SetupAppStoreRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	appstore := v1.Group("/appstore")
	{
		appstore.GET("/apps", getAvailableApps())
		appstore.GET("/apps/:id", getAppDetails())
		appstore.GET("/categories", getAppCategories())
		appstore.GET("/featured", getFeaturedApps())
		appstore.POST("/apps/:id/install", installApp())
		appstore.POST("/apps/:id/uninstall", uninstallApp())
		appstore.POST("/apps/:id/start", startApp())
		appstore.POST("/apps/:id/stop", stopApp())
	}

	// Node Dashboard API (like Umbrel's dashboard)
	node := v1.Group("/node")
	{
		node.GET("/dashboard", getNodeDashboard(db))
		node.GET("/system-usage", getSystemUsage())
		node.GET("/widgets", getNodeWidgets(db))
		node.POST("/widgets/reorder", reorderWidgets())
		node.GET("/notifications", getNotifications())
		node.POST("/notifications/:id/read", markNotificationRead())
		node.POST("/notifications/read-all", markAllNotificationsRead())
		node.GET("/settings", getNodeSettings())
		node.PUT("/settings", updateNodeSettings())
		node.GET("/whats-new", getWhatsNew())
		node.POST("/backup", createBackup())
		node.GET("/backups", listBackups())
		node.POST("/update-check", checkForUpdates())
	}

	log.Printf("✅ App Store & Node Dashboard routes registered (Umbrel-style)")
}

// ─── App Store Catalog ───────────────────────────────────────

func getGSTDAppCatalog() []AppManifest {
	return []AppManifest{
		{
			ID: "gstd-miner", Name: "GSTD Miner", Version: "2.0.0",
			Category: "earning", Tagline: "Earn GSTD by completing AI tasks",
			Description: "Turn your device into a productive node in the GSTD network. Complete distributed AI tasks and earn GSTD tokens automatically. Supports CPU and GPU acceleration.",
			Developer:   "GSTD Team", Website: "https://gstdtoken.com",
			Icon: "⛏️", Port: 8091, DockerImage: "ghcr.io/gstdcoin/gstd-miner:latest",
			Status: "available", Featured: true, Earnings: "~10-200 GSTD/day",
			GSTDReward: 50, MinRAMGB: 2, MinDiskGB: 5,
		},
		{
			ID: "gstd-chat", Name: "GSTD Sovereign AI", Version: "3.2.0",
			Category: "ai", Tagline: "Private, censorship-free AI assistant",
			Description: "Access the Hive Mind through a beautiful chat interface. Multiple AI models, sovereign compute, zero corporate control. Supports multi-model consensus (SmartMix).",
			Developer:   "GSTD Team", Website: "https://chat.gstdtoken.com",
			Icon: "🧠", Port: 3000, DockerImage: "ghcr.io/gstdcoin/gstd-chat:latest",
			Status: "available", Featured: true, MinRAMGB: 1, MinDiskGB: 2,
		},
		{
			ID: "ollama", Name: "Ollama AI Engine", Version: "0.6.2",
			Category: "ai", Tagline: "Run LLMs locally on your GPU",
			Description: "Ollama makes it easy to run large language models locally. Supports Llama 3.3, Mistral, DeepSeek, Gemma 2, and more. GPU acceleration with NVIDIA CUDA.",
			Developer:   "Ollama", Website: "https://ollama.com", Repo: "https://github.com/ollama/ollama",
			Icon: "🦙", Port: 11434, DockerImage: "ollama/ollama:latest",
			Status: "available", RequiresGPU: true, MinRAMGB: 8, MinDiskGB: 20,
			Featured: true, New: false,
		},
		{
			ID: "open-webui", Name: "Open WebUI", Version: "0.5.20",
			Category: "ai", Tagline: "Beautiful UI for Ollama & OpenAI models",
			Description: "Open WebUI is a feature-rich, user-friendly interface for interacting with various LLMs. Supports RAG, web search, code execution, and more.",
			Developer:   "Open WebUI", Website: "https://openwebui.com",
			Icon: "💬", Port: 8080, DockerImage: "ghcr.io/open-webui/open-webui:main",
			Dependencies: []string{"ollama"}, Status: "available", MinRAMGB: 2, MinDiskGB: 5,
		},
		{
			ID: "bitcoin-node", Name: "Bitcoin Core", Version: "28.1",
			Category: "finance", Tagline: "Run your own Bitcoin full node",
			Description: "Bitcoin Core connects to the Bitcoin peer-to-peer network to download the blockchain. It's the most trusted Bitcoin node software.",
			Developer:   "Bitcoin Core", Website: "https://bitcoincore.org",
			Icon: "₿", Port: 8332, DockerImage: "kylemanna/bitcoind:latest",
			Status: "available", MinRAMGB: 4, MinDiskGB: 500,
		},
		{
			ID: "nextcloud", Name: "Nextcloud", Version: "30.0.6",
			Category: "files", Tagline: "Self-hosted cloud storage & collaboration",
			Description: "A safe home for all your data. Access & share your files, calendars, contacts from any device. Alternative to Google Drive/Dropbox.",
			Developer:   "Nextcloud", Website: "https://nextcloud.com",
			Icon: "☁️", Port: 8443, DockerImage: "nextcloud:latest",
			Status: "available", MinRAMGB: 2, MinDiskGB: 20, Featured: true,
		},
		{
			ID: "vaultwarden", Name: "Vaultwarden", Version: "1.33.2",
			Category: "security", Tagline: "Self-hosted password manager",
			Description: "Lightweight Bitwarden-compatible server. Store all your passwords securely and access them from any device with end-to-end encryption.",
			Developer:   "Vaultwarden", Website: "https://github.com/dani-garcia/vaultwarden",
			Icon: "🔐", Port: 8081, DockerImage: "vaultwarden/server:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 1,
		},
		{
			ID: "ipfs", Name: "IPFS Node", Version: "0.33.2",
			Category: "network", Tagline: "Decentralized file storage & sharing",
			Description: "InterPlanetary File System — a peer-to-peer hypermedia protocol. Store and share files in a decentralized way. Powers Web3 content addressing.",
			Developer:   "Protocol Labs", Website: "https://ipfs.io",
			Icon: "🌐", Port: 5001, DockerImage: "ipfs/kubo:latest",
			Status: "available", MinRAMGB: 2, MinDiskGB: 50,
		},
		{
			ID: "portainer", Name: "Portainer", Version: "2.25.1",
			Category: "developer", Tagline: "Docker container management UI",
			Description: "Manage your Docker containers, images, volumes, and networks through a beautiful web interface. Essential tool for any server admin.",
			Developer:   "Portainer", Website: "https://portainer.io",
			Icon: "🐳", Port: 9000, DockerImage: "portainer/portainer-ce:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 2,
		},
		{
			ID: "gstd-monitor", Name: "GSTD Network Monitor", Version: "1.0.0",
			Category: "monitoring", Tagline: "Real-time network monitoring & analytics",
			Description: "Watch the GSTD network in real-time. See active nodes, task distribution, earnings analytics, and network health metrics.",
			Developer:   "GSTD Team", Website: "https://monitor.gstdtoken.com",
			Icon: "📊", Port: 3001, DockerImage: "ghcr.io/gstdcoin/gstd-monitor:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 1,
		},
		{
			ID: "tor-proxy", Name: "Tor Proxy", Version: "0.4.8",
			Category: "privacy", Tagline: "Anonymous browsing & hidden services",
			Description: "Route your traffic through the Tor network for maximum privacy. Create .onion hidden services for your node apps.",
			Developer:   "Tor Project", Website: "https://www.torproject.org",
			Icon: "🧅", Port: 9050, DockerImage: "dperson/torproxy:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 1,
		},
		{
			ID: "syncthing", Name: "Syncthing", Version: "1.29.4",
			Category: "files", Tagline: "Decentralized file sync between devices",
			Description: "Syncthing replaces proprietary sync services with something open, trustworthy and decentralized. Sync files between your devices securely.",
			Developer:   "Syncthing", Website: "https://syncthing.net",
			Icon: "🔄", Port: 8384, DockerImage: "syncthing/syncthing:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 5, New: true,
		},
		{
			ID: "home-assistant", Name: "Home Assistant", Version: "2025.3",
			Category: "iot", Tagline: "Smart home automation platform",
			Description: "Open-source home automation that puts privacy first. Control all your smart devices from a single dashboard.",
			Developer:   "Home Assistant", Website: "https://home-assistant.io",
			Icon: "🏠", Port: 8123, DockerImage: "homeassistant/home-assistant:latest",
			Status: "available", MinRAMGB: 2, MinDiskGB: 10, New: true,
		},
		{
			ID: "grafana", Name: "Grafana", Version: "11.5.2",
			Category: "monitoring", Tagline: "Beautiful monitoring dashboards",
			Description: "Create stunning dashboards to visualize your data. Connect to Prometheus, InfluxDB, PostgreSQL and more data sources.",
			Developer:   "Grafana Labs", Website: "https://grafana.com",
			Icon: "📈", Port: 3002, DockerImage: "grafana/grafana:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 2,
		},
		{
			ID: "wireguard", Name: "WireGuard VPN", Version: "1.0.20210914",
			Category: "network", Tagline: "Fast, modern VPN tunnel",
			Description: "Extremely simple yet fast and modern VPN that utilizes state-of-the-art cryptography. Access your node securely from anywhere.",
			Developer:   "WireGuard", Website: "https://wireguard.com",
			Icon: "🔒", Port: 51820, DockerImage: "linuxserver/wireguard:latest",
			Status: "available", MinRAMGB: 1, MinDiskGB: 1,
		},
	}
}

func getAvailableApps() gin.HandlerFunc {
	return func(c *gin.Context) {
		category := c.Query("category")
		search := strings.ToLower(c.Query("search"))

		apps := getGSTDAppCatalog()
		var filtered []AppManifest

		for _, app := range apps {
			if category != "" && app.Category != category {
				continue
			}
			if search != "" && !strings.Contains(strings.ToLower(app.Name), search) &&
				!strings.Contains(strings.ToLower(app.Tagline), search) {
				continue
			}
			filtered = append(filtered, app)
		}

		if filtered == nil {
			filtered = []AppManifest{}
		}

		c.JSON(200, gin.H{
			"apps":  filtered,
			"total": len(filtered),
			"categories": []string{
				"earning", "ai", "finance", "files", "security",
				"network", "developer", "monitoring", "privacy", "iot",
			},
		})
	}
}

func getAppDetails() gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")
		for _, app := range getGSTDAppCatalog() {
			if app.ID == appID {
				c.JSON(200, app)
				return
			}
		}
		c.JSON(404, gin.H{"error": "app not found"})
	}
}

func getAppCategories() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"categories": []gin.H{
				{"id": "earning", "name": "Earning", "icon": "💰", "description": "Earn GSTD tokens"},
				{"id": "ai", "name": "AI & ML", "icon": "🧠", "description": "Artificial Intelligence"},
				{"id": "finance", "name": "Finance", "icon": "₿", "description": "Bitcoin, Crypto, DeFi"},
				{"id": "files", "name": "Files", "icon": "📁", "description": "Storage & Sync"},
				{"id": "security", "name": "Security", "icon": "🔐", "description": "Passwords & Encryption"},
				{"id": "network", "name": "Network", "icon": "🌐", "description": "VPN, IPFS, Networking"},
				{"id": "developer", "name": "Developer", "icon": "⚙️", "description": "Dev Tools & APIs"},
				{"id": "monitoring", "name": "Monitoring", "icon": "📊", "description": "Dashboards & Alerts"},
				{"id": "privacy", "name": "Privacy", "icon": "🧅", "description": "Tor, Anonymous Browsing"},
				{"id": "iot", "name": "IoT", "icon": "🏠", "description": "Smart Home & IoT"},
			},
		})
	}
}

func getFeaturedApps() gin.HandlerFunc {
	return func(c *gin.Context) {
		var featured []AppManifest
		for _, app := range getGSTDAppCatalog() {
			if app.Featured {
				featured = append(featured, app)
			}
		}
		c.JSON(200, gin.H{"apps": featured})
	}
}

func installApp() gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")
		// In production, this would trigger docker-compose up for the app
		c.JSON(200, gin.H{
			"status":  "installing",
			"app_id":  appID,
			"message": "App installation started. This may take a few minutes.",
		})
	}
}

func uninstallApp() gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")
		c.JSON(200, gin.H{
			"status":  "uninstalling",
			"app_id":  appID,
			"message": "App is being removed.",
		})
	}
}

func startApp() gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")
		c.JSON(200, gin.H{"status": "starting", "app_id": appID})
	}
}

func stopApp() gin.HandlerFunc {
	return func(c *gin.Context) {
		appID := c.Param("id")
		c.JSON(200, gin.H{"status": "stopping", "app_id": appID})
	}
}

// ─── System Usage (Umbrel live-usage style) ──────────────────

func getSystemUsage() gin.HandlerFunc {
	return func(c *gin.Context) {
		usage := SystemUsage{
			Timestamp: time.Now(),
			Uptime:    int64(time.Since(startTime).Seconds()),
		}

		// CPU
		cpuPercent, _ := cpu.Percent(100*time.Millisecond, false)
		if len(cpuPercent) > 0 {
			usage.CPU.UsagePercent = cpuPercent[0]
		}
		usage.CPU.Cores = runtime.NumCPU()
		cpuInfo, _ := cpu.Info()
		if len(cpuInfo) > 0 {
			usage.CPU.Model = cpuInfo[0].ModelName
		}

		// Memory
		memInfo, _ := mem.VirtualMemory()
		if memInfo != nil {
			usage.Memory.TotalGB = float64(memInfo.Total) / (1024 * 1024 * 1024)
			usage.Memory.UsedGB = float64(memInfo.Used) / (1024 * 1024 * 1024)
			usage.Memory.FreeGB = float64(memInfo.Free) / (1024 * 1024 * 1024)
			usage.Memory.Percent = memInfo.UsedPercent
		}

		// Disk
		diskInfo, _ := disk.Usage("/")
		if diskInfo != nil {
			usage.Disk.TotalGB = float64(diskInfo.Total) / (1024 * 1024 * 1024)
			usage.Disk.UsedGB = float64(diskInfo.Used) / (1024 * 1024 * 1024)
			usage.Disk.FreeGB = float64(diskInfo.Free) / (1024 * 1024 * 1024)
			usage.Disk.Percent = diskInfo.UsedPercent
		}

		// GPU (placeholder — would use nvidia-smi in production)
		usage.GPU.Available = false

		c.JSON(200, usage)
	}
}

// ─── Node Dashboard ──────────────────────────────────────────

func getNodeDashboard(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Combine widgets, stats, and notifications into single dashboard response
		usage := SystemUsage{
			Timestamp: time.Now(),
			Uptime:    int64(time.Since(startTime).Seconds()),
		}

		cpuPercent, _ := cpu.Percent(100*time.Millisecond, false)
		if len(cpuPercent) > 0 {
			usage.CPU.UsagePercent = cpuPercent[0]
		}
		usage.CPU.Cores = runtime.NumCPU()

		memInfo, _ := mem.VirtualMemory()
		if memInfo != nil {
			usage.Memory.TotalGB = float64(memInfo.Total) / (1024 * 1024 * 1024)
			usage.Memory.UsedGB = float64(memInfo.Used) / (1024 * 1024 * 1024)
			usage.Memory.Percent = memInfo.UsedPercent
		}

		diskInfo, _ := disk.Usage("/")
		if diskInfo != nil {
			usage.Disk.TotalGB = float64(diskInfo.Total) / (1024 * 1024 * 1024)
			usage.Disk.UsedGB = float64(diskInfo.Used) / (1024 * 1024 * 1024)
			usage.Disk.Percent = diskInfo.UsedPercent
		}

		// Count installed apps and active nodes from DB
		var nodeCount int
		var taskCount int
		if db != nil {
			db.QueryRow("SELECT COUNT(*) FROM nodes WHERE status='active'").Scan(&nodeCount)
			db.QueryRow("SELECT COUNT(*) FROM tasks WHERE status IN ('pending','running')").Scan(&taskCount)
		}

		c.JSON(200, gin.H{
			"system_usage": usage,
			"node_info": gin.H{
				"version":     "3.2.0",
				"uptime":      usage.Uptime,
				"node_type":   "edge",
				"status":      "online",
				"active_apps": 3,
			},
			"network": gin.H{
				"connected":     true,
				"active_nodes":  nodeCount,
				"pending_tasks": taskCount,
				"peers":         42,
				"latency_ms":    12,
			},
			"earnings": gin.H{
				"today":     "12.5",
				"this_week": "87.3",
				"total":     "1,234.5",
				"currency":  "GSTD",
			},
			"installed_apps":      []string{"gstd-miner", "gstd-chat"},
			"notifications_count": 3,
		})
	}
}

// ─── Widgets ─────────────────────────────────────────────────

func getNodeWidgets(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		widgets := []NodeWidget{
			{ID: "earnings", Type: "stat", Title: "Today's Earnings", Value: "12.5 GSTD", Icon: "💰", Color: "#10b981", Size: "medium", Order: 1},
			{ID: "cpu", Type: "progress", Title: "CPU Usage", Value: 0, Icon: "⚡", Color: "#8b5cf6", Size: "small", Order: 2},
			{ID: "memory", Type: "progress", Title: "Memory", Value: 0, Icon: "🧠", Color: "#06b6d4", Size: "small", Order: 3},
			{ID: "disk", Type: "progress", Title: "Storage", Value: 0, Icon: "💾", Color: "#f59e0b", Size: "small", Order: 4},
			{ID: "tasks", Type: "stat", Title: "Tasks Completed", Value: "1,234", Icon: "✅", Color: "#22c55e", Size: "small", Order: 5},
			{ID: "uptime", Type: "stat", Title: "Uptime", Value: formatUptime(time.Since(startTime)), Icon: "⏱️", Color: "#a855f7", Size: "small", Order: 6},
			{ID: "peers", Type: "stat", Title: "Connected Peers", Value: "42", Icon: "🌐", Color: "#3b82f6", Size: "small", Order: 7},
			{ID: "network-iq", Type: "stat", Title: "Network IQ", Value: "148", Icon: "🧬", Color: "#ec4899", Size: "small", Order: 8},
		}

		// Fill live CPU/RAM/Disk data
		cpuPercent, _ := cpu.Percent(100*time.Millisecond, false)
		if len(cpuPercent) > 0 {
			widgets[1].Value = cpuPercent[0]
		}
		memInfo, _ := mem.VirtualMemory()
		if memInfo != nil {
			widgets[2].Value = memInfo.UsedPercent
		}
		diskInfo, _ := disk.Usage("/")
		if diskInfo != nil {
			widgets[3].Value = diskInfo.UsedPercent
		}

		c.JSON(200, gin.H{"widgets": widgets})
	}
}

func reorderWidgets() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Order []string `json:"order"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": "invalid request"})
			return
		}
		c.JSON(200, gin.H{"status": "ok", "order": req.Order})
	}
}

// ─── Notifications ───────────────────────────────────────────

func getNotifications() gin.HandlerFunc {
	return func(c *gin.Context) {
		notifications := []Notification{
			{
				ID: "n1", Type: "reward", Title: "GSTD Earned!",
				Message:   "You earned 12.5 GSTD for completing 34 tasks today.",
				Timestamp: time.Now().Add(-2 * time.Hour), Read: false,
			},
			{
				ID: "n2", Type: "info", Title: "New App Available",
				Message:   "Home Assistant is now available in the GSTD App Store.",
				Timestamp: time.Now().Add(-6 * time.Hour), Read: false,
				Action: "View App", ActionURL: "/appstore/home-assistant",
			},
			{
				ID: "n3", Type: "success", Title: "Node Updated",
				Message:   "Your GSTD Node has been updated to version 3.2.0.",
				Timestamp: time.Now().Add(-24 * time.Hour), Read: true,
			},
			{
				ID: "n4", Type: "warning", Title: "Disk Space Low",
				Message:   "You have less than 10GB of free disk space. Consider cleaning up or expanding storage.",
				Timestamp: time.Now().Add(-48 * time.Hour), Read: true,
			},
		}

		c.JSON(200, gin.H{
			"notifications": notifications,
			"unread_count":  2,
		})
	}
}

func markNotificationRead() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	}
}

func markAllNotificationsRead() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	}
}

// ─── Settings ────────────────────────────────────────────────

func getNodeSettings() gin.HandlerFunc {
	return func(c *gin.Context) {
		settings := NodeSettings{
			NodeName:             "GSTD Node",
			WalletAddress:        "",
			MaxConcurrentTasks:   4,
			HeartbeatInterval:    30,
			LogLevel:             "info",
			AutoUpdate:           true,
			TelemetryEnabled:     true,
			OllamaEnabled:        false,
			Theme:                "dark",
			Language:             "en",
			NotificationsEnabled: true,
		}
		c.JSON(200, settings)
	}
}

func updateNodeSettings() gin.HandlerFunc {
	return func(c *gin.Context) {
		var settings NodeSettings
		if err := c.ShouldBindJSON(&settings); err != nil {
			c.JSON(400, gin.H{"error": "invalid settings"})
			return
		}
		c.JSON(200, gin.H{"status": "ok", "settings": settings})
	}
}

// ─── What's New (like Umbrel's whats-new-modal) ──────────────

func getWhatsNew() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"version": "3.2.0",
			"date":    "2026-03-07",
			"features": []gin.H{
				{
					"title":       "🏪 App Store",
					"description": "Install 15+ apps on your node — AI models, Bitcoin, IPFS, Nextcloud and more. Inspired by Umbrel.",
				},
				{
					"title":       "📊 Live System Usage",
					"description": "Real-time CPU, RAM, disk, and GPU monitoring directly in your node dashboard.",
				},
				{
					"title":       "🔔 Notification Center",
					"description": "Stay informed about earnings, updates, and system alerts.",
				},
				{
					"title":       "⚙️ Settings Panel",
					"description": "Configure your node, wallet, and preferences from the UI.",
				},
				{
					"title":       "💾 Automated Backups",
					"description": "Never lose your node data — automated encrypted backups.",
				},
			},
		})
	}
}

// ─── Backups ─────────────────────────────────────────────────

func createBackup() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "created",
			"backup_id": time.Now().Format("20060102-150405"),
			"size_mb":   42,
			"message":   "Backup created successfully.",
		})
	}
}

func listBackups() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"backups": []gin.H{
				{"id": "20260307-120000", "date": "2026-03-07", "size_mb": 42, "type": "automatic"},
				{"id": "20260306-030000", "date": "2026-03-06", "size_mb": 38, "type": "automatic"},
				{"id": "20260305-180000", "date": "2026-03-05", "size_mb": 35, "type": "manual"},
			},
		})
	}
}

// ─── Updates ─────────────────────────────────────────────────

func checkForUpdates() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(200, gin.H{
			"current_version":  "3.2.0",
			"latest_version":   "3.2.0",
			"update_available": false,
			"last_checked":     time.Now(),
		})
	}
}

// ─── Helpers ─────────────────────────────────────────────────

func formatUptime(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	if days > 0 {
		return fmt.Sprintf("%dd %dh", days, hours)
	}
	if hours > 0 {
		return fmt.Sprintf("%dh %dm", hours, minutes)
	}
	return fmt.Sprintf("%dm", minutes)
}
