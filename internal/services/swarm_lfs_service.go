package services

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"math"
	"sync"
	"time"
)

// SwarmLFSService implements the Swarm LFS protocol:
// - Tensor streaming via HTTP/2 or WebSocket
// - Integrity check (SHA256 per block)
// - On-the-fly quantization (FP32→INT8) for bandwidth optimization
type SwarmLFSService struct {
	mu         sync.RWMutex
	manifests  map[string]*LFSManifest
	blockStore map[string][]byte // model:blockID -> raw or quantized payload
}

// LFSManifest describes a model's block layout for streaming
// License Guard: license metadata for open swarm prioritization (Apache 2.0, MIT preferred)
type LFSManifest struct {
	ModelID   string        `json:"model_id"`
	Version   string        `json:"version"`
	Blocks    []LFSBlockRef `json:"blocks"`
	TotalSize int64         `json:"total_size"`
	CreatedAt time.Time     `json:"created_at"`
	License   string        `json:"license,omitempty"`   // License Guard: apache-2.0, mit, etc.
	SourceHF  string        `json:"source_hf,omitempty"` // Proxy-Hugging-Bridge: original HF model ID
}

// LFSBlockRef references a block in the manifest
type LFSBlockRef struct {
	BlockID   string `json:"block_id"`
	Seq       int    `json:"seq"`
	SizeBytes int    `json:"size_bytes"`
	Hash      string `json:"hash"`
	Quantized bool   `json:"quantized"`
}

// LFSBlock is the wire format for streaming (Integrity + optional quantization)
type LFSBlock struct {
	BlockID    string  `json:"block_id"`
	Seq        int     `json:"seq"`
	Total      int     `json:"total"`
	SizeBytes  int     `json:"size_bytes"`
	Hash       string  `json:"hash"`
	Quantized  bool    `json:"quantized"`
	Dtype      string  `json:"dtype"`
	Scale      float64 `json:"scale,omitempty"`
	ZeroPoint  float64 `json:"zero_point,omitempty"`
	PayloadB64 string  `json:"payload_b64"`
}

// NewSwarmLFSService creates the LFS service
func NewSwarmLFSService() *SwarmLFSService {
	svc := &SwarmLFSService{
		manifests:  make(map[string]*LFSManifest),
		blockStore: make(map[string][]byte),
	}
	svc.seedDemoManifest()
	return svc
}

// seedDemoManifest adds a placeholder manifest for qwen2.5-coder:7b (demo)
func (s *SwarmLFSService) seedDemoManifest() {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Demo: 4 "layers" as placeholder blocks (real implementation would load from storage)
	blocks := make([]LFSBlockRef, 4)
	for i := 0; i < 4; i++ {
		// Placeholder hash for empty/demo block
		blocks[i] = LFSBlockRef{
			BlockID:   fmt.Sprintf("layer:%d", i),
			Seq:       i,
			SizeBytes: 65536,
			Hash:      "sha256:" + hex.EncodeToString([]byte(fmt.Sprintf("demo-block-%d", i))),
			Quantized: true,
		}
	}
	s.manifests["qwen2.5-coder:7b"] = &LFSManifest{
		ModelID:   "qwen2.5-coder:7b",
		Version:   "1.0",
		Blocks:    blocks,
		TotalSize: 4 * 65536,
		CreatedAt: time.Now(),
		License:   "apache-2.0",
		SourceHF:  "Qwen/Qwen2.5-Coder-7B-Instruct",
	}
	log.Printf("[Swarm LFS] Demo manifest seeded for qwen2.5-coder:7b")
}

// AddManifest registers a new model manifest (Shard-First: admin loads model, no server disk storage)
func (s *SwarmLFSService) AddManifest(ctx context.Context, modelID string, blockCount int) (*LFSManifest, error) {
	if blockCount <= 0 {
		blockCount = 4
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	blocks := make([]LFSBlockRef, blockCount)
	for i := 0; i < blockCount; i++ {
		blocks[i] = LFSBlockRef{
			BlockID:   fmt.Sprintf("layer:%d", i),
			Seq:       i,
			SizeBytes: 65536,
			Hash:      "sha256:" + hex.EncodeToString([]byte(fmt.Sprintf("manifest-%s-%d", modelID, i))),
			Quantized: true,
		}
	}
	m := &LFSManifest{
		ModelID:   modelID,
		Version:   "1.0",
		Blocks:    blocks,
		TotalSize: int64(blockCount * 65536),
		CreatedAt: time.Now(),
	}
	s.manifests[modelID] = m
	return m, nil
}

// AddManifestWithLicense registers a new model manifest with License Guard metadata
func (s *SwarmLFSService) AddManifestWithLicense(ctx context.Context, modelID string, blockCount int, license, sourceHF string) (*LFSManifest, error) {
	m, err := s.AddManifest(ctx, modelID, blockCount)
	if err != nil {
		return nil, err
	}
	m.License = license
	m.SourceHF = sourceHF
	return m, nil
}

// GetManifest returns the manifest for a model
func (s *SwarmLFSService) GetManifest(ctx context.Context, modelID string) (*LFSManifest, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	m, ok := s.manifests[modelID]
	if !ok {
		return nil, fmt.Errorf("model not found: %s", modelID)
	}
	return m, nil
}

// GetBlock streams a single block with integrity hash and optional quantization
func (s *SwarmLFSService) GetBlock(ctx context.Context, modelID, blockID string, quantize bool) (*LFSBlock, error) {
	key := modelID + ":" + blockID
	s.mu.RLock()
	raw, ok := s.blockStore[key]
	s.mu.RUnlock()

	if !ok {
		// Generate demo block (32KB of zeros for placeholder)
		raw = make([]byte, 32768)
		s.mu.Lock()
		s.blockStore[key] = raw
		s.mu.Unlock()
	}

	var payload []byte
	var err error
	if quantize && len(raw) > 0 {
		payload, err = quantizeFP32ToINT8(raw)
		if err != nil {
			payload = raw // fallback to raw
		}
	} else {
		payload = raw
	}

	hash := sha256Hash(payload)
	payloadB64 := base64.StdEncoding.EncodeToString(payload)

	manifest, _ := s.GetManifest(ctx, modelID)
	total := 4
	seq := 0
	if manifest != nil {
		total = len(manifest.Blocks)
		for i, b := range manifest.Blocks {
			if b.BlockID == blockID {
				seq = i
				break
			}
		}
	}

	block := &LFSBlock{
		BlockID:    blockID,
		Seq:        seq,
		Total:      total,
		SizeBytes:  len(payload),
		Hash:       "sha256:" + hash,
		Quantized:  quantize,
		Dtype:      "int8",
		PayloadB64: payloadB64,
	}
	if quantize {
		block.Scale = 0.01
		block.ZeroPoint = 0
	}
	return block, nil
}

// VerifyBlockHash checks integrity (client-side call pattern)
func (s *SwarmLFSService) VerifyBlockHash(payload []byte, expectedHash string) bool {
	actual := "sha256:" + sha256Hash(payload)
	return actual == expectedHash
}

// sha256Hash returns hex-encoded SHA256 of data
func sha256Hash(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// quantizeFP32ToINT8 converts float32 bytes to uint8 (0-255) with linear mapping
// Saves ~4x bandwidth. Client decodes: fp32 = (uint8/255)*(max-min) + min
func quantizeFP32ToINT8(raw []byte) ([]byte, error) {
	if len(raw)%4 != 0 {
		return nil, fmt.Errorf("invalid fp32 length")
	}
	n := len(raw) / 4
	floats := make([]float32, n)
	for i := 0; i < n; i++ {
		floats[i] = math.Float32frombits(binary.LittleEndian.Uint32(raw[i*4 : (i+1)*4]))
	}
	min, max := floats[0], floats[0]
	for _, f := range floats {
		if f < min {
			min = f
		}
		if f > max {
			max = f
		}
	}
	span := max - min
	if span == 0 {
		span = 1
	}

	out := make([]byte, n)
	for i, f := range floats {
		q := int(math.Round(255 * float64((f-min)/span)))
		if q < 0 {
			q = 0
		}
		if q > 255 {
			q = 255
		}
		out[i] = byte(q)
	}
	return out, nil
}

// CompressBlock gzip-compresses payload for additional bandwidth savings
func (s *SwarmLFSService) CompressBlock(payload []byte) ([]byte, error) {
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write(payload); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// DecompressBlock reverses gzip (client-side)
func DecompressBlock(compressed []byte) ([]byte, error) {
	r, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return io.ReadAll(r)
}
