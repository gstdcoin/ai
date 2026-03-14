package p2p

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"distributed-computing-platform/internal/sentinel"

	"github.com/libp2p/go-libp2p/core/network"
)

// LedgerState represents the decentralized balance book of the Swarm.
// For Genesis Phase, it's held in memory before we switch to a rocksdb/leveldb store.
type LedgerState struct {
	mu       sync.RWMutex
	Balances map[string]float64 // Address -> GSTD Balance
	Nonce    map[string]int64   // Address -> Transaction count
	Mempool      map[string]*Transaction
	BlockHeight  uint64
	ActiveNodes  map[string]int64   // Address -> Last heartbeat timestamp
	RewardPool   float64            // Accumulated fees from tx commissions
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
			ActiveNodes: make(map[string]int64),
			RewardPool:  0.0,
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

	// Handle Heartbeats (Zero amount, purely to register active status)
	if tx.Type == TxNodeHeartbeat {
		l.State.ActiveNodes[tx.Sender] = time.Now().Unix()
		log.Printf("📱 [Swarm Ledger] Mobile Node Heartbeat registered: %s", tx.Sender[:8])
		return nil
	}

	// Calculate network fee (1% distributed to active mobile nodes)
	fee := 0.0
	if tx.Type == TxTransfer || tx.Type == TxComputeTask || tx.Type == TxSmartDeploy {
		fee = tx.Amount * 0.01 // 1% commission for network support
	}
	netAmount := tx.Amount - fee

	// Double-Spend Protection: Strict Nonce Ordering
	currentNonce := l.State.Nonce[tx.Sender]
	if tx.Type != TxNodeHeartbeat {
		if tx.Nonce != currentNonce+1 {
			return fmt.Errorf("invalid nonce: expected %d, got %d", currentNonce+1, tx.Nonce)
		}
	}

	senderBalance := l.State.Balances[tx.Sender]
	if senderBalance < tx.Amount {
		return fmt.Errorf("insufficient funds: sender=%s, balance=%f, requested=%f", tx.Sender, senderBalance, tx.Amount)
	}

	// Apply balances and increment nonce
	l.State.Balances[tx.Sender] -= tx.Amount
	l.State.Balances[tx.Receiver] += netAmount
	if tx.Type != TxNodeHeartbeat {
		l.State.Nonce[tx.Sender]++
	}
	
	l.State.RewardPool += fee
	l.State.Mempool[tx.ID] = &tx

	log.Printf("✅ [Swarm Ledger] Transcation %s APPLIED: %s -> %s (Amount: %.2f, Fee: %.4f)", tx.ID, tx.Sender[:8], tx.Receiver[:8], tx.Amount, fee)

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

// StartRewardDistributor periodically distributes the accumulated reward pool
// equally among all actively participating mobile nodes.
func (l *Ledger) StartRewardDistributor(ctx context.Context) {
	log.Printf("💰 [Swarm Ledger] Mobile Rewards Distributor started (runs every 10 seconds for Genesis)")
	ticker := time.NewTicker(10 * time.Second) // 10s distribution cycle
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
		return // Nothing to distribute
	}

	// Find active nodes (heartbeat within last 60 seconds for rapid testing)
	now := time.Now().Unix()
	var activeAddrs []string
	for addr, lastBeat := range l.State.ActiveNodes {
		if now-lastBeat <= 60 {
			activeAddrs = append(activeAddrs, addr)
		}
	}

	if len(activeAddrs) == 0 {
		return // No active nodes to receive rewards right now
	}

	// Distributed equally
	rewardPerNode := l.State.RewardPool / float64(len(activeAddrs))
	for _, addr := range activeAddrs {
		l.State.Balances[addr] += rewardPerNode
	}

	log.Printf("🏆 [Swarm Ledger] Distributed %.4f GSTD to %d active mobile nodes (%.4f each)", l.State.RewardPool, len(activeAddrs), rewardPerNode)
	l.State.RewardPool = 0
}

// EnableStateSync opens a P2P stream handler allowing other nodes to request the current global state (balances & nonces).
func (l *Ledger) EnableStateSync() {
	l.Node.Host.SetStreamHandler("/gstd/swarm/state/1.0.0", l.handleStateRequest)
	log.Printf("📡 [Swarm Ledger] State Synchronization Protocol Active (/gstd/swarm/state/1.0.0)")
}

// handleStateRequest streams the current state to a requesting peer.
func (l *Ledger) handleStateRequest(s network.Stream) {
	defer s.Close()
	l.State.mu.RLock()
	defer l.State.mu.RUnlock()

	snapshot := struct {
		Balances map[string]float64 `json:"balances"`
		Nonce    map[string]int64   `json:"nonce"`
	}{
		Balances: l.State.Balances,
		Nonce:    l.State.Nonce,
	}

	if err := json.NewEncoder(s).Encode(snapshot); err != nil {
		log.Printf("❌ [Swarm Ledger] Failed to send state snapshot: %v", err)
	}
}

// SyncStateFromPeers attempts to bootstrap the node's local LedgerState by securely fetching it from active P2P peers.
func (l *Ledger) SyncStateFromPeers(ctx context.Context) {
	log.Printf("🔄 [Swarm Ledger] Bootstrapping: Requesting L1 state from P2P peers...")
	peers := l.Node.Host.Network().Peers()
	if len(peers) == 0 {
		log.Printf("⚠️ [Swarm Ledger] No peers connected yet. Acting as Genesis Island.")
		return
	}

	for _, p := range peers {
		// Try to open a state sync stream to this peer
		s, err := l.Node.Host.NewStream(ctx, p, "/gstd/swarm/state/1.0.0")
		if err != nil {
			continue // Peer might not support state sync yet, try next
		}
		defer s.Close()

		var snapshot struct {
			Balances map[string]float64 `json:"balances"`
			Nonce    map[string]int64   `json:"nonce"`
		}

		if err := json.NewDecoder(s).Decode(&snapshot); err == nil {
			l.State.mu.Lock()
			
			// Basic Validation / Consensus Rule: For our prototype, we adopt the state from the first peer 
			// if their state graph is richer (meaning they've processed more transactions than our local hardcoded genesis).
			// In production, this securely uses Merkle-Patricia trees or Block Headers.
			if len(snapshot.Balances) >= len(l.State.Balances) && len(snapshot.Nonce) >= len(l.State.Nonce) {
				l.State.Balances = snapshot.Balances
				l.State.Nonce = snapshot.Nonce
				log.Printf("📥 [Swarm Ledger] Successfully synced state from peer %s! (Accounts: %d)", p.String()[:12], len(snapshot.Balances))
			} else {
				log.Printf("ℹ️ [Swarm Ledger] Peer %s offered stale state. Rejected.", p.String()[:12])
			}
			l.State.mu.Unlock()
			return // Successfully synced from one peer, no need to ask others right now
		}
	}
	
	log.Printf("⚠️ [Swarm Ledger] State sync failed across %d peers.", len(peers))
}

// GetAccountState safely fetches the specified address' balance and nonce.
func (l *Ledger) GetAccountState(address string) (balance float64, nonce int64) {
	l.State.mu.RLock()
	defer l.State.mu.RUnlock()
	return l.State.Balances[address], l.State.Nonce[address]
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
