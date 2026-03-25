package p2p

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"testing"

	"distributed-computing-platform/internal/sentinel"

	"github.com/stretchr/testify/assert"
)

func TestMobileRewardsAndSignatures(t *testing.T) {
	node := &SwarmNode{}
	s := sentinel.NewSentinel()
	l := NewLedger(node, s)

	// Genesis account
	pubKeyGen, privKeyGen, err := ed25519.GenerateKey(nil)
	assert.NoError(t, err)
	genAddr := GenerateSwarmAddress(pubKeyGen)
	
	// Fund Genesis with 10k GSTD for test
	l.State.Balances[genAddr] = 10000 * NanoGSTD

	// Mobile Node account
	pubKeyMobile, privKeyMobile, err := ed25519.GenerateKey(nil)
	assert.NoError(t, err)
	mobileAddr := GenerateSwarmAddress(pubKeyMobile)

	// 1. Submit Node Heartbeat
	tx1, err := BuildTransaction(TxNodeHeartbeat, mobileAddr, "", 0, "Mobile Node Active", 1, privKeyMobile)
	assert.NoError(t, err)
	payload1, _ := json.Marshal(tx1)
	err = l.ProcessMessage(context.Background(), payload1)
	assert.NoError(t, err)
	
	// Heartbeat should update ActiveNodes
	_, ok := l.State.ActiveNodes[mobileAddr]
	assert.True(t, ok)

	// 2. Submit Compute Task (generates fee for reward pool)
	// Genesis spends 100 GSTD
	tx2, err := BuildTransaction(TxComputeTask, genAddr, "UQAgent000000", 100.0, "Analyze data", 1, privKeyGen)
	assert.NoError(t, err)
	payload2, _ := json.Marshal(tx2)
	err = l.ProcessMessage(context.Background(), payload2)
	assert.NoError(t, err)

	// Reward Pool should have 1 GSTD (1% of 100 GSTD)
	assert.Equal(t, 1*NanoGSTD, l.State.RewardPool)

	// 3. Trigger Reward Distributor
	l.distributeRewards()

	// Reward pool should drain to 0
	assert.Equal(t, int64(0), l.State.RewardPool)

	// Mobile node should have received exactly 1 GSTD (10^9 nano) as the only active node
	assert.Equal(t, 1*NanoGSTD, l.State.Balances[mobileAddr])
}
