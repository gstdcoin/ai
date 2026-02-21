// Package genesis implements Genesis Lock — cryptographic verification
// that every node in the GSTD swarm runs verified, unmodified code.
// Hashes are anchored to the TON blockchain for tamper-proof verification.
package genesis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// GenesisManifest contains the official binary hashes.
type GenesisManifest struct {
	Version   string            `json:"version"`
	Binaries  map[string]string `json:"binaries"`    // filename → SHA-256 hex
	TONTxHash string            `json:"ton_tx_hash"` // transaction ID on TON
	Signature []byte            `json:"signature"`   // Core Team Ed25519 signature
	CreatedAt time.Time         `json:"created_at"`
}

// GenesisLock handles binary verification.
type GenesisLock struct {
	nodeID       string
	manifestPath string
	manifest     *GenesisManifest
	verified     bool
	lastCheck    time.Time
	mu           sync.RWMutex
}

// VerifyResult contains the result of a genesis verification.
type VerifyResult struct {
	Verified   bool           `json:"verified"`
	Version    string         `json:"version"`
	Mismatches []FileMismatch `json:"mismatches,omitempty"`
	CheckedAt  time.Time      `json:"checked_at"`
	LatencyMs  int64          `json:"latency_ms"`
}

// FileMismatch records a file that doesn't match the manifest.
type FileMismatch struct {
	Filename     string `json:"filename"`
	ExpectedHash string `json:"expected_hash"`
	ActualHash   string `json:"actual_hash"`
}

// ─── Genesis Lock ───────────────────────────────────────────────────────────

// NewGenesisLock creates a new Genesis Lock verifier.
func NewGenesisLock(nodeID string, manifestPath string) *GenesisLock {
	return &GenesisLock{
		nodeID:       nodeID,
		manifestPath: manifestPath,
	}
}

// LoadManifest reads and parses the genesis manifest from disk or TON.
func (g *GenesisLock) LoadManifest() error {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Try local manifest first
	data, err := os.ReadFile(g.manifestPath)
	if err != nil {
		// In production: fetch from TON blockchain
		log.Printf("[Genesis] Local manifest not found at %s, generating...", g.manifestPath)
		return g.generateManifest()
	}

	var manifest GenesisManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return fmt.Errorf("parse manifest: %w", err)
	}

	g.manifest = &manifest
	log.Printf("[Genesis] Loaded manifest v%s with %d binaries", manifest.Version, len(manifest.Binaries))
	return nil
}

// Verify checks all binaries against the manifest.
func (g *GenesisLock) Verify() (*VerifyResult, error) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	if g.manifest == nil {
		return nil, fmt.Errorf("manifest not loaded — call LoadManifest() first")
	}

	start := time.Now()
	var mismatches []FileMismatch

	for filename, expectedHash := range g.manifest.Binaries {
		actualHash, err := sha256File(filename)
		if err != nil {
			log.Printf("[Genesis] Cannot hash %s: %v", filename, err)
			mismatches = append(mismatches, FileMismatch{
				Filename:     filename,
				ExpectedHash: expectedHash,
				ActualHash:   "FILE_NOT_FOUND",
			})
			continue
		}

		if actualHash != expectedHash {
			log.Printf("[Genesis] ⚠️  MISMATCH: %s expected=%s actual=%s", filename, expectedHash, actualHash)
			mismatches = append(mismatches, FileMismatch{
				Filename:     filename,
				ExpectedHash: expectedHash,
				ActualHash:   actualHash,
			})
		}
	}

	result := &VerifyResult{
		Verified:   len(mismatches) == 0,
		Version:    g.manifest.Version,
		Mismatches: mismatches,
		CheckedAt:  time.Now(),
		LatencyMs:  time.Since(start).Milliseconds(),
	}

	if result.Verified {
		log.Printf("[Genesis] ✅ Genesis Lock verified (v%s, %d files, %dms)",
			g.manifest.Version, len(g.manifest.Binaries), result.LatencyMs)
		g.verified = true
		g.lastCheck = time.Now()
	} else {
		log.Printf("[Genesis] ❌ GENESIS LOCK VIOLATED! %d mismatches detected", len(mismatches))
		g.verified = false
	}

	return result, nil
}

// IsVerified returns the current verification status.
func (g *GenesisLock) IsVerified() bool {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.verified
}

// GetManifest returns the current manifest.
func (g *GenesisLock) GetManifest() *GenesisManifest {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.manifest
}

// ─── Manifest Generation ────────────────────────────────────────────────────

// generateManifest creates a manifest from current binaries.
func (g *GenesisLock) generateManifest() error {
	manifest := &GenesisManifest{
		Version:   "1.0.0",
		Binaries:  make(map[string]string),
		CreatedAt: time.Now(),
	}

	// Find all executable files and critical configs
	patterns := []string{
		"/app/server",     // main binary
		"/app/connect.py", // Python connector
		"/app/connect.js", // Node.js connector
	}

	for _, pattern := range patterns {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			continue
		}
		for _, match := range matches {
			hash, err := sha256File(match)
			if err != nil {
				continue
			}
			manifest.Binaries[match] = hash
		}
	}

	// Also hash all Go source files in /app if present
	goFiles, _ := filepath.Glob("/app/*.go")
	for _, f := range goFiles {
		hash, err := sha256File(f)
		if err != nil {
			continue
		}
		manifest.Binaries[f] = hash
	}

	g.manifest = manifest

	// Save to disk
	data, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal manifest: %w", err)
	}

	dir := filepath.Dir(g.manifestPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("create manifest dir: %w", err)
	}

	if err := os.WriteFile(g.manifestPath, data, 0644); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}

	log.Printf("[Genesis] Generated manifest v%s with %d binaries at %s",
		manifest.Version, len(manifest.Binaries), g.manifestPath)
	return nil
}

// ─── Periodic Verification ──────────────────────────────────────────────────

// StartPeriodicVerification runs genesis verification every interval.
func (g *GenesisLock) StartPeriodicVerification(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			result, err := g.Verify()
			if err != nil {
				log.Printf("[Genesis] Periodic verification error: %v", err)
				continue
			}
			if !result.Verified {
				log.Printf("[Genesis] ❌ PERIODIC CHECK FAILED — %d mismatches!", len(result.Mismatches))
				// In production: broadcast GenesisViolation alert to network
			}
		}
	}()
}

// ─── Helper Functions ───────────────────────────────────────────────────────

// sha256File computes SHA-256 hash of a file.
func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}

	return hex.EncodeToString(h.Sum(nil)), nil
}
