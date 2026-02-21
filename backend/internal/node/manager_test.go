package node

import (
	"context"
	"fmt"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewNodeManager(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	assert.NotNil(t, nm)

	status := nm.GetStatus()
	assert.Equal(t, "test-node", status.NodeID)
	assert.False(t, status.IsActive)
}

func TestDetectCapabilities(t *testing.T) {
	caps := detectCapabilities()
	assert.NotNil(t, caps)
	assert.Greater(t, caps.CPUCores, 0)
	assert.Equal(t, runtime.GOOS, caps.OS)
	assert.Equal(t, runtime.GOARCH, caps.Arch)
}

func TestAutoConfigLowEnd(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   2,
		TotalMemGB: 4,
		HasGPU:     false,
	}

	config := nm.autoConfig()
	assert.Equal(t, ModeEarn, config.Mode)
	assert.Equal(t, 20, config.MaxCPU)
	assert.Equal(t, 2, config.MaxMemGB)
	assert.Contains(t, config.Models, "embedding-only")
}

func TestAutoConfigMidRange(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   8,
		TotalMemGB: 16,
		HasGPU:     false,
	}

	config := nm.autoConfig()
	assert.Equal(t, 50, config.MaxCPU)
	assert.Equal(t, 8, config.MaxMemGB)
	assert.Contains(t, config.Models, "phi-3-mini")
}

func TestAutoConfigGPUServer(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   32,
		TotalMemGB: 64,
		HasGPU:     true,
		GPUMemGB:   48,
	}

	config := nm.autoConfig()
	assert.Equal(t, 70, config.MaxCPU)
	assert.Equal(t, 32, config.MaxMemGB)
	assert.Contains(t, config.Models, "llama-3-70b")
}

func TestCheckAndAutoStartNoBalance(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   8,
		TotalMemGB: 16,
	}

	modeChangeCalled := false
	nm.SetModeChangeHandler(func(mode Mode) {
		modeChangeCalled = true
		assert.Equal(t, ModeEarn, mode)
	})

	nm.SetBalanceChecker(func(ctx context.Context, addr string) (float64, error) {
		return 0, nil // No GSTD
	})

	err := nm.CheckAndAutoStart(context.Background())
	require.NoError(t, err)

	status := nm.GetStatus()
	assert.Equal(t, ModeEarn, status.Mode)
	assert.True(t, status.IsActive)
	assert.True(t, modeChangeCalled)
}

func TestCheckAndAutoStartWithBalance(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{CPUCores: 8, TotalMemGB: 16}

	nm.SetBalanceChecker(func(ctx context.Context, addr string) (float64, error) {
		return 100.5, nil // Has GSTD
	})

	err := nm.CheckAndAutoStart(context.Background())
	require.NoError(t, err)

	status := nm.GetStatus()
	assert.Equal(t, ModeClient, status.Mode)
	assert.True(t, status.IsActive)
	assert.Equal(t, 100.5, status.GSTDBalance)
}

func TestCheckAndAutoStartError(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.SetBalanceChecker(func(ctx context.Context, addr string) (float64, error) {
		return 0, fmt.Errorf("network error")
	})

	err := nm.CheckAndAutoStart(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "network error")
}

func TestCheckAndAutoStartNoChecker(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	err := nm.CheckAndAutoStart(context.Background())
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "balance checker not configured")
}

func TestRecordTask(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")

	nm.RecordTask(1.5)
	nm.RecordTask(2.3)
	nm.RecordTask(0.8)

	status := nm.GetStatus()
	assert.Equal(t, 3, status.TasksToday)
	assert.InDelta(t, 4.6, status.EarnedToday, 0.001)
	assert.InDelta(t, 4.6, status.TotalEarned, 0.001)
	assert.NotNil(t, status.LastTaskAt)
}

func TestSwitchToHybrid(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")

	modeChangeCalled := false
	nm.SetModeChangeHandler(func(mode Mode) {
		modeChangeCalled = true
		assert.Equal(t, ModeHybrid, mode)
	})

	err := nm.SwitchToHybrid(context.Background())
	require.NoError(t, err)

	status := nm.GetStatus()
	assert.Equal(t, ModeHybrid, status.Mode)
	assert.True(t, modeChangeCalled)
}

func TestEstimateEarnings(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   8,
		TotalMemGB: 16,
		HasGPU:     false,
	}

	estimate := nm.EstimateEarnings()
	assert.Equal(t, "Edge Node (PC)", estimate.NodeType)
	assert.Equal(t, 2.0, estimate.DailyGSTD)
	assert.Equal(t, 14.0, estimate.WeeklyGSTD)
	assert.Equal(t, 60.0, estimate.MonthlyGSTD)
}

func TestEstimateEarningsGPU(t *testing.T) {
	nm := NewNodeManager("test-node", "EQtest...")
	nm.caps = &SystemCapabilities{
		CPUCores:   32,
		TotalMemGB: 128,
		HasGPU:     true,
		GPUMemGB:   48,
	}

	estimate := nm.EstimateEarnings()
	assert.Equal(t, "GPU Worker (A100)", estimate.NodeType)
	assert.Equal(t, 75.0, estimate.DailyGSTD)
	assert.Equal(t, 1, estimate.DaysToFirst)
}

func TestModes(t *testing.T) {
	assert.Equal(t, Mode("earn"), ModeEarn)
	assert.Equal(t, Mode("client"), ModeClient)
	assert.Equal(t, Mode("hybrid"), ModeHybrid)
}

func TestMaxHelper(t *testing.T) {
	assert.Equal(t, 5, max(3, 5))
	assert.Equal(t, 10, max(10, 5))
	assert.Equal(t, 7, max(7, 7))
}
