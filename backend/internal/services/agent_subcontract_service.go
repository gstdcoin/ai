package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

// AgentSubcontractService - Cosmic Genesis: Agents hire other agents (A2A economy)
type AgentSubcontractService struct {
	db *sql.DB
}

func NewAgentSubcontractService(db *sql.DB) *AgentSubcontractService {
	return &AgentSubcontractService{db: db}
}

// EnsureAgentAccount creates internal GSTD account for agent
func (s *AgentSubcontractService) EnsureAgentAccount(ctx context.Context, agentID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_internal_accounts (agent_id, balance_gstd, frozen_gstd)
		VALUES ($1, 0, 0)
		ON CONFLICT (agent_id) DO NOTHING
	`, agentID)
	return err
}

// HireAgent creates subcontract: hirer pays worker from internal balance
func (s *AgentSubcontractService) HireAgent(ctx context.Context, hirerID, workerID, taskID string, amountGSTD float64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var hirerBalance float64
	if err := tx.QueryRowContext(ctx, `SELECT balance_gstd FROM agent_internal_accounts WHERE agent_id = $1`, hirerID).Scan(&hirerBalance); err != nil {
		return fmt.Errorf("hirer account not found")
	}
	if hirerBalance < amountGSTD {
		return fmt.Errorf("insufficient balance: have %.4f, need %.4f GSTD", hirerBalance, amountGSTD)
	}

	_, err = tx.ExecContext(ctx, `UPDATE agent_internal_accounts SET balance_gstd = balance_gstd - $1, updated_at = NOW() WHERE agent_id = $2`, amountGSTD, hirerID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_internal_accounts (agent_id, balance_gstd, frozen_gstd) VALUES ($1, $2, 0) ON CONFLICT (agent_id) DO UPDATE SET balance_gstd = agent_internal_accounts.balance_gstd + $2, updated_at = NOW()`, workerID, amountGSTD)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_subcontracts (hirer_agent_id, worker_agent_id, task_id, amount_gstd, status) VALUES ($1, $2, $3, $4, 'pending')`, hirerID, workerID, taskID, amountGSTD)
	if err != nil {
		return err
	}
	log.Printf("AgentSubcontract: %s hired %s for %.4f GSTD (task=%s)", hirerID[:16], workerID[:16], amountGSTD, taskID)
	return tx.Commit()
}

// GetAgentBalance returns internal balance for agent
func (s *AgentSubcontractService) GetAgentBalance(ctx context.Context, agentID string) (float64, error) {
	var bal float64
	err := s.db.QueryRowContext(ctx, `SELECT COALESCE(balance_gstd, 0) FROM agent_internal_accounts WHERE agent_id = $1`, agentID).Scan(&bal)
	return bal, err
}
