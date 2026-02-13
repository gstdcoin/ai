package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/tetratelabs/wazero"
)

// WasmVerifierService handles the verification of WASM task results
// Uses Wazero (pure Go WASM runtime) for validation
type WasmVerifierService struct {
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

// VerifyBinary checks if the WASM binary hash matches expected hash
func (s *WasmVerifierService) VerifyBinary(ctx context.Context, binaryData []byte, expectedHash string) (bool, error) {
	if len(binaryData) == 0 {
		return false, fmt.Errorf("empty binary data")
	}
	hash := sha256.Sum256(binaryData)
	hashString := hex.EncodeToString(hash[:])
	s.mutex.RLock()
	isVerified := s.verifiedBinaries[hashString]
	s.mutex.RUnlock()
	if isVerified {
		return true, nil
	}
	if expectedHash != "" && hashString != expectedHash {
		return false, fmt.Errorf("hash mismatch: expected %s, got %s", expectedHash, hashString)
	}
	s.mutex.Lock()
	s.verifiedBinaries[hashString] = true
	s.mutex.Unlock()
	return true, nil
}

// VerifyResult validates that wasm_binary is loadable and result_data is acceptable.
// Uses Wazero to instantiate the WASM module; returns true if valid, false otherwise.
func (s *WasmVerifierService) VerifyResult(ctx context.Context, wasmBinary []byte, resultData []byte) (bool, error) {
	if len(wasmBinary) == 0 {
		return false, fmt.Errorf("empty wasm binary")
	}
	if len(resultData) == 0 {
		return false, fmt.Errorf("empty result data")
	}
	if len(resultData) > 10*1024*1024 {
		return false, fmt.Errorf("result size exceeds 10MB limit")
	}

	runtime := wazero.NewRuntime(ctx)
	defer runtime.Close(ctx)

	// Instantiate WASM module - validates binary is loadable
	mod, err := runtime.Instantiate(ctx, wasmBinary)
	if err != nil {
		log.Printf("WasmVerifier: failed to instantiate WASM: %v", err)
		return false, err
	}
	defer mod.Close(ctx)

	// Module loaded successfully; result_data passes size check
	return true, nil
}

// VerifyResultLegacy preserves the old API (taskID, resultData) for backward compatibility
func (s *WasmVerifierService) VerifyResultLegacy(ctx context.Context, taskID string, resultData []byte) (*VerificationResult, error) {
	if len(resultData) == 0 {
		return &VerificationResult{Valid: false, Error: "empty result data", Timestamp: time.Now().Unix()}, nil
	}
	if len(resultData) > 10*1024*1024 {
		return &VerificationResult{Valid: false, Error: "result size exceeds limit", Timestamp: time.Now().Unix()}, nil
	}
	return &VerificationResult{Valid: true, Timestamp: time.Now().Unix(), Verifier: "gstd-wasm-verifier-v1"}, nil
}
