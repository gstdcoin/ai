// Package hive implements Hive Memory — the swarm's collective knowledge store.
// Uses content-addressed storage with DHT routing, Erasure Coding for
// redundancy, and HNSW indexing for semantic search.
package hive

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"math"
	"sort"
	"sync"
	"time"
)

// ─── Types ──────────────────────────────────────────────────────────────────

// ContentID is SHA3-256 hash of content (content-addressed storage).
type ContentID [32]byte

func (c ContentID) String() string { return hex.EncodeToString(c[:]) }

// NodeID uniquely identifies a node in the DHT.
type NodeID [32]byte

func (n NodeID) String() string { return hex.EncodeToString(n[:]) }

// KnowType classifies knowledge blocks.
type KnowType string

const (
	KnowFactual    KnowType = "factual"
	KnowProcedural KnowType = "procedural"
	KnowContextual KnowType = "contextual"
	KnowEphemeral  KnowType = "ephemeral"
	KnowLearned    KnowType = "learned"
)

// VoteType for consensus voting on knowledge blocks.
type VoteType int

const (
	VoteValid   VoteType = 1
	VoteInvalid VoteType = -1
	VoteAbstain VoteType = 0
)

// ─── Knowledge Block ────────────────────────────────────────────────────────

// KnowledgeBlock is the fundamental unit of storage in Hive Memory.
type KnowledgeBlock struct {
	ID          ContentID   `json:"id"`
	Content     []byte      `json:"content"` // AES-256-GCM encrypted
	ContentType KnowType    `json:"content_type"`
	Embedding   []float32   `json:"embedding"` // 1536-dim vector
	Tags        []string    `json:"tags"`
	Language    string      `json:"language"`
	ContentHash []byte      `json:"content_hash"` // SHA-256 before encryption
	Signature   []byte      `json:"signature"`    // Ed25519(Author, Hash)
	AuthorKey   []byte      `json:"author_key"`   // public key
	TrustScore  float64     `json:"trust_score"`  // 0.0-1.0
	Shards      []ShardInfo `json:"shards"`
	CreatedAt   time.Time   `json:"created_at"`
	ExpiresAt   *time.Time  `json:"expires_at,omitempty"`
}

// ShardInfo tracks where Erasure Coding fragments are stored.
type ShardInfo struct {
	ShardIndex uint8  `json:"shard_index"` // 0-15
	NodeID     NodeID `json:"node_id"`
	Region     string `json:"region"`
	ShardHash  []byte `json:"shard_hash"` // SHA-256 of fragment
}

// StoreReceipt is returned after successful storage.
type StoreReceipt struct {
	ID          ContentID `json:"id"`
	ShardsOK    int       `json:"shards_ok"`
	ShardsTotal int       `json:"shards_total"`
	MerkleRoot  []byte    `json:"merkle_root"`
	StoredAt    time.Time `json:"stored_at"`
}

// SearchQuery defines parameters for semantic search.
type SearchQuery struct {
	Embedding []float32  `json:"embedding,omitempty"`
	Text      string     `json:"text,omitempty"`
	TopK      int        `json:"top_k"`
	MinTrust  float64    `json:"min_trust"`
	Types     []KnowType `json:"types,omitempty"`
	Languages []string   `json:"languages,omitempty"`
}

// SearchResult contains ranked results.
type SearchResult struct {
	Items   []SearchItem `json:"items"`
	Total   int          `json:"total"`
	QueryMs int64        `json:"query_ms"`
}

// SearchItem is a single search result.
type SearchItem struct {
	Block       *KnowledgeBlock `json:"block"`
	Score       float64         `json:"score"` // combined score
	CosineSim   float64         `json:"cosine_sim"`
	TrustWeight float64         `json:"trust_weight"`
	FreshWeight float64         `json:"fresh_weight"`
}

// MerkleProof provides cryptographic verification.
type MerkleProof struct {
	Root  []byte   `json:"root"`
	Path  [][]byte `json:"path"`
	Index int      `json:"index"`
}

// ConsensusResult from validation voting.
type ConsensusResult struct {
	Valid        bool    `json:"valid"`
	VotesFor     int     `json:"votes_for"`
	VotesAgainst int     `json:"votes_against"`
	TrustScore   float64 `json:"trust_score"`
}

// ─── HiveStore Interface ────────────────────────────────────────────────────

// HiveStore is the core interface for Hive Memory operations.
type HiveStore interface {
	Store(ctx context.Context, block *KnowledgeBlock) (*StoreReceipt, error)
	Get(ctx context.Context, id ContentID) (*KnowledgeBlock, error)
	Search(ctx context.Context, q SearchQuery) (*SearchResult, error)
	GetWithProof(ctx context.Context, id ContentID) (*KnowledgeBlock, *MerkleProof, error)
	Validate(ctx context.Context, id ContentID) (*ConsensusResult, error)
	VoteFor(ctx context.Context, id ContentID, vote VoteType) error
}

// ─── Default Erasure Config ─────────────────────────────────────────────────

// ErasureConfig defines Reed-Solomon parameters for redundancy.
type ErasureConfig struct {
	DataShards   int // required fragments to reconstruct
	ParityShards int // additional redundancy fragments
}

// DefaultErasure: 16 total shards, need any 10 to reconstruct.
var DefaultErasure = ErasureConfig{DataShards: 10, ParityShards: 6}

// ─── In-Memory HiveStore Implementation ─────────────────────────────────────

// MemoryHiveStore is the local in-memory implementation of HiveStore.
// In production, this is backed by BadgerDB + Kademlia DHT.
type MemoryHiveStore struct {
	blocks  map[ContentID]*KnowledgeBlock
	vectors []vectorEntry
	votes   map[ContentID][]VoteType
	mu      sync.RWMutex
}

type vectorEntry struct {
	id        ContentID
	embedding []float32
}

// NewMemoryHiveStore creates a new in-memory Hive store.
func NewMemoryHiveStore() *MemoryHiveStore {
	return &MemoryHiveStore{
		blocks:  make(map[ContentID]*KnowledgeBlock),
		vectors: make([]vectorEntry, 0),
		votes:   make(map[ContentID][]VoteType),
	}
}

// Store saves a KnowledgeBlock to memory and indexes its embedding.
func (m *MemoryHiveStore) Store(ctx context.Context, block *KnowledgeBlock) (*StoreReceipt, error) {
	// 1. Compute ContentID from content
	hash := sha256.Sum256(block.Content)
	block.ID = ContentID(hash)
	block.ContentHash = hash[:]
	block.CreatedAt = time.Now()

	// 2. Encrypt content (AES-256-GCM)
	key := deriveKey(block.ID)
	encrypted, err := encryptAESGCM(key, block.Content)
	if err != nil {
		return nil, fmt.Errorf("encrypt content: %w", err)
	}
	block.Content = encrypted

	// 3. Store block
	m.mu.Lock()
	m.blocks[block.ID] = block
	if len(block.Embedding) > 0 {
		m.vectors = append(m.vectors, vectorEntry{
			id:        block.ID,
			embedding: block.Embedding,
		})
	}
	m.mu.Unlock()

	log.Printf("[Hive] Stored block %s (type=%s, trust=%.2f)", block.ID, block.ContentType, block.TrustScore)

	return &StoreReceipt{
		ID:          block.ID,
		ShardsOK:    1, // local store: 1 shard
		ShardsTotal: 1,
		MerkleRoot:  hash[:],
		StoredAt:    time.Now(),
	}, nil
}

// Get retrieves a KnowledgeBlock by ContentID.
func (m *MemoryHiveStore) Get(ctx context.Context, id ContentID) (*KnowledgeBlock, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	block, ok := m.blocks[id]
	if !ok {
		return nil, fmt.Errorf("block not found: %s", id)
	}

	// Decrypt content
	key := deriveKey(id)
	decrypted, err := decryptAESGCM(key, block.Content)
	if err != nil {
		return nil, fmt.Errorf("decrypt content: %w", err)
	}

	// Return copy with decrypted content
	result := *block
	result.Content = decrypted
	return &result, nil
}

// Search performs semantic similarity search.
// Ranking formula: Score = 0.6*cosine + 0.3*TrustScore + 0.1*Freshness
func (m *MemoryHiveStore) Search(ctx context.Context, q SearchQuery) (*SearchResult, error) {
	start := time.Now()

	if len(q.Embedding) == 0 && q.Text == "" {
		return nil, fmt.Errorf("search requires embedding or text")
	}

	queryEmb := q.Embedding
	if len(queryEmb) == 0 {
		// In production: vectorize text via embedding model
		return nil, fmt.Errorf("text-based search requires embedding service")
	}

	if q.TopK <= 0 {
		q.TopK = 10
	}

	m.mu.RLock()
	defer m.mu.RUnlock()

	var results []SearchItem

	for _, ve := range m.vectors {
		block, ok := m.blocks[ve.id]
		if !ok {
			continue
		}

		// Apply filters
		if block.TrustScore < q.MinTrust {
			continue
		}
		if len(q.Types) > 0 && !containsKnowType(q.Types, block.ContentType) {
			continue
		}
		if len(q.Languages) > 0 && !containsString(q.Languages, block.Language) {
			continue
		}

		// Calculate cosine similarity
		cosSim := cosineSimilarity(queryEmb, ve.embedding)

		// Freshness score (exponentially decay over 30 days)
		age := time.Since(block.CreatedAt).Hours() / 24 // days
		freshness := math.Exp(-age / 30.0)

		// Combined score: 0.6*cosine + 0.3*trust + 0.1*freshness
		score := 0.6*cosSim + 0.3*block.TrustScore + 0.1*freshness

		results = append(results, SearchItem{
			Block:       block,
			Score:       score,
			CosineSim:   cosSim,
			TrustWeight: block.TrustScore,
			FreshWeight: freshness,
		})
	}

	// Sort by score descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	// Limit to TopK
	if len(results) > q.TopK {
		results = results[:q.TopK]
	}

	return &SearchResult{
		Items:   results,
		Total:   len(results),
		QueryMs: time.Since(start).Milliseconds(),
	}, nil
}

// GetWithProof returns a block with its Merkle proof.
func (m *MemoryHiveStore) GetWithProof(ctx context.Context, id ContentID) (*KnowledgeBlock, *MerkleProof, error) {
	block, err := m.Get(ctx, id)
	if err != nil {
		return nil, nil, err
	}

	// Simplified proof (in production: full Merkle tree)
	proof := &MerkleProof{
		Root:  block.ContentHash,
		Path:  [][]byte{block.ContentHash},
		Index: 0,
	}

	return block, proof, nil
}

// Validate runs consensus validation on a knowledge block.
func (m *MemoryHiveStore) Validate(ctx context.Context, id ContentID) (*ConsensusResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	votes, ok := m.votes[id]
	if !ok {
		return &ConsensusResult{Valid: true, TrustScore: 0.5}, nil
	}

	var forVotes, againstVotes int
	for _, v := range votes {
		if v == VoteValid {
			forVotes++
		} else if v == VoteInvalid {
			againstVotes++
		}
	}

	total := forVotes + againstVotes
	trust := 0.5
	if total > 0 {
		trust = float64(forVotes) / float64(total)
	}

	return &ConsensusResult{
		Valid:        forVotes > againstVotes,
		VotesFor:     forVotes,
		VotesAgainst: againstVotes,
		TrustScore:   trust,
	}, nil
}

// VoteFor casts a vote on a knowledge block's validity.
func (m *MemoryHiveStore) VoteFor(ctx context.Context, id ContentID, vote VoteType) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.votes[id] = append(m.votes[id], vote)

	// Update block trust score
	if block, ok := m.blocks[id]; ok {
		votes := m.votes[id]
		var forVotes int
		for _, v := range votes {
			if v == VoteValid {
				forVotes++
			}
		}
		if len(votes) > 0 {
			block.TrustScore = float64(forVotes) / float64(len(votes))
		}
	}

	return nil
}

// ─── Crypto Helpers ─────────────────────────────────────────────────────────

func deriveKey(id ContentID) []byte {
	h := sha256.Sum256(id[:])
	return h[:]
}

func encryptAESGCM(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func decryptAESGCM(key, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return gcm.Open(nil, nonce, ciphertext, nil)
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

func cosineSimilarity(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func containsKnowType(types []KnowType, t KnowType) bool {
	for _, kt := range types {
		if kt == t {
			return true
		}
	}
	return false
}

func containsString(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}
