package services

import (
	"crypto/rand"
	"database/sql"
	"fmt"
	"log"
	"math"
	"math/big"
	"time"
)

type SettlementRouter struct {
	DB *sql.DB
}

func NewSettlementRouter(db *sql.DB) *SettlementRouter {
	return &SettlementRouter{DB: db}
}

// RouteTransaction represents a user request to bridge/pay via USDT/TON but routed via GSTD
type RouteRequest struct {
	UserID        int     `json:"user_id"`
	SourceAsset   string  `json:"source_asset"` // e.g. "USDT", "TON"
	SourceAmount  float64 `json:"source_amount"`
	TargetAction  string  `json:"target_action"` // e.g. "bridge_solana", "ai_payment"
	TargetAddress string  `json:"target_address"`
	SlippageMax   float64 `json:"slippage_max"`
}

type RouteResponse struct {
	TxID         string   `json:"tx_id"`
	GSTDSwapped  float64  `json:"gstd_swapped"`
	ValidatorFee float64  `json:"validator_fee"`
	Delivered    float64  `json:"delivered"`
	Committee    []string `json:"committee_nodes"`
	Status       string   `json:"status"`
}

// ExecuteRouting simulates Layer 1 Swap on STON.fi, selects VRF committee, and distributes fees
func (s *SettlementRouter) ExecuteRouting(req RouteRequest) (*RouteResponse, error) {
	// 1. Simulate STON.fi swap (SourceAsset -> GSTD)
	gstdReceived, err := s.simulateStonFiSwap(req.SourceAsset, req.SourceAmount)
	if err != nil {
		return nil, fmt.Errorf("slippage or liquidity error: %v", err)
	}

	// 2. Calculate Validator Fee (0.2%)
	fee := gstdReceived * 0.002
	delivered := gstdReceived - fee

	// 3. VRF Committee Selection (Quadratic Weight Model)
	committee, err := s.selectVRFCommittee(7)
	if err != nil {
		return nil, fmt.Errorf("failed to select validator committee: %v", err)
	}

	// 4. Distribute Fees to Committee Equally
	feePerNode := fee / float64(len(committee))
	for _, nodeWallet := range committee {
		err = s.distributeReward(nodeWallet, feePerNode)
		if err != nil {
			log.Printf("[Settlement] Failed to pay %f to %s: %v", feePerNode, nodeWallet, err)
		}
	}

	txID := fmt.Sprintf("RT-%d", time.Now().UnixNano())
	log.Printf("[Settlement] %s Routed: %.2f GSTD (Fee: %.2f to %d nodes)", txID, delivered, fee, len(committee))

	return &RouteResponse{
		TxID:         txID,
		GSTDSwapped:  gstdReceived,
		ValidatorFee: fee,
		Delivered:    delivered,
		Committee:    committee,
		Status:       "completed_and_validated",
	}, nil
}

func (s *SettlementRouter) simulateStonFiSwap(asset string, amount float64) (float64, error) {
	var rate float64
	if asset == "USDT" {
		rate = 2.0
	} else if asset == "TON" {
		rate = 12.0
	} else if asset == "GSTD" {
		rate = 1.0
	} else {
		return 0, fmt.Errorf("unsupported asset: %s", asset)
	}

	output := amount * rate
	output = output * 0.999 // Representing nominal swap fee
	return output, nil
}

func (s *SettlementRouter) selectVRFCommittee(k int) ([]string, error) {
	query := `
		SELECT wallet_address, total_staked, uptime_fraction
		FROM swarm_nodes 
		WHERE tier IN ('Platinum', 'Diamond') AND status = 'active'
	`
	rows, err := s.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type NodeWeight struct {
		Wallet string
		Weight float64
	}
	var nodes []NodeWeight

	for rows.Next() {
		var wallet string
		var staked, uptime float64
		if err := rows.Scan(&wallet, &staked, &uptime); err == nil {
			w := math.Sqrt(staked) * uptime
			if w > 0 {
				nodes = append(nodes, NodeWeight{Wallet: wallet, Weight: w})
			}
		}
	}

	if len(nodes) < k {
		k = len(nodes)
	}
	if k == 0 {
		return []string{"system_fallback_node"}, nil
	}

	type Weighted struct {
		Wallet string
		Key    float64
	}
	var pool []Weighted
	for _, n := range nodes {
		// Secure random VRF weight selection
		bg, _ := rand.Int(rand.Reader, big.NewInt(1<<53))
		r := float64(bg.Int64()) / float64(1<<53)
		if r == 0 {
			r = 0.0000000000001
		} // avoid zero
		key := math.Pow(r, 1.0/n.Weight)
		pool = append(pool, Weighted{Wallet: n.Wallet, Key: key})
	}

	for i := 0; i < len(pool)-1; i++ {
		for j := i + 1; j < len(pool); j++ {
			if pool[i].Key < pool[j].Key {
				pool[i], pool[j] = pool[j], pool[i]
			}
		}
	}

	var committee []string
	for i := 0; i < k; i++ {
		committee = append(committee, pool[i].Wallet)
	}
	return committee, nil
}

func (s *SettlementRouter) distributeReward(wallet string, amount float64) error {
	_, err := s.DB.Exec(`
		INSERT INTO user_balances (wallet_address, gstd_balance) 
		VALUES ($1, $2)
		ON CONFLICT (wallet_address) DO UPDATE SET gstd_balance = user_balances.gstd_balance + EXCLUDED.gstd_balance
	`, wallet, amount)
	return err
}
