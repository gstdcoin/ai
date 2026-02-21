package hive

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMemoryHiveStoreAndGet(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	block := &KnowledgeBlock{
		Content:     []byte("Quantum computing uses qubits for parallel computation"),
		ContentType: KnowFactual,
		TrustScore:  0.9,
		Language:    "en",
		Tags:        []string{"quantum", "computing"},
		Embedding:   make([]float32, 1536), // zero vector for test
	}

	// Store
	receipt, err := store.Store(ctx, block)
	require.NoError(t, err)
	assert.NotEmpty(t, receipt.ID)
	assert.Equal(t, 1, receipt.ShardsOK)
	assert.NotEmpty(t, receipt.MerkleRoot)

	// Get back
	retrieved, err := store.Get(ctx, receipt.ID)
	require.NoError(t, err)
	assert.Equal(t, "Quantum computing uses qubits for parallel computation", string(retrieved.Content))
	assert.Equal(t, KnowFactual, retrieved.ContentType)
	assert.Equal(t, 0.9, retrieved.TrustScore)
}

func TestMemoryHiveStoreNotFound(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	var nonExistent ContentID
	_, err := store.Get(ctx, nonExistent)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
}

func TestMemoryHiveSemanticSearch(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	// Store several blocks with embeddings
	blocks := []struct {
		content   string
		embedding []float32
		trust     float64
		knowType  KnowType
	}{
		{"Go programming language", embeddingVec(1.0, 0.0, 0.0), 0.95, KnowFactual},
		{"Rust programming language", embeddingVec(0.9, 0.1, 0.0), 0.85, KnowFactual},
		{"Recipe for chocolate cake", embeddingVec(0.0, 0.0, 1.0), 0.7, KnowProcedural},
		{"Python programming basics", embeddingVec(0.8, 0.2, 0.0), 0.9, KnowFactual},
	}

	for _, b := range blocks {
		block := &KnowledgeBlock{
			Content:     []byte(b.content),
			ContentType: b.knowType,
			TrustScore:  b.trust,
			Embedding:   b.embedding,
			Language:    "en",
		}
		_, err := store.Store(ctx, block)
		require.NoError(t, err)
	}

	// Search for programming-related content
	results, err := store.Search(ctx, SearchQuery{
		Embedding: embeddingVec(1.0, 0.0, 0.0),
		TopK:      3,
		MinTrust:  0.5,
	})
	require.NoError(t, err)
	assert.LessOrEqual(t, len(results.Items), 3)
	assert.Greater(t, results.Items[0].Score, results.Items[len(results.Items)-1].Score)
}

func TestMemoryHiveSearchWithTypeFilter(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	// Store mixed types
	factual := &KnowledgeBlock{
		Content:     []byte("Earth orbits the Sun"),
		ContentType: KnowFactual,
		TrustScore:  0.9,
		Embedding:   embeddingVec(1.0, 0.0, 0.0),
	}
	procedural := &KnowledgeBlock{
		Content:     []byte("Step 1: Install Go"),
		ContentType: KnowProcedural,
		TrustScore:  0.9,
		Embedding:   embeddingVec(0.9, 0.1, 0.0),
	}
	_, err := store.Store(ctx, factual)
	require.NoError(t, err)
	_, err = store.Store(ctx, procedural)
	require.NoError(t, err)

	// Search only procedural
	results, err := store.Search(ctx, SearchQuery{
		Embedding: embeddingVec(1.0, 0.0, 0.0),
		TopK:      10,
		Types:     []KnowType{KnowProcedural},
	})
	require.NoError(t, err)
	for _, item := range results.Items {
		assert.Equal(t, KnowProcedural, item.Block.ContentType)
	}
}

func TestMemoryHiveSearchMinTrustFilter(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	low := &KnowledgeBlock{
		Content:     []byte("Low trust content"),
		ContentType: KnowFactual,
		TrustScore:  0.2,
		Embedding:   embeddingVec(1.0, 0.0, 0.0),
	}
	high := &KnowledgeBlock{
		Content:     []byte("High trust content"),
		ContentType: KnowFactual,
		TrustScore:  0.95,
		Embedding:   embeddingVec(0.9, 0.1, 0.0),
	}
	_, _ = store.Store(ctx, low)
	_, _ = store.Store(ctx, high)

	results, err := store.Search(ctx, SearchQuery{
		Embedding: embeddingVec(1.0, 0.0, 0.0),
		TopK:      10,
		MinTrust:  0.5,
	})
	require.NoError(t, err)
	for _, item := range results.Items {
		assert.GreaterOrEqual(t, item.Block.TrustScore, 0.5)
	}
}

func TestMemoryHiveVoting(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	block := &KnowledgeBlock{
		Content:     []byte("Test vote content"),
		ContentType: KnowFactual,
		TrustScore:  0.5,
		Embedding:   embeddingVec(1.0, 0.0, 0.0),
	}
	receipt, err := store.Store(ctx, block)
	require.NoError(t, err)

	// Vote valid 3 times, invalid 1 time
	_ = store.VoteFor(ctx, receipt.ID, VoteValid)
	_ = store.VoteFor(ctx, receipt.ID, VoteValid)
	_ = store.VoteFor(ctx, receipt.ID, VoteValid)
	_ = store.VoteFor(ctx, receipt.ID, VoteInvalid)

	result, err := store.Validate(ctx, receipt.ID)
	require.NoError(t, err)
	assert.True(t, result.Valid)
	assert.Equal(t, 3, result.VotesFor)
	assert.Equal(t, 1, result.VotesAgainst)
	assert.Equal(t, 0.75, result.TrustScore)
}

func TestMemoryHiveGetWithProof(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	block := &KnowledgeBlock{
		Content:     []byte("Merkle proof test"),
		ContentType: KnowFactual,
		TrustScore:  0.9,
	}
	receipt, _ := store.Store(ctx, block)

	retrieved, proof, err := store.GetWithProof(ctx, receipt.ID)
	require.NoError(t, err)
	assert.NotNil(t, retrieved)
	assert.NotNil(t, proof)
	assert.NotEmpty(t, proof.Root)
	assert.NotEmpty(t, proof.Path)
}

func TestSearchRequiresInput(t *testing.T) {
	store := NewMemoryHiveStore()
	ctx := context.Background()

	_, err := store.Search(ctx, SearchQuery{TopK: 5})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "requires embedding or text")
}

func TestCosineSimilarity(t *testing.T) {
	// Identical vectors
	a := []float32{1.0, 0.0, 0.0}
	b := []float32{1.0, 0.0, 0.0}
	sim := cosineSimilarity(a, b)
	assert.InDelta(t, 1.0, sim, 0.001)

	// Orthogonal vectors
	c := []float32{0.0, 1.0, 0.0}
	sim = cosineSimilarity(a, c)
	assert.InDelta(t, 0.0, sim, 0.001)

	// Opposite vectors
	d := []float32{-1.0, 0.0, 0.0}
	sim = cosineSimilarity(a, d)
	assert.InDelta(t, -1.0, sim, 0.001)

	// Empty vectors
	sim = cosineSimilarity([]float32{}, []float32{})
	assert.Equal(t, float64(0), sim)

	// Mismatched length
	sim = cosineSimilarity([]float32{1}, []float32{1, 2})
	assert.Equal(t, float64(0), sim)
}

func TestContentIDString(t *testing.T) {
	var id ContentID
	id[0] = 0xAB
	id[1] = 0xCD
	str := id.String()
	assert.True(t, len(str) == 64) // hex of 32 bytes
	assert.Equal(t, "ab", str[:2])
	assert.Equal(t, "cd", str[2:4])
}

func TestKnowTypes(t *testing.T) {
	assert.Equal(t, KnowType("factual"), KnowFactual)
	assert.Equal(t, KnowType("procedural"), KnowProcedural)
	assert.Equal(t, KnowType("contextual"), KnowContextual)
	assert.Equal(t, KnowType("ephemeral"), KnowEphemeral)
	assert.Equal(t, KnowType("learned"), KnowLearned)
}

func TestVoteTypes(t *testing.T) {
	assert.Equal(t, VoteType(1), VoteValid)
	assert.Equal(t, VoteType(-1), VoteInvalid)
	assert.Equal(t, VoteType(0), VoteAbstain)
}

// ─── Test Helpers ───────────────────────────────────────────────────────────

// embeddingVec creates a simple 3-dim embedding for testing.
func embeddingVec(x, y, z float32) []float32 {
	return []float32{x, y, z}
}
