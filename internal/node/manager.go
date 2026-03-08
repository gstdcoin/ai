// Package node implements node management, autostart logic,
// and the Zero GSTD → Worker Mode automatic enrollment.
package node

import (
	"context"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// Mode defines the operating mode of a node.
type Mode string

const (
	ModeEarn   Mode = "earn"   // No GSTD; contributing compute for rewards
	ModeClient Mode = "client" // Has GSTD; consuming AI services
	ModeHybrid Mode = "hybrid" // Both earning and consuming
)

// WorkerConfig configures the worker node behavior.
type WorkerConfig struct {
	Mode      Mode     `json:"mode"`
	MaxCPU    int      `json:"max_cpu"` // % CPU for swarm (0-100)
	MaxMemGB  int      `json:"max_mem_gb"`
	AutoStake bool     `json:"auto_stake"` // auto-stake earned GSTD
	Models    []string `json:"models"`     // models this node can serve
}

// NodeStatus represents current node state.
type NodeStatus struct {
	NodeID      string     `json:"node_id"`
	Mode        Mode       `json:"mode"`
	IsActive    bool       `json:"is_active"`
	TasksToday  int        `json:"tasks_today"`
	EarnedToday float64    `json:"earned_today"` // GSTD
	TotalEarned float64    `json:"total_earned"`
	Uptime      float64    `json:"uptime"` // percentage
	GSTDBalance float64    `json:"gstd_balance"`
	StartedAt   time.Time  `json:"started_at"`
	LastTaskAt  *time.Time `json:"last_task_at,omitempty"`
	CPUUsage    float64    `json:"cpu_usage"`
	MemUsageMB  int64      `json:"mem_usage_mb"`
}

// SystemCapabilities describes what this device can do.
type SystemCapabilities struct {
	CPUCores    int     `json:"cpu_cores"`
	TotalMemGB  float64 `json:"total_mem_gb"`
	HasGPU      bool    `json:"has_gpu"`
	GPUModel    string  `json:"gpu_model,omitempty"`
	GPUMemGB    float64 `json:"gpu_mem_gb,omitempty"`
	DiskFreeGB  float64 `json:"disk_free_gb"`
	NetworkMbps float64 `json:"network_mbps"`
	OS          string  `json:"os"`
	Arch        string  `json:"arch"`
}

// ─── Node Manager ───────────────────────────────────────────────────────────

// NodeManager orchestrates node lifecycle and auto-enrollment.
type NodeManager struct {
	nodeID     string
	walletAddr string
	status     *NodeStatus
	config     *WorkerConfig
	caps       *SystemCapabilities
	mu         sync.RWMutex

	// Dependencies (injected)
	tonBalanceChecker func(ctx context.Context, addr string) (float64, error)
	onModeChange      func(mode Mode)
}

// NewNodeManager creates a new node manager.
func NewNodeManager(nodeID, walletAddr string) *NodeManager {
	caps := detectCapabilities()

	return &NodeManager{
		nodeID:     nodeID,
		walletAddr: walletAddr,
		status: &NodeStatus{
			NodeID:   nodeID,
			IsActive: false,
		},
		caps: caps,
	}
}

// SetBalanceChecker sets the function used to check GSTD balance.
func (n *NodeManager) SetBalanceChecker(checker func(ctx context.Context, addr string) (float64, error)) {
	n.tonBalanceChecker = checker
}

// SetModeChangeHandler sets the callback for mode changes.
func (n *NodeManager) SetModeChangeHandler(handler func(mode Mode)) {
	n.onModeChange = handler
}

// ─── Auto-Start Logic ───────────────────────────────────────────────────────

// CheckAndAutoStart implements the core flywheel:
// No GSTD → start earning as worker → accumulate GSTD → use AI services
func (n *NodeManager) CheckAndAutoStart(ctx context.Context) error {
	if n.tonBalanceChecker == nil {
		return fmt.Errorf("balance checker not configured")
	}

	balance, err := n.tonBalanceChecker(ctx, n.walletAddr)
	if err != nil {
		log.Printf("[Node] Error checking GSTD balance: %v", err)
		return err
	}

	n.mu.Lock()
	defer n.mu.Unlock()
	n.status.GSTDBalance = balance

	if balance == 0 {
		// No GSTD → auto-start as worker to earn
		log.Printf("[Node] 🔱 No GSTD found for wallet %s. Starting as worker node to earn...", n.walletAddr)

		config := n.autoConfig()
		return n.startWorkerMode(ctx, config)
	}

	// Has GSTD → normal client mode
	log.Printf("[Node] ✅ GSTD balance: %.2f. Starting client mode.", balance)
	return n.startClientMode(ctx, balance)
}

// autoConfig generates optimal worker config based on device capabilities.
func (n *NodeManager) autoConfig() WorkerConfig {
	config := WorkerConfig{
		Mode:      ModeEarn,
		AutoStake: false, // GSTD goes directly to wallet
	}

	// Adaptive CPU allocation
	switch {
	case n.caps.CPUCores >= 32:
		config.MaxCPU = 70 // powerful server
	case n.caps.CPUCores >= 8:
		config.MaxCPU = 50 // decent PC
	case n.caps.CPUCores >= 4:
		config.MaxCPU = 30 // mobile/low-end
	default:
		config.MaxCPU = 20 // minimal
	}

	// Adaptive memory allocation
	switch {
	case n.caps.TotalMemGB >= 64:
		config.MaxMemGB = 32
	case n.caps.TotalMemGB >= 16:
		config.MaxMemGB = 8
	case n.caps.TotalMemGB >= 8:
		config.MaxMemGB = 4
	default:
		config.MaxMemGB = 2
	}

	// Model selection based on capabilities
	if n.caps.HasGPU && n.caps.GPUMemGB >= 40 {
		config.Models = []string{"llama-3-70b", "mixtral-8x7b", "deepseek-coder-34b"}
	} else if n.caps.HasGPU && n.caps.GPUMemGB >= 8 {
		config.Models = []string{"llama-3-8b", "mistral-7b", "codellama-7b"}
	} else if n.caps.TotalMemGB >= 16 {
		config.Models = []string{"phi-3-mini", "gemma-2b", "qwen-1.5b"}
	} else {
		config.Models = []string{"embedding-only"}
	}

	return config
}

// ─── Mode Management ────────────────────────────────────────────────────────

func (n *NodeManager) startWorkerMode(ctx context.Context, config WorkerConfig) error {
	n.config = &config
	n.status.Mode = ModeEarn
	n.status.IsActive = true
	n.status.StartedAt = time.Now()

	log.Printf("[Node] ⚡ Worker mode started: CPU=%d%%, Mem=%dGB, Models=%v",
		config.MaxCPU, config.MaxMemGB, config.Models)

	if n.onModeChange != nil {
		n.onModeChange(ModeEarn)
	}

	return nil
}

func (n *NodeManager) startClientMode(ctx context.Context, balance float64) error {
	n.config = &WorkerConfig{Mode: ModeClient}
	n.status.Mode = ModeClient
	n.status.IsActive = true
	n.status.StartedAt = time.Now()

	log.Printf("[Node] 🧠 Client mode started: GSTD=%.2f, can use AI services", balance)

	if n.onModeChange != nil {
		n.onModeChange(ModeClient)
	}

	return nil
}

// SwitchToHybrid transitions to hybrid mode (earn + consume).
func (n *NodeManager) SwitchToHybrid(ctx context.Context) error {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.status.Mode = ModeHybrid
	log.Printf("[Node] 🔄 Switched to hybrid mode (earn + consume)")

	if n.onModeChange != nil {
		n.onModeChange(ModeHybrid)
	}

	return nil
}

// ─── Task Tracking ──────────────────────────────────────────────────────────

// RecordTask records a completed task and updates earnings.
func (n *NodeManager) RecordTask(earnedGSTD float64) {
	n.mu.Lock()
	defer n.mu.Unlock()

	n.status.TasksToday++
	n.status.EarnedToday += earnedGSTD
	n.status.TotalEarned += earnedGSTD
	now := time.Now()
	n.status.LastTaskAt = &now
}

// GetStatus returns current node status.
func (n *NodeManager) GetStatus() NodeStatus {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return *n.status
}

// GetCapabilities returns detected system capabilities.
func (n *NodeManager) GetCapabilities() SystemCapabilities {
	return *n.caps
}

// ─── System Detection ───────────────────────────────────────────────────────

func detectCapabilities() *SystemCapabilities {
	caps := &SystemCapabilities{
		CPUCores: runtime.NumCPU(),
		OS:       runtime.GOOS,
		Arch:     runtime.GOARCH,
	}

	// Memory detection (simplified; production uses OS-specific APIs)
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	caps.TotalMemGB = float64(memStats.Sys) / (1024 * 1024 * 1024)
	if caps.TotalMemGB < 1 {
		caps.TotalMemGB = 4 // minimum fallback
	}

	// GPU detection would use nvidia-smi or similar
	caps.HasGPU = false
	caps.DiskFreeGB = 50   // default fallback
	caps.NetworkMbps = 100 // default fallback

	log.Printf("[Node] Detected: %d cores, %.1f GB RAM, GPU=%v, OS=%s/%s",
		caps.CPUCores, caps.TotalMemGB, caps.HasGPU, caps.OS, caps.Arch)

	return caps
}

// ─── Earning Estimates ──────────────────────────────────────────────────────

// EstimateEarnings returns projected GSTD earnings per day.
func (n *NodeManager) EstimateEarnings() EarningEstimate {
	caps := n.caps

	var dailyGSTD float64
	var nodeType string

	switch {
	case caps.HasGPU && caps.GPUMemGB >= 40:
		dailyGSTD = 75.0 // ~$50-100/day at maturity
		nodeType = "GPU Worker (A100)"
	case caps.HasGPU && caps.GPUMemGB >= 8:
		dailyGSTD = 15.0
		nodeType = "GPU Worker (RTX)"
	case caps.CPUCores >= 32 && caps.TotalMemGB >= 64:
		dailyGSTD = 5.0
		nodeType = "CPU Server"
	case caps.CPUCores >= 8:
		dailyGSTD = 2.0
		nodeType = "Edge Node (PC)"
	default:
		dailyGSTD = 0.5
		nodeType = "Mobile/IoT Node"
	}

	return EarningEstimate{
		NodeType:    nodeType,
		DailyGSTD:   dailyGSTD,
		WeeklyGSTD:  dailyGSTD * 7,
		MonthlyGSTD: dailyGSTD * 30,
		DaysToFirst: max(1, int(1.0/dailyGSTD)),
	}
}

// EarningEstimate projects future earnings.
type EarningEstimate struct {
	NodeType    string  `json:"node_type"`
	DailyGSTD   float64 `json:"daily_gstd"`
	WeeklyGSTD  float64 `json:"weekly_gstd"`
	MonthlyGSTD float64 `json:"monthly_gstd"`
	DaysToFirst int     `json:"days_to_first_gstd"`
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
