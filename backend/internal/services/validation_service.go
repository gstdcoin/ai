package services

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

type ValidationService struct {
	db            *sql.DB
	trustService  *TrustV3Service
	entropyService *EntropyService
	assignmentService *AssignmentService
	encryption    *EncryptionService
	tonService    *TONService
	cacheService  *CacheService
}

func NewValidationService(db *sql.DB) *ValidationService {
	return &ValidationService{
		db: db,
	}
}

// SetDependencies sets required services (called after initialization)
func (s *ValidationService) SetDependencies(trust *TrustV3Service, entropy *EntropyService, assignment *AssignmentService, encryption *EncryptionService, tonService *TONService, cacheService *CacheService) {
	s.trustService = trust
	s.entropyService = entropy
	s.assignmentService = assignment
	s.encryption = encryption
	s.tonService = tonService
	s.cacheService = cacheService
}

// TaskResultSubmission stores a single result submission for comparison
type TaskResultSubmission struct {
	TaskID        string
	DeviceID      string
	ResultData    string // encrypted
	ResultNonce   string
	ExecutionTime int
	SubmittedAt   string
	Signature     string // Wallet signature for verification
}

// ValidateResult processes result submission and handles redundancy comparison
func (s *ValidationService) ValidateResult(ctx context.Context, taskID string, deviceID string) error {
	// Get task details including redundancy_factor
	var task struct {
		TaskID           string
		Operation        string
		RedundancyFactor int
		Status           string
		RequesterAddress string
		AssignedDevice   *string
	}

	var assignedDevice sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, operation, redundancy_factor, status, requester_address, assigned_device
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(
		&task.TaskID, &task.Operation, &task.RedundancyFactor, &task.Status,
		&task.RequesterAddress, &assignedDevice,
	)
	if err != nil {
		return fmt.Errorf("task not found: %w", err)
	}
	
	// Handle NULL assigned_device
	if assignedDevice.Valid {
		task.AssignedDevice = &assignedDevice.String
	}

	// Get all submitted results for this task
	rows, err := s.db.QueryContext(ctx, `
		SELECT assigned_device, result_data, result_nonce, execution_time_ms, result_submitted_at, result_proof
		FROM tasks
		WHERE task_id = $1 AND result_data IS NOT NULL
		ORDER BY result_submitted_at ASC
	`, taskID)
	if err != nil {
		return fmt.Errorf("failed to query results: %w", err)
	}
	defer rows.Close()

	var submissions []TaskResultSubmission
	for rows.Next() {
		var sub TaskResultSubmission
		var assignedDevice sql.NullString
		var signature sql.NullString
		err := rows.Scan(&assignedDevice, &sub.ResultData, &sub.ResultNonce, &sub.ExecutionTime, &sub.SubmittedAt, &signature)
		if err != nil {
			continue
		}
		// Handle NULL assigned_device - skip if not valid
		if !assignedDevice.Valid {
			// Skip submissions without assigned_device (should not happen, but handle gracefully)
			continue
		}
		sub.DeviceID = assignedDevice.String
		if signature.Valid {
			sub.Signature = signature.String
		}
		sub.TaskID = taskID
		submissions = append(submissions, sub)
	}

	// Verify signatures for all submissions
	for _, sub := range submissions {
		if err := s.verifySignature(ctx, taskID, sub.DeviceID, sub.ResultData, sub.Signature); err != nil {
			// Signature verification failed - mark as malicious intent
			// Decrease trust significantly for malicious intent
			if s.trustService != nil {
				s.trustService.UpdateTrustVector(ctx, sub.DeviceID, 0.0, 0.0, 0.0)
			}
			return fmt.Errorf("signature verification failed for device %s: %w", sub.DeviceID, err)
		}
	}

	// If redundancy_factor = 1, validate immediately
	if task.RedundancyFactor == 1 {
		if len(submissions) == 0 {
			return fmt.Errorf("no result submitted")
		}
		// Single result - validate and mark as validated
		latencyScore := s.calculateLatencyScore(submissions[0].ExecutionTime)
		s.trustService.UpdateTrustVector(ctx, submissions[0].DeviceID, 1.0, latencyScore, 1.0)
		return s.markTaskAsValidated(ctx, taskID, task.Operation, submissions[0].DeviceID, submissions[0].ExecutionTime)
	}

	// Multiple results needed - compare them
	if len(submissions) < task.RedundancyFactor {
		// Check validation timeout (10 minutes max wait)
		if len(submissions) > 0 {
			var firstSubmissionTime time.Time
			if submissions[0].SubmittedAt != "" {
				firstSubmissionTime, _ = time.Parse(time.RFC3339, submissions[0].SubmittedAt)
			} else {
				// If no timestamp, use current time (shouldn't happen, but safety check)
				firstSubmissionTime = time.Now()
			}
			
			validationTimeout := 10 * time.Minute
			if time.Since(firstSubmissionTime) > validationTimeout {
				// Timeout reached - use available results or mark as failed
				if len(submissions) >= (task.RedundancyFactor+1)/2 {
					// Have at least majority - proceed with validation using available results
					// This prevents tasks from hanging indefinitely
				} else {
					// Not enough results even after timeout - mark as failed
					_, err := s.db.ExecContext(ctx, `
						UPDATE tasks 
						SET status = 'failed',
						    updated_at = NOW()
						WHERE task_id = $1
					`, taskID)
					if err != nil {
						return fmt.Errorf("failed to mark task as failed: %w", err)
					}
					return fmt.Errorf("validation timeout: insufficient results after %v", validationTimeout)
				}
			} else {
				// Not enough results yet, but still within timeout - wait for more
				return nil
			}
		} else {
			// No results yet - wait for more
			return nil
		}
	}

	// Decrypt and compare results
	results := make([][]byte, 0, len(submissions))
	for _, sub := range submissions {
		taskKey := s.encryption.GenerateTaskKey(taskID, task.RequesterAddress)
		decrypted, err := s.encryption.DecryptTaskData(sub.ResultData, sub.ResultNonce, taskKey)
		if err != nil {
			return fmt.Errorf("failed to decrypt result from device %s: %w", sub.DeviceID, err)
		}
		results = append(results, decrypted)
	}

	// Compare results (simple JSON comparison for now)
	consensus, majorityResult := s.compareResults(results)
	
	if consensus {
		// Results match - validate task
		avgLatency := 0
		for _, sub := range submissions {
			avgLatency += sub.ExecutionTime
		}
		avgLatency = avgLatency / len(submissions)
		
		// Update trust for all devices (success)
		for _, sub := range submissions {
			// Accuracy = 1.0 (consensus reached), Latency based on execution time, Stability = 1.0 (completed)
			latencyScore := s.calculateLatencyScore(avgLatency)
			s.trustService.UpdateTrustVector(ctx, sub.DeviceID, 1.0, latencyScore, 1.0)
		}
		
		// Record successful execution (no collision)
		s.entropyService.RecordExecution(ctx, task.Operation, false)
		
		return s.markTaskAsValidated(ctx, taskID, task.Operation, submissions[0].DeviceID, avgLatency)
	} else {
		// Results mismatch - collision detected
		s.entropyService.RecordExecution(ctx, task.Operation, true)
		
		// Find minority result (wrong one)
		majorityIndex := -1
		for i, r := range results {
			if string(r) == string(majorityResult) {
				majorityIndex = i
				break
			}
		}
		
		// Decrease trust for devices with wrong results
		for i, sub := range submissions {
			if i != majorityIndex {
				// Wrong result - distinguish between malicious intent and technical failure
				// If signature is valid but result is wrong, it's likely a technical failure
				// If signature is invalid, it's malicious intent
				if sub.Signature != "" {
					// Technical failure - decrease accuracy but keep some trust
					s.trustService.UpdateTrustVector(ctx, sub.DeviceID, 0.3, 0.5, 0.5)
				} else {
					// Malicious intent - severe penalty
					s.trustService.UpdateTrustVector(ctx, sub.DeviceID, 0.0, 0.0, 0.0)
				}
			} else {
				// Correct result - update positively
				latencyScore := s.calculateLatencyScore(sub.ExecutionTime)
				s.trustService.UpdateTrustVector(ctx, sub.DeviceID, 1.0, latencyScore, 1.0)
			}
		}
		
		// Assign task to additional worker for arbitration
		return s.assignArbitration(ctx, taskID, task.Operation)
	}
}

// compareResults compares multiple results and returns consensus status
func (s *ValidationService) compareResults(results [][]byte) (bool, []byte) {
	if len(results) == 0 {
		return false, nil
	}
	
	// Normalize JSON for comparison
	normalized := make([]string, len(results))
	for i, r := range results {
		var v interface{}
		if err := json.Unmarshal(r, &v); err == nil {
			// Re-marshal to normalize
			if normalizedJSON, err := json.Marshal(v); err == nil {
				normalized[i] = string(normalizedJSON)
			} else {
				normalized[i] = string(r)
			}
		} else {
			normalized[i] = string(r)
		}
	}
	
	// Count occurrences
	counts := make(map[string]int)
	for _, n := range normalized {
		counts[n]++
	}
	
	// Find majority
	maxCount := 0
	var majority string
	for k, v := range counts {
		if v > maxCount {
			maxCount = v
			majority = k
		}
	}
	
	// Consensus if majority >= 50% + 1
	threshold := len(results)/2 + 1
	consensus := maxCount >= threshold
	
	return consensus, []byte(majority)
}

// calculateLatencyScore converts execution time to latency score (0.0 - 1.0)
func (s *ValidationService) calculateLatencyScore(executionTimeMs int) float64 {
	// Normalize: < 1000ms = 1.0, > 10000ms = 0.0, linear in between
	if executionTimeMs < 1000 {
		return 1.0
	}
	if executionTimeMs > 10000 {
		return 0.0
	}
	return 1.0 - float64(executionTimeMs-1000)/9000.0
}

// markTaskAsValidated marks task as validated
func (s *ValidationService) markTaskAsValidated(ctx context.Context, taskID, operation, deviceID string, avgLatency int) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'validated',
		    completed_at = NOW()
		WHERE task_id = $1
	`, taskID)
	return err
}

// verifySignature verifies the signature of a result submission using Ed25519
func (s *ValidationService) verifySignature(ctx context.Context, taskID, deviceID, resultData, signature string) error {
	// If no signature provided, reject (malicious intent)
	if signature == "" {
		return fmt.Errorf("signature missing")
	}

	// Decode signature (hex or base64)
	sigBytes, err := hex.DecodeString(signature)
	if err != nil {
		// Try base64 decoding (TonConnect format)
		sigBytes, err = base64.StdEncoding.DecodeString(signature)
		if err != nil {
			return fmt.Errorf("invalid signature format: %w", err)
		}
	}

	// Ed25519 signatures are 64 bytes
	if len(sigBytes) != 64 {
		return fmt.Errorf("invalid signature length: expected 64 bytes, got %d", len(sigBytes))
	}

	// 1. Get device's wallet address from deviceID
	var walletAddress string
	err = s.db.QueryRowContext(ctx, `
		SELECT wallet_address FROM devices WHERE device_id = $1
	`, deviceID).Scan(&walletAddress)
	if err != nil {
		return fmt.Errorf("device not found: %w", err)
	}

	// 2. Resolve wallet address to public key via TON API
	// SECURITY: No fallback - signature verification is mandatory
	if s.tonService == nil {
		return fmt.Errorf("TON service unavailable - cannot verify signature")
	}

	// Get public key (with caching support in TONService)
	pubKey, err := s.tonService.GetPublicKey(ctx, walletAddress)
	if err != nil {
		// SECURITY: If public key resolution fails, reject the signature
		// This prevents malicious workers from submitting invalid signatures when API is down
		return fmt.Errorf("failed to resolve public key for device %s: %w (signature verification required)", deviceID, err)
	}

	if len(pubKey) != 32 {
		return fmt.Errorf("invalid public key length: expected 32 bytes, got %d", len(pubKey))
	}

	// 3. Reconstruct message hash: SHA-256(taskID + resultData)
	message := taskID + resultData
	hash := sha256.Sum256([]byte(message))

	// 4. Verify Ed25519 signature with public key and message hash
	if !ed25519.Verify(pubKey, hash[:], sigBytes) {
		return fmt.Errorf("signature verification failed")
	}

	return nil
}

// assignArbitration assigns task to additional worker for arbitration
// SECURITY: Limits arbitration attempts to prevent infinite loops
func (s *ValidationService) assignArbitration(ctx context.Context, taskID, operation string) error {
	// Get current arbitration count
	var arbitrationCount sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
		SELECT arbitration_count FROM tasks WHERE task_id = $1
	`, taskID).Scan(&arbitrationCount)
	
	// If column doesn't exist, it's OK (migration will add it)
	currentCount := int64(0)
	if err == nil && arbitrationCount.Valid {
		currentCount = arbitrationCount.Int64
	}
	
	// Limit arbitration attempts to prevent infinite loops
	maxArbitrations := 3
	if currentCount >= int64(maxArbitrations) {
		// Maximum arbitration attempts reached - mark task as failed
		_, err := s.db.ExecContext(ctx, `
			UPDATE tasks 
			SET status = 'failed',
			    updated_at = NOW()
			WHERE task_id = $1
		`, taskID)
		if err != nil {
			return fmt.Errorf("failed to mark task as failed after max arbitrations: %w", err)
		}
		return fmt.Errorf("maximum arbitration attempts (%d) reached for task %s", maxArbitrations, taskID)
	}
	
	// Reset task to pending for additional worker and increment arbitration count
	// Note: If arbitration_count column doesn't exist, this will fail gracefully
	// Migration should add: ALTER TABLE tasks ADD COLUMN IF NOT EXISTS arbitration_count INTEGER DEFAULT 0;
	_, err = s.db.ExecContext(ctx, `
		UPDATE tasks 
		SET status = 'pending',
		    assigned_device = NULL,
		    assigned_at = NULL,
		    result_data = NULL,
		    result_nonce = NULL,
		    result_proof = NULL,
		    execution_time_ms = NULL,
		    result_submitted_at = NULL,
		    arbitration_count = COALESCE(arbitration_count, 0) + 1
		WHERE task_id = $1
	`, taskID)
	
	// If column doesn't exist, try without it (for backward compatibility)
	if err != nil && err.Error() != "" {
		// Try without arbitration_count column
		_, err = s.db.ExecContext(ctx, `
			UPDATE tasks 
			SET status = 'pending',
			    assigned_device = NULL,
			    assigned_at = NULL,
			    result_data = NULL,
			    result_nonce = NULL,
			    result_proof = NULL,
			    execution_time_ms = NULL,
			    result_submitted_at = NULL
			WHERE task_id = $1
		`, taskID)
	}
	
	return err
}



