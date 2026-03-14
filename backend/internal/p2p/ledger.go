package p2p

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"distributed-computing-platform/internal/sentinel"
)

// LedgerState represents the decentralized balance book of the Swarm.
// For Genesis Phase, it's held in memory before we switch to a rocksdb/leveldb store.
type LedgerState struct {
	mu       sync.RWMutex
	Balances map[string]float64 // Address -> GSTD Balance
	Nonce    map[string]int64   // Address -> Transaction count
	Mempool  map[string]*Transaction
	BlockHeight uint64
}

// Ledger holds the state and handles incoming transactions via the Sentinel.
type Ledger struct {
	Node     *SwarmNode
	State    *LedgerState
	Sentinel *sentinel.Sentinel
}

// NewLedger creates a new Ledger connected to the Swarm Node.
// It injects the AI Sentinel directly into the consensus layer (Proof of Benevolence).
func NewLedger(node *SwarmNode, s *sentinel.Sentinel) *Ledger {
	l := &Ledger{
		Node:     node,
		Sentinel: s,
		State: &LedgerState{
			Balances: make(map[string]float64),
			Nonce:    make(map[string]int64),
			Mempool:  make(map[string]*Transaction),
			BlockHeight: 0,
		},
	}

	// Bootstrap Genesis Node with 10k GSTD for full node status
	l.State.Balances["UQGenesisBootstrapAccount000000000000000000000"] = 10000.0

	return l
}

// ProcessMessage is the P2P message handler.
// Whenever a swarm peer broadcasts a transaction, this function evaluates it.
func (l *Ledger) ProcessMessage(ctx context.Context, payload []byte) error {
	var tx Transaction
	if err := json.Unmarshal(payload, &tx); err != nil {
		return fmt.Errorf("invalid transaction payload: %v", err)
	}

	// 1. Verify signatures (Decentralized Crypto Check)
	if err := tx.Verify(); err != nil {
		// Log silently, we don't want spam
		return fmt.Errorf("signature verification failed: %v", err)
	}

	// 2. Prevent replay attacks
	l.State.mu.Lock()
	if _, exists := l.State.Mempool[tx.ID]; exists {
		l.State.mu.Unlock()
		return nil // Already seen
	}
	l.State.mu.Unlock()

	// 3. Proof of Benevolence (Sentinel AI Check at Consensus Layer)
	// Fully autonomous network needs to protect itself from malicious payloads or compute tasks.
	if tx.Type == TxComputeTask || tx.Type == TxSmartDeploy {
		task := &sentinel.Task{
			ID:      tx.ID,
			Content: tx.Payload,
		}

		// AI-Driven Consensus: The Node itself evaluates the payload
		safetyCheck := l.Sentinel.Check(ctx, task)
		if !safetyCheck.Allowed {
			log.Printf("🛡️ [Swarm Ledger] Transaction %s REJECTED by Sentinel. Category: %s. Reason: %s", tx.ID, safetyCheck.Category, safetyCheck.Reason)
			
			// Optional: Slashing for malicious actors. (If node staked 10k GSTD, burn a fraction)
			return fmt.Errorf("transaction flagged by sentinel: %s", safetyCheck.Reason)
		}
	}

	// 4. State Transition Check (Balance)
	l.State.mu.Lock()
	defer l.State.mu.Unlock()

	senderBalance := l.State.Balances[tx.Sender]
	if senderBalance < tx.Amount {
		return fmt.Errorf("insufficient funds: sender=%s, balance=%f, requested=%f", tx.Sender, senderBalance, tx.Amount)
	}

	// We apply it immediately to the local mempool state for fast routing
	l.State.Balances[tx.Sender] -= tx.Amount
	l.State.Balances[tx.Receiver] += tx.Amount
	l.State.Mempool[tx.ID] = &tx

	log.Printf("✅ [Swarm Ledger] Transcation %s APPLIED: %s -> %s (Amount: %.2f GSTD)", tx.ID, tx.Sender[:8], tx.Receiver[:8], tx.Amount)

	return nil
}

// StartMempoolWorker listens to P2P network and pipes it into the ledger.
func (l *Ledger) StartMempoolWorker(ctx context.Context) {
	log.Printf("🧱 [Swarm Ledger] Starting autonomous Mempool worker")
	
	// Read Loop
	for {
		select {
		case <-ctx.Done():
			return
		default:
			msg, err := l.Node.Sub.Next(ctx)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				time.Sleep(1 * time.Second)
				continue
			}

			// Don't process our own broadcasted txs twice
			if msg.ReceivedFrom == l.Node.Host.ID() {
				continue
			}

			if err := l.ProcessMessage(ctx, msg.Data); err != nil {
				// We don't log signature errors to avoid log spam from malicious actors
				if err.Error() != "invalid signature" {
					// log.Printf("⚠️ [Swarm Ledger] Sync err: %v", err)
				}
			}
		}
	}
}

// SubmitTransaction allows the local REST API to submit a transaction to the Ledger,
// verify it with Sentinel, apply it, and broadcast it to the global Swarm.
func (l *Ledger) SubmitTransaction(ctx context.Context, tx *Transaction) error {
	payload, err := json.Marshal(tx)
	if err != nil {
		return err
	}

	// Apply locally (includes Sentinel verification!)
	if err := l.ProcessMessage(ctx, payload); err != nil {
		return err
	}

	// Broadcast to peers (GossipSub protocol)
	log.Printf("🌐 [Swarm Ledger] Broadcasting Tx %s to L1 Network...", tx.ID)
	return l.Node.Broadcast(payload)
}
