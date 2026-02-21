// Package settlement implements the Go client for interacting with
// the SettlementMaster TON smart contract.
// Handles payment splitting, reward calculation, and settlement tracking.
package settlement

import (
	"context"
	"fmt"
	"log"
	"math"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// SettleRequest represents a settlement to be executed.
type SettleRequest struct {
	TaskID     string  `json:"task_id"`
	WorkerAddr string  `json:"worker_addr"` // TON wallet
	AmountTON  float64 `json:"amount_ton"`
	GSTDBonus  float64 `json:"gstd_bonus"`
}

// RewardParams holds the reward calculation variables.
type RewardParams struct {
	BaseRate         float64 `json:"base_rate"`         // GSTD per compute unit
	ComputeUnits     float64 `json:"compute_units"`     // CU for the task
	QualityFactor    float64 `json:"quality_factor"`    // 0.5-2.0
	UptimeMultiplier float64 `json:"uptime_multiplier"` // 1.0-1.5
	StakeMultiplier  float64 `json:"stake_multiplier"`  // 1.0-1.3
}

// SettleResult captures the outcome of a settlement.
type SettleResult struct {
	TaskID      string    `json:"task_id"`
	WorkerTON   float64   `json:"worker_ton"`   // 85%
	TreasuryTON float64   `json:"treasury_ton"` // 10%
	ProtocolTON float64   `json:"protocol_ton"` //  5%
	GSTDMinted  float64   `json:"gstd_minted"`
	TxHash      string    `json:"tx_hash"`
	SettledAt   time.Time `json:"settled_at"`
}

// SettlementStats tracks overall settlement metrics.
type SettlementStats struct {
	TotalSettled    float64 `json:"total_settled_ton"`
	TotalGSTDMinted float64 `json:"total_gstd_minted"`
	TaskCount       int64   `json:"task_count"`
	AvgSettleTimeMs int64   `json:"avg_settle_time_ms"`
	WorkerPaid      float64 `json:"worker_paid_ton"`
	TreasuryPaid    float64 `json:"treasury_paid_ton"`
	ProtocolPaid    float64 `json:"protocol_paid_ton"`
}

// ─── Settlement Client ──────────────────────────────────────────────────────

// Client manages settlement interactions with the TON contract.
type Client struct {
	contractAddr  string // SettlementMaster address on TON
	workerShare   int    // 85
	treasuryShare int    // 10
	protocolShare int    //  5
	baseRate      float64

	stats SettlementStats
	mu    sync.Mutex

	// Pending settlements queue
	pending chan *SettleRequest
}

// NewClient creates a new settlement client.
func NewClient(contractAddr string) *Client {
	c := &Client{
		contractAddr:  contractAddr,
		workerShare:   85,
		treasuryShare: 10,
		protocolShare: 5,
		baseRate:      0.001, // 0.001 GSTD per CU
		pending:       make(chan *SettleRequest, 1000),
	}
	log.Printf("[Settlement] Client initialized for contract %s (split: %d/%d/%d)",
		contractAddr, c.workerShare, c.treasuryShare, c.protocolShare)
	return c
}

// ─── Reward Calculation ─────────────────────────────────────────────────────

// CalculateReward computes the GSTD reward for a task.
// Formula: Reward = Base_Rate × CU × QF × UM × SM
func CalculateReward(params RewardParams) float64 {
	reward := params.BaseRate * params.ComputeUnits *
		params.QualityFactor * params.UptimeMultiplier * params.StakeMultiplier

	// Round to 9 decimal places (nanoGSTD precision)
	return math.Round(reward*1e9) / 1e9
}

// EstimateComputeUnits calculates CU from tokens and latency.
func EstimateComputeUnits(tokensGenerated int, latencyMs int64) float64 {
	// CU = tokens × (1 + latency_penalty)
	// Faster responses = more CU reward
	latencyBonus := 1.0
	if latencyMs < 1000 {
		latencyBonus = 1.5 // sub-second response bonus
	} else if latencyMs < 3000 {
		latencyBonus = 1.2
	}
	return float64(tokensGenerated) * latencyBonus
}

// ─── Settlement Execution ───────────────────────────────────────────────────

// Settle executes a settlement for a completed task.
func (c *Client) Settle(ctx context.Context, req *SettleRequest) (*SettleResult, error) {
	if req.AmountTON <= 0 {
		return nil, fmt.Errorf("settlement amount must be positive")
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	// Calculate split
	workerAmt := req.AmountTON * float64(c.workerShare) / 100
	treasuryAmt := req.AmountTON * float64(c.treasuryShare) / 100
	protocolAmt := req.AmountTON - workerAmt - treasuryAmt // remainder

	log.Printf("[Settlement] Task %s: %.4f TON → Worker=%.4f, Treasury=%.4f, Protocol=%.4f, GSTD Bonus=%.4f",
		req.TaskID, req.AmountTON, workerAmt, treasuryAmt, protocolAmt, req.GSTDBonus)

	// In production: submit TON transaction to SettlementMaster contract
	// For now: track locally
	result := &SettleResult{
		TaskID:      req.TaskID,
		WorkerTON:   workerAmt,
		TreasuryTON: treasuryAmt,
		ProtocolTON: protocolAmt,
		GSTDMinted:  req.GSTDBonus,
		TxHash:      fmt.Sprintf("tx_%s_%d", req.TaskID, time.Now().UnixMilli()),
		SettledAt:   time.Now(),
	}

	// Update stats
	c.stats.TotalSettled += req.AmountTON
	c.stats.TotalGSTDMinted += req.GSTDBonus
	c.stats.TaskCount++
	c.stats.WorkerPaid += workerAmt
	c.stats.TreasuryPaid += treasuryAmt
	c.stats.ProtocolPaid += protocolAmt

	return result, nil
}

// GetStats returns current settlement statistics.
func (c *Client) GetStats() SettlementStats {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.stats
}

// ─── Background Settlement Processor ────────────────────────────────────────

// StartProcessor runs a background goroutine to process pending settlements.
func (c *Client) StartProcessor(ctx context.Context) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case req := <-c.pending:
				result, err := c.Settle(ctx, req)
				if err != nil {
					log.Printf("[Settlement] Error settling task %s: %v", req.TaskID, err)
					// Retry logic
					select {
					case c.pending <- req:
					default:
						log.Printf("[Settlement] Retry queue full, dropping task %s", req.TaskID)
					}
					time.Sleep(5 * time.Second)
					continue
				}
				log.Printf("[Settlement] ✅ Settled task %s: tx=%s", result.TaskID, result.TxHash)
			}
		}
	}()
	log.Printf("[Settlement] Background processor started")
}

// QueueSettle adds a settlement to the processing queue.
func (c *Client) QueueSettle(req *SettleRequest) error {
	select {
	case c.pending <- req:
		return nil
	default:
		return fmt.Errorf("settlement queue full")
	}
}
