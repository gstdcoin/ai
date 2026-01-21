package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ProofOfWorkService handles PoW challenge generation and verification
// Used to prevent spam and ensure workers perform actual computation
type ProofOfWorkService struct {
	db              *sql.DB
	challenges      map[string]*PoWChallenge // taskID -> challenge
	challengesMutex sync.RWMutex
	baseDifficulty  int // Base number of leading zeros required
}

// PoWChallenge represents a proof-of-work challenge for a task
type PoWChallenge struct {
	TaskID       string    `json:"task_id"`
	Challenge    string    `json:"challenge"`    // Random hex string
	Difficulty   int       `json:"difficulty"`   // Number of leading zero bits required
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
	WorkerWallet string    `json:"worker_wallet"`
	Verified     bool      `json:"verified"`
	VerifiedAt   *time.Time `json:"verified_at,omitempty"`
	Nonce        string    `json:"nonce,omitempty"`
}

// PoWResult represents the result of a PoW verification
type PoWResult struct {
	Valid        bool   `json:"valid"`
	HashResult   string `json:"hash_result"`
	LeadingZeros int    `json:"leading_zeros"`
	TimeTakenMs  int64  `json:"time_taken_ms"`
}

// NewProofOfWorkService creates a new PoW service
func NewProofOfWorkService(db *sql.DB) *ProofOfWorkService {
	service := &ProofOfWorkService{
		db:             db,
		challenges:     make(map[string]*PoWChallenge),
		baseDifficulty: 16, // 16 bits = ~65536 average attempts, ~100ms on modern CPU
	}
	
	// Start cleanup goroutine
	go service.cleanupExpiredChallenges()
	
	return service
}

// GenerateChallenge creates a unique PoW challenge for a task claim
// Difficulty scales with task reward: higher reward = harder challenge
func (s *ProofOfWorkService) GenerateChallenge(ctx context.Context, taskID, workerWallet string, rewardGSTD float64) (*PoWChallenge, error) {
	// Generate random challenge
	challengeBytes := make([]byte, 32)
	if _, err := rand.Read(challengeBytes); err != nil {
		return nil, fmt.Errorf("failed to generate challenge: %w", err)
	}
	
	challenge := hex.EncodeToString(challengeBytes)
	
	// Calculate difficulty based on reward
	// Base: 16 bits for 0.1 GSTD
	// Scale: +2 bits per 10x reward
	difficulty := s.calculateDifficulty(rewardGSTD)
	
	// Create challenge with 5 minute expiry
	powChallenge := &PoWChallenge{
		TaskID:       taskID,
		Challenge:    challenge,
		Difficulty:   difficulty,
		CreatedAt:    time.Now(),
		ExpiresAt:    time.Now().Add(5 * time.Minute),
		WorkerWallet: workerWallet,
		Verified:     false,
	}
	
	// Store challenge
	s.challengesMutex.Lock()
	key := s.getChallengeKey(taskID, workerWallet)
	s.challenges[key] = powChallenge
	s.challengesMutex.Unlock()
	
	// Persist to database for crash recovery
	if err := s.persistChallenge(ctx, powChallenge); err != nil {
		log.Printf("Warning: failed to persist PoW challenge: %v", err)
		// Continue - in-memory is sufficient for short-lived challenges
	}
	
	log.Printf("PoW: Generated challenge for task %s, difficulty=%d bits, expires=%v", 
		taskID, difficulty, powChallenge.ExpiresAt)
	
	return powChallenge, nil
}

// VerifyProof verifies a submitted proof-of-work
// The proof is: SHA256(challenge + taskID + workerWallet + nonce)
// Must have `difficulty` leading zero bits
func (s *ProofOfWorkService) VerifyProof(ctx context.Context, taskID, workerWallet, nonce string) (*PoWResult, error) {
	startTime := time.Now()
	
	// Get challenge
	s.challengesMutex.RLock()
	key := s.getChallengeKey(taskID, workerWallet)
	challenge, exists := s.challenges[key]
	s.challengesMutex.RUnlock()
	
	if !exists {
		// Try to load from database
		var err error
		challenge, err = s.loadChallenge(ctx, taskID, workerWallet)
		if err != nil || challenge == nil {
			return &PoWResult{Valid: false}, fmt.Errorf("no active challenge found for task %s", taskID)
		}
	}
	
	// Check expiry
	if time.Now().After(challenge.ExpiresAt) {
		return &PoWResult{Valid: false}, fmt.Errorf("challenge expired")
	}
	
	// Check if already verified
	if challenge.Verified {
		return &PoWResult{Valid: false}, fmt.Errorf("challenge already verified")
	}
	
	// Compute hash
	data := challenge.Challenge + taskID + workerWallet + nonce
	hash := sha256.Sum256([]byte(data))
	hashHex := hex.EncodeToString(hash[:])
	
	// Count leading zero bits
	leadingZeros := countLeadingZeroBits(hash[:])
	
	// Check if meets difficulty
	valid := leadingZeros >= challenge.Difficulty
	
	result := &PoWResult{
		Valid:        valid,
		HashResult:   hashHex,
		LeadingZeros: leadingZeros,
		TimeTakenMs:  time.Since(startTime).Milliseconds(),
	}
	
	if valid {
		// Mark as verified
		s.challengesMutex.Lock()
		now := time.Now()
		challenge.Verified = true
		challenge.VerifiedAt = &now
		challenge.Nonce = nonce
		s.challengesMutex.Unlock()
		
		// Update database
		if err := s.markChallengeVerified(ctx, taskID, workerWallet, nonce); err != nil {
			log.Printf("Warning: failed to persist PoW verification: %v", err)
		}
		
		log.Printf("PoW: ✅ Valid proof for task %s, hash=%s, zeros=%d/%d", 
			taskID, hashHex[:16], leadingZeros, challenge.Difficulty)
	} else {
		log.Printf("PoW: ❌ Invalid proof for task %s, zeros=%d/%d required", 
			taskID, leadingZeros, challenge.Difficulty)
	}
	
	return result, nil
}

// GetChallenge retrieves an existing challenge for a worker
func (s *ProofOfWorkService) GetChallenge(ctx context.Context, taskID, workerWallet string) (*PoWChallenge, error) {
	s.challengesMutex.RLock()
	key := s.getChallengeKey(taskID, workerWallet)
	challenge, exists := s.challenges[key]
	s.challengesMutex.RUnlock()
	
	if !exists {
		return s.loadChallenge(ctx, taskID, workerWallet)
	}
	
	return challenge, nil
}

// IsVerified checks if a worker has valid PoW for a task
func (s *ProofOfWorkService) IsVerified(ctx context.Context, taskID, workerWallet string) bool {
	s.challengesMutex.RLock()
	key := s.getChallengeKey(taskID, workerWallet)
	challenge, exists := s.challenges[key]
	s.challengesMutex.RUnlock()
	
	if exists && challenge.Verified {
		return true
	}
	
	// Check database
	challenge, err := s.loadChallenge(ctx, taskID, workerWallet)
	return err == nil && challenge != nil && challenge.Verified
}

// calculateDifficulty determines PoW difficulty based on reward
// Higher rewards require more work to prevent abuse
func (s *ProofOfWorkService) calculateDifficulty(rewardGSTD float64) int {
	if rewardGSTD <= 0 {
		return s.baseDifficulty
	}
	
	// Base: 16 bits for 0.1 GSTD (~100ms on modern CPU)
	// +2 bits per 10x reward increase
	// Max: 24 bits (~25 seconds on modern CPU)
	
	baseReward := 0.1
	scaleFactor := math.Log10(rewardGSTD / baseReward)
	additionalBits := int(scaleFactor * 2)
	
	difficulty := s.baseDifficulty + additionalBits
	
	// Clamp to reasonable range
	if difficulty < 12 {
		difficulty = 12 // Minimum ~16ms
	}
	if difficulty > 24 {
		difficulty = 24 // Maximum ~25s
	}
	
	return difficulty
}

// getChallengeKey generates a unique key for task+worker
func (s *ProofOfWorkService) getChallengeKey(taskID, workerWallet string) string {
	return taskID + ":" + workerWallet
}

// persistChallenge saves challenge to database
func (s *ProofOfWorkService) persistChallenge(ctx context.Context, challenge *PoWChallenge) error {
	query := `
		INSERT INTO pow_challenges (task_id, worker_wallet, challenge, difficulty, created_at, expires_at, verified)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (task_id, worker_wallet) 
		DO UPDATE SET challenge = $3, difficulty = $4, created_at = $5, expires_at = $6, verified = $7
	`
	
	_, err := s.db.ExecContext(ctx, query,
		challenge.TaskID,
		challenge.WorkerWallet,
		challenge.Challenge,
		challenge.Difficulty,
		challenge.CreatedAt,
		challenge.ExpiresAt,
		challenge.Verified,
	)
	
	return err
}

// loadChallenge loads challenge from database
func (s *ProofOfWorkService) loadChallenge(ctx context.Context, taskID, workerWallet string) (*PoWChallenge, error) {
	query := `
		SELECT task_id, worker_wallet, challenge, difficulty, created_at, expires_at, verified, verified_at, nonce
		FROM pow_challenges
		WHERE task_id = $1 AND worker_wallet = $2
	`
	
	challenge := &PoWChallenge{}
	var verifiedAt sql.NullTime
	var nonce sql.NullString
	
	err := s.db.QueryRowContext(ctx, query, taskID, workerWallet).Scan(
		&challenge.TaskID,
		&challenge.WorkerWallet,
		&challenge.Challenge,
		&challenge.Difficulty,
		&challenge.CreatedAt,
		&challenge.ExpiresAt,
		&challenge.Verified,
		&verifiedAt,
		&nonce,
	)
	
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	
	if verifiedAt.Valid {
		challenge.VerifiedAt = &verifiedAt.Time
	}
	if nonce.Valid {
		challenge.Nonce = nonce.String
	}
	
	// Cache in memory
	s.challengesMutex.Lock()
	key := s.getChallengeKey(taskID, workerWallet)
	s.challenges[key] = challenge
	s.challengesMutex.Unlock()
	
	return challenge, nil
}

// markChallengeVerified updates challenge status in database
func (s *ProofOfWorkService) markChallengeVerified(ctx context.Context, taskID, workerWallet, nonce string) error {
	query := `
		UPDATE pow_challenges 
		SET verified = true, verified_at = NOW(), nonce = $3
		WHERE task_id = $1 AND worker_wallet = $2
	`
	
	_, err := s.db.ExecContext(ctx, query, taskID, workerWallet, nonce)
	return err
}

// cleanupExpiredChallenges periodically removes expired challenges
func (s *ProofOfWorkService) cleanupExpiredChallenges() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()
	
	for range ticker.C {
		s.challengesMutex.Lock()
		now := time.Now()
		for key, challenge := range s.challenges {
			if now.After(challenge.ExpiresAt) {
				delete(s.challenges, key)
			}
		}
		s.challengesMutex.Unlock()
		
		// Also cleanup database
		ctx := context.Background()
		_, err := s.db.ExecContext(ctx, 
			"DELETE FROM pow_challenges WHERE expires_at < NOW() AND verified = false")
		if err != nil {
			log.Printf("Warning: failed to cleanup expired PoW challenges: %v", err)
		}
	}
}

// GetDifficultyEstimate returns estimated time to solve based on difficulty
func (s *ProofOfWorkService) GetDifficultyEstimate(difficulty int) string {
	// Average attempts = 2^difficulty
	avgAttempts := math.Pow(2, float64(difficulty))
	
	// Modern CPU can do ~1M SHA256/sec in JS, ~10M in native
	// Web Worker: ~500K/sec
	hashesPerSecond := 500000.0
	
	estimatedSeconds := avgAttempts / hashesPerSecond
	
	if estimatedSeconds < 1 {
		return fmt.Sprintf("~%dms", int(estimatedSeconds*1000))
	} else if estimatedSeconds < 60 {
		return fmt.Sprintf("~%ds", int(estimatedSeconds))
	} else {
		return fmt.Sprintf("~%dm", int(estimatedSeconds/60))
	}
}

// countLeadingZeroBits counts leading zero bits in a byte slice
func countLeadingZeroBits(data []byte) int {
	count := 0
	for _, b := range data {
		if b == 0 {
			count += 8
		} else {
			// Count leading zeros in this byte
			for i := 7; i >= 0; i-- {
				if (b >> i) & 1 == 0 {
					count++
				} else {
					return count
				}
			}
		}
	}
	return count
}

// ValidateNonceFormat checks if nonce is valid format
func ValidateNonceFormat(nonce string) error {
	// Nonce should be hex string or numeric
	if len(nonce) == 0 {
		return fmt.Errorf("nonce is empty")
	}
	if len(nonce) > 64 {
		return fmt.Errorf("nonce too long (max 64 chars)")
	}
	
	// Check if it's hex
	if strings.HasPrefix(nonce, "0x") {
		if _, err := hex.DecodeString(nonce[2:]); err != nil {
			return fmt.Errorf("invalid hex nonce: %w", err)
		}
	} else if _, err := strconv.ParseUint(nonce, 10, 64); err != nil {
		// Not a number, check if valid hex without prefix
		if _, err := hex.DecodeString(nonce); err != nil {
			return fmt.Errorf("nonce must be numeric or hex: %w", err)
		}
	}
	
	return nil
}
