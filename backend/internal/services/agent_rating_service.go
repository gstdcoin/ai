package services

import (
	"context"
	"database/sql"
	"sort"
	"time"
)

// AgentRatingService computes reliability ratings from settlement_ledger.
// A2A Symbio: agents with high ratings get priority in UniversalMesh queue.
type AgentRatingService struct {
	db *sql.DB
}

// AgentRating holds wallet reliability score (0–100)
type AgentRating struct {
	WalletAddr string  `json:"wallet_address"`
	Score      float64 `json:"score"` // 0–100
	TxCount    int     `json:"tx_count"`
	TotalGSTD  float64 `json:"total_gstd"`
}

// NewAgentRatingService creates the rating service
func NewAgentRatingService(db *sql.DB) *AgentRatingService {
	return &AgentRatingService{db: db}
}

// GetRating returns reliability score for a wallet (0–100).
// Based on: count of successful settlements, total worker_amount, recency.
func (s *AgentRatingService) GetRating(ctx context.Context, walletAddr string) (float64, error) {
	if s.db == nil || walletAddr == "" {
		return 0, nil
	}
	var txCount int
	var totalGSTD float64
	var lastTx sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(worker_amount), 0), MAX(created_at)
		FROM settlement_ledger
		WHERE worker_wallet = $1
	`, walletAddr).Scan(&txCount, &totalGSTD, &lastTx)
	if err != nil {
		return 0, err
	}
	return s.computeScore(txCount, totalGSTD, lastTx), nil
}

// GetRatingsMap returns wallet -> score for a list of wallets (for batch sorting)
func (s *AgentRatingService) GetRatingsMap(ctx context.Context, wallets []string) map[string]float64 {
	out := make(map[string]float64)
	if s.db == nil || len(wallets) == 0 {
		return out
	}
	for _, w := range wallets {
		if w == "" {
			continue
		}
		score, _ := s.GetRating(ctx, w)
		out[w] = score
	}
	return out
}

// SortNodesByRating sorts NodeInferenceEndpoint slice by rating (highest first)
func (s *AgentRatingService) SortNodesByRating(ctx context.Context, nodes []NodeInferenceEndpoint) []NodeInferenceEndpoint {
	if len(nodes) <= 1 {
		return nodes
	}
	ratings := s.GetRatingsMap(ctx, extractWallets(nodes))
	sort.Slice(nodes, func(i, j int) bool {
		si := ratings[nodes[i].WalletAddr]
		sj := ratings[nodes[j].WalletAddr]
		return si > sj
	})
	return nodes
}

func extractWallets(nodes []NodeInferenceEndpoint) []string {
	w := make([]string, 0, len(nodes))
	seen := make(map[string]bool)
	for _, n := range nodes {
		if n.WalletAddr != "" && !seen[n.WalletAddr] {
			seen[n.WalletAddr] = true
			w = append(w, n.WalletAddr)
		}
	}
	return w
}

func (s *AgentRatingService) computeScore(txCount int, totalGSTD float64, lastTx sql.NullTime) float64 {
	// Base: 10 points per successful tx (cap 50)
	txScore := float64(txCount) * 10
	if txScore > 50 {
		txScore = 50
	}
	// Volume: 1 point per 0.1 GSTD earned (cap 30)
	volScore := totalGSTD * 10
	if volScore > 30 {
		volScore = 30
	}
	// Recency: 20 points if active in last 24h
	recencyScore := 0.0
	if lastTx.Valid {
		if time.Since(lastTx.Time) < 24*time.Hour {
			recencyScore = 20
		} else if time.Since(lastTx.Time) < 7*24*time.Hour {
			recencyScore = 10
		}
	}
	score := txScore + volScore + recencyScore
	if score > 100 {
		score = 100
	}
	return score
}
