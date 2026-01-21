package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"
)

// WasmVerifierService handles the verification of WASM task results
type WasmVerifierService struct {
	// Cache of verified binary hashes to avoid re-verifying known safe binaries
	verifiedBinaries map[string]bool
	mutex            sync.RWMutex
}

// NewWasmVerifierService creates a new verifier service
func NewWasmVerifierService() *WasmVerifierService {
	return &WasmVerifierService{
		verifiedBinaries: make(map[string]bool),
	}
}

// VerificationResult represents the result of the verification process
type VerificationResult struct {
	Valid     bool   `json:"valid"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
	Verifier  string `json:"verifier"`
}

// VerifyBinary checks if the WASM binary hash matches expected hash for Task #1
// This prevents workers from executing malicious or modified code
func (s *WasmVerifierService) VerifyBinary(ctx context.Context, binaryData []byte, expectedHash string) (bool, error) {
	if len(binaryData) == 0 {
		return false, fmt.Errorf("empty binary data")
	}

	// Calculate SHA-256 hash of the binary
	hash := sha256.Sum256(binaryData)
	hashString := hex.EncodeToString(hash[:])

	log.Printf("Verifying WASM binary. Calculated Hash: %s, Expected: %s", hashString, expectedHash)

	// Check if this hash is already verified and trusted
	s.mutex.RLock()
	isVerified := s.verifiedBinaries[hashString]
	s.mutex.RUnlock()

	if isVerified {
		return true, nil
	}

	// If expected hash is provided, verify against it
	if expectedHash != "" && hashString != expectedHash {
		return false, fmt.Errorf("hash mismatch: expected %s, got %s", expectedHash, hashString)
	}

	// In a real system, we might perform static analysis here
	// For "Task #1" validity, strict hash checking is the primary defense
	
	// Mark as verified
	s.mutex.Lock()
	s.verifiedBinaries[hashString] = true
	s.mutex.Unlock()

	return true, nil
}

// VerifyResult checks if the result output format is valid for Task #1
// Task #1 typically requires a valid JSON output or specific byte structure
func (s *WasmVerifierService) VerifyResult(ctx context.Context, taskID string, resultData []byte) (*VerificationResult, error) {
	if len(resultData) == 0 {
		return &VerificationResult{
			Valid:     false,
			Error:     "empty result data",
			Timestamp: time.Now().Unix(),
		}, nil
	}

	// Check if result is within reasonable size limits (e.g., 10MB)
	if len(resultData) > 10*1024*1024 {
		return &VerificationResult{
			Valid:     false,
			Error:     "result size exceeds limit",
			Timestamp: time.Now().Unix(),
		}, nil
	}

	// For Task #1, we might expect specific markers or structure
	// This is a placeholder for specific business logic verification
	
	return &VerificationResult{
		Valid:     true,
		Timestamp: time.Now().Unix(),
		Verifier:  "gstd-wasm-verifier-v1",
	}, nil
}
