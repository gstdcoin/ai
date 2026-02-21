package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
)

// Knowledge Cross-Link: When absorbing a new model, Knowledge_Integrator compares
// its capabilities with current leaders and updates UniversalMesh_Routing.

// KnowledgeIntegrator (subagent Knowledge_Integrator) updates universal_mesh_routing when a new model is absorbed
type KnowledgeIntegrator struct {
	db *sql.DB
}

// NewKnowledgeIntegrator creates the integrator
func NewKnowledgeIntegrator(db *sql.DB) *KnowledgeIntegrator {
	k := &KnowledgeIntegrator{db: db}
	k.ensureSchema()
	return k
}

func (k *KnowledgeIntegrator) ensureSchema() {
	if k.db == nil {
		return
	}
	_, _ = k.db.Exec(`
		CREATE TABLE IF NOT EXISTS universal_mesh_routing (
			id SERIAL PRIMARY KEY,
			model_id VARCHAR(128) NOT NULL UNIQUE,
			platform_preference VARCHAR(32) NOT NULL DEFAULT 'server',
			capability_score DECIMAL(10,4) NOT NULL DEFAULT 0,
			rank INT NOT NULL DEFAULT 0,
			source_hf VARCHAR(256),
			license VARCHAR(64),
			source VARCHAR(32) DEFAULT 'manual',
			category VARCHAR(64) DEFAULT 'general',
			last_request_at TIMESTAMP,
			updated_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_universal_mesh_routing_model ON universal_mesh_routing(model_id);
		CREATE INDEX IF NOT EXISTS idx_universal_mesh_routing_rank ON universal_mesh_routing(rank DESC);
	`)
	_, _ = k.db.Exec(`ALTER TABLE universal_mesh_routing ADD COLUMN IF NOT EXISTS source VARCHAR(32) DEFAULT 'manual'`)
	_, _ = k.db.Exec(`ALTER TABLE universal_mesh_routing ADD COLUMN IF NOT EXISTS last_request_at TIMESTAMP`)
	_, _ = k.db.Exec(`ALTER TABLE universal_mesh_routing ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'general'`)
}

// OnModelAbsorbed is called after a model is successfully absorbed.
// source: "predictive" (from Predictive Mirroring) or "manual" (user/API)
func (k *KnowledgeIntegrator) OnModelAbsorbed(ctx context.Context, modelID, license, sourceHF string, blockCount int, likes, downloads int) {
	k.OnModelAbsorbedWithSource(ctx, modelID, license, sourceHF, blockCount, likes, downloads, "manual")
}

// OnModelAbsorbedWithSource allows specifying source for Performance-Based Pruning
func (k *KnowledgeIntegrator) OnModelAbsorbedWithSource(ctx context.Context, modelID, license, sourceHF string, blockCount int, likes, downloads int, source string) {
	k.OnModelAbsorbedWithSourceAndCategory(ctx, modelID, license, sourceHF, blockCount, likes, downloads, source, "")
}

// OnModelAbsorbedWithSourceAndCategory for Talent Hunting (category-aware)
func (k *KnowledgeIntegrator) OnModelAbsorbedWithSourceAndCategory(ctx context.Context, modelID, license, sourceHF string, blockCount int, likes, downloads int, source string, category string) {
	if k.db == nil {
		return
	}
	if source != "predictive" && source != "manual" && source != "talent_hunt" && source != "archon" {
		source = "manual"
	}
	if category == "" {
		category = inferCategoryFromSource(sourceHF)
	}
	if category == "" {
		category = "general"
	}
	score := capabilityScore(blockCount, likes, downloads)
	platform := platformPreference(blockCount, score)
	rank := 0

	// Get current max rank
	var maxRank sql.NullInt64
	_ = k.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(rank), 0) FROM universal_mesh_routing`).Scan(&maxRank)
	if maxRank.Valid && maxRank.Int64 > 0 {
		rank = int(maxRank.Int64) + 1
	}

	_, err := k.db.ExecContext(ctx, `
		INSERT INTO universal_mesh_routing (model_id, platform_preference, capability_score, rank, source_hf, license, source, category, last_request_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NOW())
		ON CONFLICT (model_id) DO UPDATE SET
			platform_preference = EXCLUDED.platform_preference,
			capability_score = EXCLUDED.capability_score,
			rank = EXCLUDED.rank,
			source_hf = EXCLUDED.source_hf,
			license = EXCLUDED.license,
			source = EXCLUDED.source,
			category = EXCLUDED.category,
			updated_at = NOW()
	`, modelID, platform, score, rank, sourceHF, license, source, category)
	if err != nil {
		log.Printf("[Knowledge_Integrator] Update routing for %s: %v", modelID, err)
		return
	}
	log.Printf("[Knowledge_Integrator] UniversalMesh_Routing updated: %s → %s (score=%.2f, rank=%d)", modelID, platform, score, rank)
}

// capabilityScore combines block count and HF popularity for routing priority
func capabilityScore(blockCount, likes, downloads int) float64 {
	pop := float64(likes*10+downloads/1000) / 10000.0
	if pop > 10 {
		pop = 10
	}
	blocks := float64(blockCount) * 0.5
	if blocks > 10 {
		blocks = 10
	}
	return pop + blocks
}

// inferCategoryFromSource extracts category from HF model ID or tags
func inferCategoryFromSource(sourceHF string) string {
	s := strings.ToLower(sourceHF)
	if strings.Contains(s, "bio") || strings.Contains(s, "med") || strings.Contains(s, "health") {
		return "biomedical_research"
	}
	if strings.Contains(s, "code") || strings.Contains(s, "coder") {
		return "code"
	}
	if strings.Contains(s, "chat") || strings.Contains(s, "instruct") {
		return "conversational"
	}
	if strings.Contains(s, "image") || strings.Contains(s, "diffusion") {
		return "image"
	}
	return "text_generation"
}

// platformPreference: light → mobile, medium → desktop, large → server
func platformPreference(blockCount int, score float64) string {
	if blockCount <= 2 {
		return "mobile"
	}
	if blockCount <= 6 && score < 5 {
		return "desktop"
	}
	return "server"
}

// GetRouting returns platform preference for a model from UniversalMesh_Routing
func (k *KnowledgeIntegrator) GetRouting(ctx context.Context, modelID string) (platform string, ok bool) {
	if k.db == nil {
		return "server", false
	}
	norm := strings.ToLower(strings.TrimSpace(modelID))
	var p string
	err := k.db.QueryRowContext(ctx, `SELECT platform_preference FROM universal_mesh_routing WHERE model_id = $1`, norm).Scan(&p)
	if err != nil {
		return "server", false
	}
	return p, true
}
