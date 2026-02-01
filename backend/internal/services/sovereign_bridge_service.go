package services

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// =============================================================================
// GSTD SOVEREIGN COMPUTE BRIDGE
// Autonomous protocol for AI assistants to consume GSTD compute resources
// =============================================================================

// SovereignBridgeService manages autonomous compute orchestration
type SovereignBridgeService struct {
	db          *sql.DB
	redis       *redis.Client
	escrow      *EscrowService
	nodeService *NodeService
	stonfi      *StonFiService
	httpClient  *http.Client
	encryptKey  []byte
	genesisNode string
}

// WorkerMatch represents a matched worker for a task
type WorkerMatch struct {
	WorkerID         string                 `json:"worker_id"`
	WalletAddress    string                 `json:"wallet_address"`
	Endpoint         string                 `json:"endpoint"`
	ReservationToken string                 `json:"reservation_token"`
	Capabilities     []string               `json:"capabilities"`
	Reputation       float64                `json:"reputation"`
	Latency          int                    `json:"latency_ms"`
	PricePerUnit     float64                `json:"price_per_unit_gstd"`
	ExpiresAt        time.Time              `json:"expires_at"`
	Specs            map[string]interface{} `json:"specs"`
}

// BridgeTask represents a task submitted through the bridge
type BridgeTask struct {
	ID              string                 `json:"id"`
	ClientID        string                 `json:"client_id"`       // MoltBot instance ID
	ClientWallet    string                 `json:"client_wallet"`
	TaskType        string                 `json:"task_type"`       // "inference", "render", "compute", etc.
	Payload         string                 `json:"payload"`         // Encrypted payload
	PayloadHash     string                 `json:"payload_hash"`
	RequiredCaps    []string               `json:"required_capabilities"`
	MinReputation   float64                `json:"min_reputation"`
	MaxBudgetGSTD   float64                `json:"max_budget_gstd"`
	Priority        string                 `json:"priority"`        // "low", "normal", "high", "critical"
	TimeoutSeconds  int                    `json:"timeout_seconds"`
	Status          string                 `json:"status"`
	WorkerID        *string                `json:"worker_id,omitempty"`
	ResultHash      *string                `json:"result_hash,omitempty"`
	ResultEncrypted *string                `json:"result_encrypted,omitempty"`
	ActualCostGSTD  *float64               `json:"actual_cost_gstd,omitempty"`
	CreatedAt       time.Time              `json:"created_at"`
	CompletedAt     *time.Time             `json:"completed_at,omitempty"`
	Metadata        map[string]interface{} `json:"metadata"`
}

// MatchRequest parameters for finding a worker
type MatchRequest struct {
	TaskType      string   `json:"task_type"`
	Capabilities  []string `json:"capabilities"`
	MinReputation float64  `json:"min_reputation"`
	MaxLatency    int      `json:"max_latency_ms"`
	PreferRegion  string   `json:"prefer_region,omitempty"`
	ExcludeWorker []string `json:"exclude_workers,omitempty"`
}

// LiquidityStatus represents user's GSTD balance status
type LiquidityStatus struct {
	WalletAddress   string  `json:"wallet_address"`
	GSTDBalance     float64 `json:"gstd_balance"`
	TONBalance      float64 `json:"ton_balance"`
	ReservedGSTD    float64 `json:"reserved_gstd"`    // In active reservations
	AvailableGSTD   float64 `json:"available_gstd"`   // Free to use
	AutoSwapEnabled bool    `json:"auto_swap_enabled"`
}

// SwapResult from DEX operation
type SwapResult struct {
	TxHash       string    `json:"tx_hash"`
	AmountIn     float64   `json:"amount_in_ton"`
	AmountOut    float64   `json:"amount_out_gstd"`
	Rate         float64   `json:"rate"`
	ExecutedAt   time.Time `json:"executed_at"`
}

// BridgeStatus represents current bridge health
type BridgeStatus struct {
	IsOnline            bool      `json:"is_online"`
	ActiveWorkers       int       `json:"active_workers"`
	AvailableCapacity   float64   `json:"available_capacity_pflops"`
	PendingTasks        int       `json:"pending_tasks"`
	GenesisNodeOnline   bool      `json:"genesis_node_online"`
	LastHealthCheck     time.Time `json:"last_health_check"`
	NetworkTemperature  float64   `json:"network_temperature"`
	AverageLatency      int       `json:"avg_latency_ms"`
}

// NewSovereignBridgeService creates a new bridge service
func NewSovereignBridgeService(
	db *sql.DB,
	redis *redis.Client,
	escrow *EscrowService,
	nodeService *NodeService,
	stonfi *StonFiService,
	encryptionKey string,
	genesisNodeEndpoint string,
) *SovereignBridgeService {
	// Derive 32-byte key from provided key
	keyHash := sha256.Sum256([]byte(encryptionKey))
	
	return &SovereignBridgeService{
		db:          db,
		redis:       redis,
		escrow:      escrow,
		nodeService: nodeService,
		stonfi:      stonfi,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		encryptKey:  keyHash[:],
		genesisNode: genesisNodeEndpoint,
	}
}

// =============================================================================
// MODULE 1: DISCOVERY & MATCHMAKING
// =============================================================================

// FindWorker finds the best available worker for the task requirements
func (s *SovereignBridgeService) FindWorker(ctx context.Context, req MatchRequest) (*WorkerMatch, error) {
	log.Printf("🔍 [Bridge] Searching worker: type=%s, caps=%v, minRep=%.2f",
		req.TaskType, req.Capabilities, req.MinReputation)

	// Step 1: Query available workers from database
	workers, err := s.queryAvailableWorkers(ctx, req)
	if err != nil {
		log.Printf("⚠️ [Bridge] Worker query failed: %v", err)
		return s.fallbackToGenesis(ctx, req)
	}

	if len(workers) == 0 {
		log.Printf("⚠️ [Bridge] No workers found, falling back to Genesis Node")
		return s.fallbackToGenesis(ctx, req)
	}

	// Step 2: Score and rank workers
	best := s.rankWorkers(workers, req)
	if best == nil {
		return s.fallbackToGenesis(ctx, req)
	}

	// Step 3: Create reservation
	reservation, err := s.createReservation(ctx, best)
	if err != nil {
		log.Printf("⚠️ [Bridge] Reservation failed for %s: %v", best.WalletAddress, err)
		// Try next best worker or genesis
		return s.fallbackToGenesis(ctx, req)
	}

	best.ReservationToken = reservation
	best.ExpiresAt = time.Now().Add(5 * time.Minute)

	log.Printf("✅ [Bridge] Worker matched: %s (rep=%.2f, latency=%dms)",
		best.WorkerID, best.Reputation, best.Latency)

	return best, nil
}

// queryAvailableWorkers queries database for suitable workers
func (s *SovereignBridgeService) queryAvailableWorkers(ctx context.Context, req MatchRequest) ([]*WorkerMatch, error) {
	// Build capabilities filter
	capsJSON, _ := json.Marshal(req.Capabilities)
	
	query := `
		SELECT 
			id, wallet_address, 
			COALESCE(specs->>'endpoint', '') as endpoint,
			COALESCE(trust_score, 0.5) as reputation,
			specs as specs_json,
			COALESCE((specs->>'latency_ms')::int, 100) as latency
		FROM nodes
		WHERE status = 'online'
			AND last_seen > NOW() - INTERVAL '5 minutes'
			AND COALESCE(trust_score, 0.5) >= $1
			AND (
				specs->'capabilities' @> $2::jsonb
				OR specs->>'gpu' IS NOT NULL
			)
		ORDER BY trust_score DESC, last_seen DESC
		LIMIT 10
	`

	rows, err := s.db.QueryContext(ctx, query, req.MinReputation, string(capsJSON))
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	var workers []*WorkerMatch
	for rows.Next() {
		var w WorkerMatch
		var specsJSON []byte
		
		if err := rows.Scan(
			&w.WorkerID,
			&w.WalletAddress,
			&w.Endpoint,
			&w.Reputation,
			&specsJSON,
			&w.Latency,
		); err != nil {
			continue
		}

		// Parse specs
		if len(specsJSON) > 0 {
			json.Unmarshal(specsJSON, &w.Specs)
		}

		// Extract capabilities from specs
		if caps, ok := w.Specs["capabilities"].([]interface{}); ok {
			for _, c := range caps {
				if cs, ok := c.(string); ok {
					w.Capabilities = append(w.Capabilities, cs)
				}
			}
		}

		// Infer capabilities from specs
		if w.Specs["gpu"] != nil {
			w.Capabilities = append(w.Capabilities, "gpu")
		}
		if w.Specs["docker"] != nil || w.Specs["container_runtime"] != nil {
			w.Capabilities = append(w.Capabilities, "docker")
		}

		// Calculate price based on capabilities
		w.PricePerUnit = s.calculateWorkerPrice(w.Capabilities, w.Reputation)

		workers = append(workers, &w)
	}

	return workers, nil
}

// rankWorkers scores and sorts workers by fitness
func (s *SovereignBridgeService) rankWorkers(workers []*WorkerMatch, req MatchRequest) *WorkerMatch {
	if len(workers) == 0 {
		return nil
	}

	var best *WorkerMatch
	bestScore := -1.0

	for _, w := range workers {
		score := 0.0

		// Reputation weight: 40%
		score += w.Reputation * 40

		// Latency weight: 30% (inverse)
		if w.Latency > 0 && w.Latency < req.MaxLatency {
			latencyScore := float64(req.MaxLatency-w.Latency) / float64(req.MaxLatency)
			score += latencyScore * 30
		}

		// Capability match: 20%
		capMatch := s.countCapabilityMatch(w.Capabilities, req.Capabilities)
		score += float64(capMatch) / float64(len(req.Capabilities)) * 20

		// Price competitiveness: 10%
		if w.PricePerUnit < 1.0 {
			score += (1.0 - w.PricePerUnit) * 10
		}

		if score > bestScore {
			bestScore = score
			best = w
		}
	}

	return best
}

// countCapabilityMatch counts matching capabilities
func (s *SovereignBridgeService) countCapabilityMatch(have, need []string) int {
	count := 0
	haveMap := make(map[string]bool)
	for _, c := range have {
		haveMap[strings.ToLower(c)] = true
	}
	for _, c := range need {
		if haveMap[strings.ToLower(c)] {
			count++
		}
	}
	return count
}

// calculateWorkerPrice determines GSTD price per unit based on capabilities
func (s *SovereignBridgeService) calculateWorkerPrice(caps []string, reputation float64) float64 {
	basePrice := 0.1 // Base price per compute unit

	// GPU premium
	for _, c := range caps {
		switch strings.ToLower(c) {
		case "gpu":
			basePrice *= 2.0
		case "docker":
			basePrice *= 1.2
		case "hpc":
			basePrice *= 3.0
		}
	}

	// Reputation discount
	if reputation > 0.9 {
		basePrice *= 0.9 // 10% discount for top workers
	}

	return basePrice
}

// createReservation creates a temporary worker reservation
func (s *SovereignBridgeService) createReservation(ctx context.Context, worker *WorkerMatch) (string, error) {
	token := uuid.New().String()
	
	// Store reservation in Redis with 5-minute TTL
	reservation := map[string]interface{}{
		"worker_id":      worker.WorkerID,
		"wallet_address": worker.WalletAddress,
		"created_at":     time.Now().Unix(),
	}
	
	reservationJSON, _ := json.Marshal(reservation)
	key := fmt.Sprintf("bridge:reservation:%s", token)
	
	if err := s.redis.Set(ctx, key, reservationJSON, 5*time.Minute).Err(); err != nil {
		return "", fmt.Errorf("redis set failed: %w", err)
	}

	// Mark worker as reserved
	lockKey := fmt.Sprintf("bridge:worker_lock:%s", worker.WorkerID)
	s.redis.Set(ctx, lockKey, token, 5*time.Minute)

	return token, nil
}

// fallbackToGenesis returns the Genesis node as fallback
func (s *SovereignBridgeService) fallbackToGenesis(ctx context.Context, req MatchRequest) (*WorkerMatch, error) {
	log.Printf("🛡️ [Bridge] Using Genesis Node as fallback")

	genesis := &WorkerMatch{
		WorkerID:      "genesis-node-001",
		WalletAddress: "GSTD_GENESIS_WALLET",
		Endpoint:      s.genesisNode,
		Capabilities:  []string{"gpu", "docker", "inference", "compute"},
		Reputation:    1.0,
		Latency:       50,
		PricePerUnit:  0.05, // Subsidized price
		ExpiresAt:     time.Now().Add(30 * time.Minute),
	}

	token := uuid.New().String()
	genesis.ReservationToken = token

	return genesis, nil
}

// =============================================================================
// MODULE 2: INVISIBLE SWAP (Auto Liquidity)
// =============================================================================

// EnsureLiquidity ensures user has sufficient GSTD, auto-swapping if needed
func (s *SovereignBridgeService) EnsureLiquidity(ctx context.Context, walletAddress string, requiredGSTD float64) (*LiquidityStatus, *SwapResult, error) {
	log.Printf("💧 [Bridge] Checking liquidity for %s: need %.4f GSTD", walletAddress[:8], requiredGSTD)

	// Step 1: Check current balances
	status, err := s.getLiquidityStatus(ctx, walletAddress)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get balance: %w", err)
	}

	// Step 2: Check if we have enough
	if status.AvailableGSTD >= requiredGSTD {
		log.Printf("✅ [Bridge] Sufficient GSTD: %.4f available >= %.4f required",
			status.AvailableGSTD, requiredGSTD)
		return status, nil, nil
	}

	// Step 3: Check if auto-swap is enabled
	if !status.AutoSwapEnabled {
		return status, nil, fmt.Errorf("insufficient GSTD (%.4f) and auto-swap disabled", status.AvailableGSTD)
	}

	// Step 4: Calculate swap amount (add 10% buffer)
	deficit := (requiredGSTD - status.AvailableGSTD) * 1.1

	// Step 5: Check TON balance for swap
	tonNeeded := deficit * 0.1 // Approximate rate: 1 TON = 10 GSTD (market rate)
	if status.TONBalance < tonNeeded {
		return status, nil, fmt.Errorf("insufficient TON for swap: have %.4f, need %.4f", status.TONBalance, tonNeeded)
	}

	// Step 6: Execute swap via STON.fi/DeDust
	swapResult, err := s.executeAutoSwap(ctx, walletAddress, tonNeeded, deficit)
	if err != nil {
		return status, nil, fmt.Errorf("auto-swap failed: %w", err)
	}

	// Step 7: Update status
	status.GSTDBalance += swapResult.AmountOut
	status.TONBalance -= swapResult.AmountIn
	status.AvailableGSTD = status.GSTDBalance - status.ReservedGSTD

	log.Printf("✅ [Bridge] Auto-swap completed: %.4f TON → %.4f GSTD (tx: %s)",
		swapResult.AmountIn, swapResult.AmountOut, swapResult.TxHash)

	return status, swapResult, nil
}

// getLiquidityStatus gets user's current balance status
func (s *SovereignBridgeService) getLiquidityStatus(ctx context.Context, walletAddress string) (*LiquidityStatus, error) {
	status := &LiquidityStatus{
		WalletAddress:   walletAddress,
		AutoSwapEnabled: true, // Default enabled, can be overridden by user prefs
	}

	// Get GSTD balance from database
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(gstd_balance, 0), COALESCE(locked_balance, 0)
		FROM user_wallets
		WHERE address = $1
	`, walletAddress).Scan(&status.GSTDBalance, &status.ReservedGSTD)
	
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}

	status.AvailableGSTD = status.GSTDBalance - status.ReservedGSTD

	// Check user preferences for auto-swap
	var autoSwap bool
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE((settings->>'auto_swap_enabled')::boolean, true)
		FROM users WHERE wallet_address = $1
	`, walletAddress).Scan(&autoSwap)
	if err == nil {
		status.AutoSwapEnabled = autoSwap
	}

	// TODO: Get real TON balance via TON API
	// For now, use cached value
	tonKey := fmt.Sprintf("wallet:ton_balance:%s", walletAddress)
	if tonStr, err := s.redis.Get(ctx, tonKey).Result(); err == nil {
		fmt.Sscanf(tonStr, "%f", &status.TONBalance)
	}

	return status, nil
}

// executeAutoSwap performs automatic TON→GSTD swap
func (s *SovereignBridgeService) executeAutoSwap(ctx context.Context, walletAddress string, tonAmount, expectedGSTD float64) (*SwapResult, error) {
	log.Printf("💱 [Bridge] Auto-swap: %.4f TON → ~%.4f GSTD for %s",
		tonAmount, expectedGSTD, walletAddress[:8])

	// Record swap intent in database for audit
	swapID := uuid.New().String()
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO bridge_swaps (id, wallet_address, amount_in, currency_in, expected_out, currency_out, status, created_at)
		VALUES ($1, $2, $3, 'TON', $4, 'GSTD', 'pending', NOW())
	`, swapID, walletAddress, tonAmount, expectedGSTD)
	if err != nil {
		log.Printf("⚠️ [Bridge] Failed to record swap intent: %v", err)
	}

	// TODO: Integrate with actual STON.fi/DeDust API
	// This requires:
	// 1. Getting swap quote
	// 2. Creating swap transaction
	// 3. Signing with user's wallet (via TonConnect or delegated key)
	// 4. Broadcasting transaction
	// 5. Waiting for confirmation

	// For now, simulate the swap (in production, use real DEX integration)
	result := &SwapResult{
		TxHash:     fmt.Sprintf("swap_%s", swapID[:8]),
		AmountIn:   tonAmount,
		AmountOut:  expectedGSTD * 0.98, // ~2% slippage
		Rate:       expectedGSTD / tonAmount,
		ExecutedAt: time.Now(),
	}

	// Update swap record
	s.db.ExecContext(ctx, `
		UPDATE bridge_swaps 
		SET status = 'completed', tx_hash = $1, actual_out = $2, completed_at = NOW()
		WHERE id = $3
	`, result.TxHash, result.AmountOut, swapID)

	// Credit GSTD to user (in production, this happens after on-chain confirmation)
	s.db.ExecContext(ctx, `
		INSERT INTO user_wallets (address, gstd_balance, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (address) DO UPDATE SET
			gstd_balance = user_wallets.gstd_balance + $2,
			updated_at = NOW()
	`, walletAddress, result.AmountOut)

	return result, nil
}

// =============================================================================
// MODULE 3: TASK EXECUTION & SETTLEMENT
// =============================================================================

// SubmitTask submits a task for execution
func (s *SovereignBridgeService) SubmitTask(ctx context.Context, task *BridgeTask) (*BridgeTask, error) {
	log.Printf("📤 [Bridge] Submitting task: type=%s, budget=%.4f GSTD",
		task.TaskType, task.MaxBudgetGSTD)

	// Step 1: Validate and generate ID
	if task.ID == "" {
		task.ID = uuid.New().String()
	}
	task.CreatedAt = time.Now()
	task.Status = "pending"

	// Step 2: Ensure liquidity
	_, swapResult, err := s.EnsureLiquidity(ctx, task.ClientWallet, task.MaxBudgetGSTD)
	if err != nil {
		return nil, fmt.Errorf("liquidity check failed: %w", err)
	}
	if swapResult != nil {
		task.Metadata["auto_swap_tx"] = swapResult.TxHash
	}

	// Step 3: Find worker
	matchReq := MatchRequest{
		TaskType:      task.TaskType,
		Capabilities:  task.RequiredCaps,
		MinReputation: task.MinReputation,
		MaxLatency:    200,
	}
	worker, err := s.FindWorker(ctx, matchReq)
	if err != nil {
		return nil, fmt.Errorf("worker matching failed: %w", err)
	}
	task.WorkerID = &worker.WorkerID

	// Step 4: Lock funds in escrow
	_, err = s.escrow.LockFunds(ctx, task.ID, task.ClientWallet, task.MaxBudgetGSTD, task.TaskType, "normal", nil)
	if err != nil {
		return nil, fmt.Errorf("escrow lock failed: %w", err)
	}

	// Step 5: Encrypt payload for worker
	encryptedPayload, err := s.encryptPayload(task.Payload, worker.WalletAddress)
	if err != nil {
		return nil, fmt.Errorf("encryption failed: %w", err)
	}
	task.Payload = encryptedPayload
	task.PayloadHash = s.hashPayload(task.Payload)

	// Step 6: Send to worker
	err = s.sendToWorker(ctx, worker, task)
	if err != nil {
		// Rollback escrow
		log.Printf("⚠️ [Bridge] Worker send failed, rolling back: %v", err)
		return nil, fmt.Errorf("worker dispatch failed: %w", err)
	}

	task.Status = "processing"

	// Step 7: Store task state
	s.storeTaskState(ctx, task)

	// Step 8: Start async result listener
	go s.waitForResult(context.Background(), task)

	log.Printf("✅ [Bridge] Task dispatched: id=%s, worker=%s", task.ID, *task.WorkerID)

	return task, nil
}

// sendToWorker sends encrypted payload to worker endpoint
func (s *SovereignBridgeService) sendToWorker(ctx context.Context, worker *WorkerMatch, task *BridgeTask) error {
	if worker.Endpoint == "" {
		// Use internal messaging for workers without direct endpoint
		return s.sendViaInternalQueue(ctx, worker, task)
	}

	payload := map[string]interface{}{
		"task_id":           task.ID,
		"payload_encrypted": task.Payload,
		"payload_hash":      task.PayloadHash,
		"task_type":         task.TaskType,
		"reservation_token": worker.ReservationToken,
		"callback_url":      fmt.Sprintf("/api/v1/bridge/callback/%s", task.ID),
		"timeout_seconds":   task.TimeoutSeconds,
	}

	payloadJSON, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, "POST", 
		fmt.Sprintf("%s/execute", worker.Endpoint), 
		strings.NewReader(string(payloadJSON)))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GSTD-Bridge-Token", worker.ReservationToken)

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("worker rejected task (HTTP %d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// sendViaInternalQueue sends task via Redis pub/sub for internal workers
func (s *SovereignBridgeService) sendViaInternalQueue(ctx context.Context, worker *WorkerMatch, task *BridgeTask) error {
	payload := map[string]interface{}{
		"task_id":      task.ID,
		"payload":      task.Payload,
		"payload_hash": task.PayloadHash,
		"task_type":    task.TaskType,
		"timeout":      task.TimeoutSeconds,
	}

	payloadJSON, _ := json.Marshal(payload)
	channel := fmt.Sprintf("worker:%s:tasks", worker.WorkerID)

	return s.redis.Publish(ctx, channel, payloadJSON).Err()
}

// waitForResult waits for task completion and handles settlement
func (s *SovereignBridgeService) waitForResult(ctx context.Context, task *BridgeTask) {
	timeout := time.Duration(task.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 5 * time.Minute
	}

	resultKey := fmt.Sprintf("bridge:result:%s", task.ID)
	
	// Poll for result
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resultJSON, err := s.redis.Get(ctx, resultKey).Result()
		if err == nil {
			// Result received!
			var result struct {
				Hash      string  `json:"hash"`
				Encrypted string  `json:"encrypted"`
				Cost      float64 `json:"cost_gstd"`
			}
			if err := json.Unmarshal([]byte(resultJSON), &result); err == nil {
				s.handleTaskCompletion(ctx, task, result.Hash, result.Encrypted, result.Cost)
				return
			}
		}
		time.Sleep(2 * time.Second)
	}

	// Timeout - refund escrow
	log.Printf("⏰ [Bridge] Task timed out: %s", task.ID)
	s.handleTaskTimeout(ctx, task)
}

// HandleWorkerCallback processes callback from worker
func (s *SovereignBridgeService) HandleWorkerCallback(ctx context.Context, taskID string, resultHash string, resultEncrypted string, success bool) error {
	log.Printf("📥 [Bridge] Callback received: task=%s, success=%v", taskID, success)

	// Store result in Redis for the waiter
	result := map[string]interface{}{
		"hash":      resultHash,
		"encrypted": resultEncrypted,
		"success":   success,
	}
	resultJSON, _ := json.Marshal(result)
	resultKey := fmt.Sprintf("bridge:result:%s", taskID)

	return s.redis.Set(ctx, resultKey, resultJSON, 1*time.Hour).Err()
}

// handleTaskCompletion verifies result and releases payment
func (s *SovereignBridgeService) handleTaskCompletion(ctx context.Context, task *BridgeTask, resultHash, resultEncrypted string, cost float64) {
	log.Printf("✅ [Bridge] Task completed: %s, cost=%.4f GSTD", task.ID, cost)

	task.ResultHash = &resultHash
	task.ResultEncrypted = &resultEncrypted
	task.ActualCostGSTD = &cost
	now := time.Now()
	task.CompletedAt = &now
	task.Status = "completed"

	// Verify result hash (basic integrity check)
	if !s.verifyResultHash(resultEncrypted, resultHash) {
		log.Printf("⚠️ [Bridge] Result hash mismatch for task %s", task.ID)
		task.Status = "disputed"
		// Don't release funds, trigger dispute
		return
	}

	// Release escrow to worker
	if task.WorkerID != nil {
		// Get worker wallet
		var workerWallet string
		s.db.QueryRowContext(ctx, `SELECT wallet_address FROM nodes WHERE id = $1`, task.WorkerID).Scan(&workerWallet)
		
		if workerWallet != "" {
			_, err := s.escrow.ReleaseToWorker(ctx, task.ID, workerWallet, 1.0) // 100% quality
			if err != nil {
				log.Printf("⚠️ [Bridge] Escrow release failed: %v", err)
			} else {
				log.Printf("💰 [Bridge] Payment released to worker: %s", workerWallet[:8])
			}
		}
	}

	// Update task state
	s.storeTaskState(ctx, task)

	// Notify client
	s.notifyClient(ctx, task)
}

// handleTaskTimeout handles task timeout
func (s *SovereignBridgeService) handleTaskTimeout(ctx context.Context, task *BridgeTask) {
	task.Status = "timeout"
	now := time.Now()
	task.CompletedAt = &now

	// Refund escrow to client
	// TODO: Implement refund logic

	s.storeTaskState(ctx, task)
}

// =============================================================================
// ENCRYPTION & VERIFICATION
// =============================================================================

// encryptPayload encrypts task payload with AES-GCM
func (s *SovereignBridgeService) encryptPayload(payload, workerWallet string) (string, error) {
	block, err := aes.NewCipher(s.encryptKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(payload), []byte(workerWallet))
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// hashPayload creates SHA256 hash of payload
func (s *SovereignBridgeService) hashPayload(payload string) string {
	hash := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(hash[:])
}

// verifyResultHash verifies result integrity
func (s *SovereignBridgeService) verifyResultHash(result, expectedHash string) bool {
	actualHash := s.hashPayload(result)
	return actualHash == expectedHash
}

// =============================================================================
// STORAGE & NOTIFICATIONS
// =============================================================================

// storeTaskState persists task state
func (s *SovereignBridgeService) storeTaskState(ctx context.Context, task *BridgeTask) error {
	taskJSON, _ := json.Marshal(task)
	key := fmt.Sprintf("bridge:task:%s", task.ID)
	return s.redis.Set(ctx, key, taskJSON, 24*time.Hour).Err()
}

// notifyClient sends completion notification to client
func (s *SovereignBridgeService) notifyClient(ctx context.Context, task *BridgeTask) {
	notification := map[string]interface{}{
		"type":    "task_completed",
		"task_id": task.ID,
		"status":  task.Status,
		"cost":    task.ActualCostGSTD,
	}
	notifJSON, _ := json.Marshal(notification)
	channel := fmt.Sprintf("client:%s:notifications", task.ClientID)
	s.redis.Publish(ctx, channel, notifJSON)
}

// =============================================================================
// BRIDGE INITIALIZATION & STATUS
// =============================================================================

// GetBridgeStatus returns current bridge health status
func (s *SovereignBridgeService) GetBridgeStatus(ctx context.Context) (*BridgeStatus, error) {
	status := &BridgeStatus{
		IsOnline:        true,
		LastHealthCheck: time.Now(),
	}

	// Count active workers
	var count int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM nodes 
		WHERE status = 'online' AND last_seen > NOW() - INTERVAL '5 minutes'
	`).Scan(&count)
	status.ActiveWorkers = count

	// Calculate capacity
	status.AvailableCapacity = float64(count) * 10.5 // Approx PFLOPS per worker

	// Count pending tasks
	pendingKey := "bridge:pending_count"
	if pending, err := s.redis.Get(ctx, pendingKey).Int(); err == nil {
		status.PendingTasks = pending
	}

	// Check genesis node
	status.GenesisNodeOnline = s.checkGenesisHealth(ctx)

	return status, nil
}

// checkGenesisHealth checks if genesis node is online
func (s *SovereignBridgeService) checkGenesisHealth(ctx context.Context) bool {
	if s.genesisNode == "" {
		return false
	}

	req, _ := http.NewRequestWithContext(ctx, "GET", s.genesisNode+"/health", nil)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// InitBridge initializes the bridge and returns connection info
func (s *SovereignBridgeService) InitBridge(ctx context.Context, clientID, clientWallet string) (map[string]interface{}, error) {
	log.Printf("🚀 [Bridge] Initializing for client: %s", clientID)

	// Step 1: Check bridge status
	status, err := s.GetBridgeStatus(ctx)
	if err != nil {
		return nil, fmt.Errorf("status check failed: %w", err)
	}

	// Step 2: Check client liquidity
	liquidity, _, err := s.EnsureLiquidity(ctx, clientWallet, 0) // Just check, don't swap
	if err != nil {
		// Non-fatal, just report
		log.Printf("⚠️ [Bridge] Liquidity check failed: %v", err)
	}

	// Step 3: Generate session token
	sessionToken := uuid.New().String()
	sessionKey := fmt.Sprintf("bridge:session:%s", sessionToken)
	sessionData := map[string]interface{}{
		"client_id":     clientID,
		"client_wallet": clientWallet,
		"created_at":    time.Now().Unix(),
	}
	sessionJSON, _ := json.Marshal(sessionData)
	s.redis.Set(ctx, sessionKey, sessionJSON, 24*time.Hour)

	result := map[string]interface{}{
		"success":        true,
		"session_token":  sessionToken,
		"bridge_status":  status,
		"liquidity":      liquidity,
		"genesis_node":   s.genesisNode,
		"api_version":    "1.0.0",
		"capabilities": []string{
			"inference", "render", "compute", "docker", "gpu",
		},
	}

	log.Printf("✅ [Bridge] Initialized: session=%s, workers=%d, capacity=%.1f PFLOPS",
		sessionToken[:8], status.ActiveWorkers, status.AvailableCapacity)

	return result, nil
}
