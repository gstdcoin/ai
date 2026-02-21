package settlement

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClient(t *testing.T) {
	c := NewClient("EQTest...")
	assert.NotNil(t, c)
	stats := c.GetStats()
	assert.Equal(t, int64(0), stats.TaskCount)
}

func TestSettleSplit(t *testing.T) {
	c := NewClient("EQTest...")
	result, err := c.Settle(context.Background(), &SettleRequest{
		TaskID: "task-1", WorkerAddr: "EQWorker", AmountTON: 1.0, GSTDBonus: 5.0,
	})
	require.NoError(t, err)
	assert.InDelta(t, 0.85, result.WorkerTON, 0.001)
	assert.InDelta(t, 0.10, result.TreasuryTON, 0.001)
	assert.InDelta(t, 0.05, result.ProtocolTON, 0.001)
	assert.Equal(t, 5.0, result.GSTDMinted)
	assert.NotEmpty(t, result.TxHash)
}

func TestSettleZeroAmountError(t *testing.T) {
	c := NewClient("EQTest...")
	_, err := c.Settle(context.Background(), &SettleRequest{AmountTON: 0})
	assert.Error(t, err)
}

func TestCalculateReward(t *testing.T) {
	r := CalculateReward(RewardParams{BaseRate: 0.001, ComputeUnits: 1000, QualityFactor: 1.5, UptimeMultiplier: 1.2, StakeMultiplier: 1.1})
	assert.InDelta(t, 1.98, r, 0.001)
}

func TestEstimateComputeUnits(t *testing.T) {
	fast := EstimateComputeUnits(100, 500)
	assert.InDelta(t, 150, fast, 0.01)
	mid := EstimateComputeUnits(100, 2000)
	assert.InDelta(t, 120, mid, 0.01)
	slow := EstimateComputeUnits(100, 5000)
	assert.InDelta(t, 100, slow, 0.01)
}

func TestSettleStats(t *testing.T) {
	c := NewClient("EQTest...")
	c.Settle(context.Background(), &SettleRequest{TaskID: "t1", AmountTON: 2.0, GSTDBonus: 10.0})
	c.Settle(context.Background(), &SettleRequest{TaskID: "t2", AmountTON: 3.0, GSTDBonus: 15.0})
	stats := c.GetStats()
	assert.Equal(t, int64(2), stats.TaskCount)
	assert.InDelta(t, 5.0, stats.TotalSettled, 0.001)
	assert.InDelta(t, 25.0, stats.TotalGSTDMinted, 0.001)
}

func TestQueueSettle(t *testing.T) {
	c := NewClient("EQTest...")
	err := c.QueueSettle(&SettleRequest{TaskID: "q1", AmountTON: 1.0})
	assert.NoError(t, err)
}
