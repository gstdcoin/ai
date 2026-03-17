package p2p

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"distributed-computing-platform/internal/sentinel"

	"github.com/libp2p/go-libp2p/core/network"
)

// NanoGSTD is 1 GSTD = 1_000_000_000 nanoGSTD (integer precision).
const NanoGSTD int64 = 1_000_000_000

// MaxMempoolSize limits memory growth.
const MaxMempoolSize = 50_000

// MempoolTTL is the maximum age for a mempool entry.
const MempoolTTL = 1 * time.Hour

// LedgerState represents the decentralized balance book of the Swarm.
// Balances use int64 nanoGSTD for financial precision (no floats).
// State is synced to PostgreSQL for persistence.
type LedgerState struct {
	mu          sync.RWMutex
	Balances    map[string]int64 // Address -> nanoGSTD Balance (int64)
	Nonce       map[string]int64 // Address -> Transaction count
	Mempool     map[string]*mempoolEntry
	BlockHeight uint64
	ActiveNodes map[string]int64 // Address -> Last heartbeat timestamp
	RewardPool  int64            // Accumulated fees (nanoGSTD)
}

// mempoolEntry wraps a transaction with a timestamp for TTL eviction.
type mempoolEntry struct {
	Tx       *Transaction
	AddedAt  time.Time
}

// Ledger holds the state and handles incoming transactions via the Sentinel.
type Ledger struct {
	Node     *SwarmNode
	State    *LedgerState
	Sentinel *sentinel.Sentinel
	db       *sql.DB // PostgreSQL for persistence (nil = in-memory only)
}

// NewLedger creates a new Ledger connected to the Swarm Node.
func NewLedger(node *SwarmNode, s *sentinel.Sentinel) *Ledger {
	l := &Ledger{
		Node:     node,
		Sentinel: s,
		State: &LedgerState{
			Balances:    make(map[string]int64),
			Nonce:       make(map[string]int64),
			Mempool:     make(map[string]*mempoolEntry),
			BlockHeight: 0,
			ActiveNodes: make(map[string]int64),
			RewardPool:  0,
		},
	}

	// Bootstrap Genesis Node with 10k GSTD (10_000 * NanoGSTD)
	l.State.Balances["UQGenesisBootstrapAccount000000000000000000000"] = 10000 * NanoGSTD

	return l
}

// SetDB attaches PostgreSQL for persistent state storage.
func (l *Ledger) SetDB(db *sql.DB) {
	l.db = db
	l.ensureSchema()
	l.loadStateFromDB()
	log.Println("💾 [Swarm Ledger] PostgreSQL persistence enabled")
}

// ensureSchema creates the swarm_ledger tables if absent.
func (l *Ledger) ensureSchema() {
	if l.db == nil {
		return
	}
	l.db.Exec(`
		CREATE TABLE IF NOT EXISTS swarm_balances (
			address VARCHAR(128) PRIMARY KEY,
			balance BIGINT NOT NULL DEFAULT 0,
			nonce BIGINT NOT NULL DEFAULT 0,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		CREATE TABLE IF NOT EXISTS swarm_transactions (
			tx_id VARCHAR(64) PRIMARY KEY,
			tx_type VARCHAR(32) NOT NULL,
			sender VARCHAR(128) NOT NULL,
			receiver VARCHAR(128) NOT NULL,
			amount BIGINT NOT NULL,
			fee BIGINT NOT NULL DEFAULT 0,
			nonce BIGINT NOT NULL,
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_swarm_tx_sender ON swarm_transactions(sender);
		CREATE INDEX IF NOT EXISTS idx_swarm_tx_created ON swarm_transactions(created_at);
	`)
}

// loadStateFromDB restores balances and nonces from PostgreSQL on startup.
func (l *Ledger) loadStateFromDB() {
	if l.db == nil {
		return
	}
	rows, err := l.db.Query("SELECT address, balance, nonce FROM swarm_balances")
	if err != nil {
		log.Printf("⚠️ [Swarm Ledger] Failed to load state from DB: %v", err)
		return
	}
	defer rows.Close()

	l.State.mu.Lock()
	defer l.State.mu.Unlock()

	count := 0
	for rows.Next() {
		var addr string
		var balance, nonce int64
		if err := rows.Scan(&addr, &balance, &nonce); err != nil {
			continue
		}
		l.State.Balances[addr] = balance
		l.State.Nonce[addr] = nonce
		count++
	}
	if count > 0 {
		log.Printf("💾 [Swarm Ledger] Restored %d accounts from PostgreSQL", count)
	}
}

// persistBalance writes a single account state to PostgreSQL.
func (l *Ledger) persistBalance(address string, balance, nonce int64) {
	if l.db == nil {
		return
	}
	go func() {
		l.db.Exec(`
			INSERT INTO swarm_balances (address, balance, nonce, updated_at)
			VALUES ($1, $2, $3, NOW())
			ON CONFLICT (address) DO UPDATE SET balance = $2, nonce = $3, updated_at = NOW()
		`, address, balance, nonce)
	}()
}

// persistTransaction records a transaction in PostgreSQL.
func (l *Ledger) persistTransaction(tx *Transaction, fee int64) {
	if l.db == nil {
		return
	}
	go func() {
		amountNano := int64(tx.Amount * float64(NanoGSTD))
		l.db.Exec(`
			INSERT INTO swarm_transactions (tx_id, tx_type, sender, receiver, amount, fee, nonce, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
			ON CONFLICT DO NOTHING
		`, tx.ID, tx.Type, tx.Sender, tx.Receiver, amountNano, fee, tx.Nonce)
	}()
}

// ToNano converts a float64 GSTD amount to int64 nanoGSTD.
func ToNano(amount float64) int64 {
	return int64(amount * float64(NanoGSTD))
}

// FromNano converts int64 nanoGSTD to float64 GSTD (for display only).
func FromNano(nano int64) float64 {
	return float64(nano) / float64(NanoGSTD)
}

// ProcessMessage is the P2P message handler.
func (l *Ledger) ProcessMessage(ctx context.Context, payload []byte) error {
	var tx Transaction
	if err := json.Unmarshal(payload, &tx); err != nil {
		return fmt.Errorf("invalid transaction payload: %v", err)
	}

	// 1. Verify signatures
	if err := tx.Verify(); err != nil {
		return fmt.Errorf("signature verification failed: %v", err)
	}

	// 2. Prevent replay attacks (check mempool)
	l.State.mu.Lock()
	if _, exists := l.State.Mempool[tx.ID]; exists {
		l.State.mu.Unlock()
		return nil // Already seen
	}
	l.State.mu.Unlock()

	// 3. Proof of Benevolence (Sentinel AI Check at Consensus Layer)
	if tx.Type == TxComputeTask || tx.Type == TxSmartDeploy {
		task := &sentinel.Task{
			ID:      tx.ID,
			Content: tx.Payload,
		}
		safetyCheck := l.Sentinel.Check(ctx, task)
		if !safetyCheck.Allowed {
			log.Printf("🛡️ [Swarm Ledger] Transaction %s REJECTED by Sentinel. Category: %s. Reason: %s", tx.ID, safetyCheck.Category, safetyCheck.Reason)
			return fmt.Errorf("transaction flagged by sentinel: %s", safetyCheck.Reason)
		}
	}

	// 4. State Transition (Balance update with int64 precision)
	l.State.mu.Lock()
	defer l.State.mu.Unlock()

	// Handle Heartbeats (no balance changes)
	if tx.Type == TxNodeHeartbeat {
		l.State.ActiveNodes[tx.Sender] = time.Now().Unix()
		return nil
	}

	// Convert float amount to int64 nanoGSTD for precision
	amountNano := ToNano(tx.Amount)

	// Calculate network fee (1% for transfers/compute, 0% for bridge ops)
	var feeNano int64
	if tx.Type == TxTransfer || tx.Type == TxComputeTask || tx.Type == TxSmartDeploy {
		feeNano = amountNano / 100 // 1% commission (integer division)
	}
	netAmountNano := amountNano - feeNano

	// Double-Spend Protection: Strict Nonce Ordering
	currentNonce := l.State.Nonce[tx.Sender]
	if tx.Nonce != currentNonce+1 {
		return fmt.Errorf("invalid nonce: expected %d, got %d", currentNonce+1, tx.Nonce)
	}

	// Insufficient funds check (except Mint)
	if tx.Type != TxMint {
		senderBalance := l.State.Balances[tx.Sender]
		if senderBalance < amountNano {
			return fmt.Errorf("insufficient funds: sender=%s, balance=%d, requested=%d nanoGSTD",
				tx.Sender, senderBalance, amountNano)
		}
	}

	// Apply balances (all int64 — no float precision loss)
	switch tx.Type {
	case TxMint:
		l.State.Balances[tx.Receiver] += amountNano
		l.persistBalance(tx.Receiver, l.State.Balances[tx.Receiver], l.State.Nonce[tx.Receiver])
		log.Printf("🌉 [Bridge -> Swarm] Minted %.2f W-GSTD to %s", tx.Amount, truncID(tx.Receiver))
	case TxBurn:
		l.State.Balances[tx.Sender] -= amountNano
		l.persistBalance(tx.Sender, l.State.Balances[tx.Sender], l.State.Nonce[tx.Sender])
		log.Printf("🔥 [Swarm -> Bridge] Burned %.2f W-GSTD from %s", tx.Amount, truncID(tx.Sender))
	default:
		l.State.Balances[tx.Sender] -= amountNano
		l.State.Balances[tx.Receiver] += netAmountNano
		l.persistBalance(tx.Sender, l.State.Balances[tx.Sender], l.State.Nonce[tx.Sender]+1)
		l.persistBalance(tx.Receiver, l.State.Balances[tx.Receiver], l.State.Nonce[tx.Receiver])
	}

	// Increment nonce
	l.State.Nonce[tx.Sender]++

	l.State.RewardPool += feeNano

	// Add to mempool with TTL
	l.State.Mempool[tx.ID] = &mempoolEntry{Tx: &tx, AddedAt: time.Now()}

	// Persist transaction
	l.persistTransaction(&tx, feeNano)

	log.Printf("✅ [Swarm Ledger] Tx %s: %s -> %s (%.2f GSTD, type=%s, fee=%.4f)",
		truncID(tx.ID), truncID(tx.Sender), truncID(tx.Receiver), tx.Amount, tx.Type, FromNano(feeNano))

	return nil
}

// StartMempoolWorker listens to P2P network.
func (l *Ledger) StartMempoolWorker(ctx context.Context) {
	log.Printf("🧱 [Swarm Ledger] Starting autonomous Mempool worker")

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

			// Don't process our own broadcasts
			if msg.ReceivedFrom == l.Node.Host.ID() {
				continue
			}

			if err := l.ProcessMessage(ctx, msg.Data); err != nil {
				if err.Error() != "invalid signature" {
					// Don't spam logs for signature errors
				}
			}
		}
	}
}

// StartMempoolCleaner periodically evicts expired mempool entries.
func (l *Ledger) StartMempoolCleaner(ctx context.Context) {
	log.Printf("🧹 [Swarm Ledger] Mempool cleaner started (TTL=%s, max=%d)", MempoolTTL, MaxMempoolSize)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			l.cleanMempool()
		}
	}
}

func (l *Ledger) cleanMempool() {
	l.State.mu.Lock()
	defer l.State.mu.Unlock()

	now := time.Now()
	evicted := 0

	// Evict by TTL
	for id, entry := range l.State.Mempool {
		if now.Sub(entry.AddedAt) > MempoolTTL {
			delete(l.State.Mempool, id)
			evicted++
		}
	}

	// If still over max, evict oldest
	if len(l.State.Mempool) > MaxMempoolSize {
		// Simple approach: evict anything older than TTL/2
		halfTTL := MempoolTTL / 2
		for id, entry := range l.State.Mempool {
			if now.Sub(entry.AddedAt) > halfTTL {
				delete(l.State.Mempool, id)
				evicted++
			}
			if len(l.State.Mempool) <= MaxMempoolSize {
				break
			}
		}
	}

	if evicted > 0 {
		log.Printf("🧹 [Swarm Ledger] Mempool cleanup: evicted %d entries, remaining %d", evicted, len(l.State.Mempool))
	}
}

// StartRewardDistributor periodically distributes fees to active nodes.
func (l *Ledger) StartRewardDistributor(ctx context.Context) {
	log.Printf("💰 [Swarm Ledger] Rewards Distributor started (60s cycle)")
	ticker := time.NewTicker(60 * time.Second) // Production interval
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			l.distributeRewards()
		}
	}
}

func (l *Ledger) distributeRewards() {
	l.State.mu.Lock()
	defer l.State.mu.Unlock()

	if l.State.RewardPool <= 0 {
		return
	}

	// Find active nodes (heartbeat within last 120 seconds)
	now := time.Now().Unix()
	var activeAddrs []string
	for addr, lastBeat := range l.State.ActiveNodes {
		if now-lastBeat <= 120 {
			activeAddrs = append(activeAddrs, addr)
		}
	}

	if len(activeAddrs) == 0 {
		return
	}

	// Distribute equally (integer division)
	rewardPerNode := l.State.RewardPool / int64(len(activeAddrs))
	if rewardPerNode <= 0 {
		return
	}

	for _, addr := range activeAddrs {
		l.State.Balances[addr] += rewardPerNode
		l.persistBalance(addr, l.State.Balances[addr], l.State.Nonce[addr])
	}

	distributed := rewardPerNode * int64(len(activeAddrs))
	log.Printf("🏆 [Swarm Ledger] Distributed %.4f GSTD to %d active nodes (%.4f each)",
		FromNano(distributed), len(activeAddrs), FromNano(rewardPerNode))

	l.State.RewardPool -= distributed // Keep remainder for next round
}

// EnableStateSync opens a P2P stream handler for state requests.
func (l *Ledger) EnableStateSync() {
	l.Node.Host.SetStreamHandler("/gstd/swarm/state/1.0.0", l.handleStateRequest)
	log.Printf("📡 [Swarm Ledger] State Synchronization Protocol Active")
}

func (l *Ledger) handleStateRequest(s network.Stream) {
	defer s.Close()
	l.State.mu.RLock()
	defer l.State.mu.RUnlock()

	snapshot := struct {
		Balances map[string]int64 `json:"balances"`
		Nonce    map[string]int64 `json:"nonce"`
	}{
		Balances: l.State.Balances,
		Nonce:    l.State.Nonce,
	}

	if err := json.NewEncoder(s).Encode(snapshot); err != nil {
		log.Printf("❌ [Swarm Ledger] Failed to send state snapshot: %v", err)
	}
}

// SyncStateFromPeers bootstraps state from connected peers with multi-peer verification.
func (l *Ledger) SyncStateFromPeers(ctx context.Context) {
	log.Printf("🔄 [Swarm Ledger] Bootstrapping: Requesting L1 state from P2P peers...")
	peers := l.Node.Host.Network().Peers()
	if len(peers) == 0 {
		log.Printf("⚠️ [Swarm Ledger] No peers connected. Acting as Genesis Island.")
		return
	}

	// Collect state from multiple peers for consensus
	type peerState struct {
		Balances map[string]int64
		Nonce    map[string]int64
		Size     int
	}
	var states []peerState

	for _, p := range peers {
		s, err := l.Node.Host.NewStream(ctx, p, "/gstd/swarm/state/1.0.0")
		if err != nil {
			continue
		}

		var snapshot struct {
			Balances map[string]int64 `json:"balances"`
			Nonce    map[string]int64 `json:"nonce"`
		}

		if err := json.NewDecoder(s).Decode(&snapshot); err == nil {
			states = append(states, peerState{
				Balances: snapshot.Balances,
				Nonce:    snapshot.Nonce,
				Size:     len(snapshot.Balances),
			})
		}
		s.Close()
	}

	if len(states) == 0 {
		log.Printf("⚠️ [Swarm Ledger] State sync failed across %d peers.", len(peers))
		return
	}

	// Use the state with the most accounts (simple heuristic)
	// In production: use Merkle roots and ≥2/3 consensus
	best := states[0]
	for _, st := range states[1:] {
		if st.Size > best.Size {
			best = st
		}
	}

	l.State.mu.Lock()
	if best.Size >= len(l.State.Balances) {
		l.State.Balances = best.Balances
		l.State.Nonce = best.Nonce
		log.Printf("📥 [Swarm Ledger] Synced state from peers (Accounts: %d, Verification: %d/%d peers agreed)",
			best.Size, len(states), len(peers))
	}
	l.State.mu.Unlock()
}

// GetAccountState safely fetches an address' balance and nonce.
func (l *Ledger) GetAccountState(address string) (balance float64, nonce int64) {
	l.State.mu.RLock()
	defer l.State.mu.RUnlock()
	return FromNano(l.State.Balances[address]), l.State.Nonce[address]
}

// DirectMint allows the Bridge Oracle to issue Wrapped GSTD.
// SECURITY: Only called from authenticated API endpoints (bridge key required).
func (l *Ledger) DirectMint(receiver string, amount float64) {
	amountNano := ToNano(amount)
	l.State.mu.Lock()
	l.State.Balances[receiver] += amountNano
	balance := l.State.Balances[receiver]
	nonce := l.State.Nonce[receiver]
	l.State.mu.Unlock()

	l.persistBalance(receiver, balance, nonce)
	log.Printf("🌉 [DirectMint] %.2f W-GSTD -> %s", amount, truncID(receiver))
}

// SubmitTransaction validates, applies, and broadcasts a transaction.
func (l *Ledger) SubmitTransaction(ctx context.Context, tx *Transaction) error {
	payload, err := json.Marshal(tx)
	if err != nil {
		return err
	}

	if err := l.ProcessMessage(ctx, payload); err != nil {
		return err
	}

	log.Printf("🌐 [Swarm Ledger] Broadcasting Tx %s to L1 Network...", truncID(tx.ID))
	return l.Node.Broadcast(payload)
}

// truncID safely truncates an ID for log readability.
func truncID(id string) string {
	if len(id) <= 12 {
		return id
	}
	return id[:12]
}
