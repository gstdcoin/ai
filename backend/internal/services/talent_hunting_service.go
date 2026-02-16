package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"
)

// Automated Talent Hunting: If a category has no model with capability_score > 7.0,
// initiate out-of-order HF search for that category.

const (
	talentHuntingThreshold = 7.0
	talentHuntingInterval   = 12 * time.Hour
)

// TalentHuntingService triggers HF search when categories lack high-capability models
type TalentHuntingService struct {
	db         *sql.DB
	absorption *GlobalAbsorptionService
}

// NewTalentHuntingService creates the service
func NewTalentHuntingService(db *sql.DB, absorption *GlobalAbsorptionService) *TalentHuntingService {
	return &TalentHuntingService{db: db, absorption: absorption}
}

// TriggerHunt triggers an out-of-order hunt (Global Equilibrium)
func (s *TalentHuntingService) TriggerHunt(ctx context.Context) {
	if s.absorption != nil {
		s.hunt(ctx)
	}
}

// Start runs the talent hunting loop
func (s *TalentHuntingService) Start(ctx context.Context) {
	if s.absorption == nil {
		return
	}
	log.Printf("[Talent Hunting] Automated category search ACTIVE (threshold=%.1f)", talentHuntingThreshold)
	ticker := time.NewTicker(talentHuntingInterval)
	defer ticker.Stop()
	select {
	case <-ctx.Done():
		return
	case <-time.After(2 * time.Minute):
		s.hunt(ctx)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.hunt(ctx)
		}
	}
}

func (s *TalentHuntingService) hunt(ctx context.Context) {
	categories := []string{"biomedical_research", "code", "text_generation", "conversational", "image"}
	for _, cat := range categories {
		var maxScore sql.NullFloat64
		err := s.db.QueryRowContext(ctx, `
			SELECT MAX(capability_score) FROM universal_mesh_routing WHERE category = $1
		`, cat).Scan(&maxScore)
		if err != nil || !maxScore.Valid || maxScore.Float64 >= talentHuntingThreshold {
			continue
		}
		// Category lacks high-capability model — trigger HF search
		query := categoryToHFQuery(cat)
		models, err := s.absorption.SearchHF(ctx, query, 10)
		if err != nil {
			log.Printf("[Talent Hunting] HF search for %s: %v", cat, err)
			continue
		}
		absorbed := 0
		for _, m := range models {
			lic := ExtractLicense(m.Tags)
			if !IsOpenLicense(lic) && lic != "" {
				continue
			}
			normID := strings.ReplaceAll(m.ModelID, "/", "-")
			normID = strings.ToLower(normID)
			_, err := s.absorption.lfs.GetManifest(ctx, normID)
			if err == nil {
				continue
			}
			if err := s.absorption.AbsorbModelWithSourceAndCategory(ctx, m.ModelID, &m, "talent_hunt", cat); err != nil {
				continue
			}
			absorbed++
			log.Printf("[Talent Hunting] Absorbed %s for category %s (score=%.2f)", m.ModelID, cat, capabilityScoreFromHF(m))
			break
		}
		if absorbed > 0 {
			log.Printf("[Talent Hunting] Category %s: absorbed %d model(s)", cat, absorbed)
		}
	}
}

func categoryToHFQuery(cat string) string {
	switch cat {
	case "biomedical_research":
		return "biomedical"
	case "code":
		return "code generation"
	case "text_generation":
		return "text generation"
	case "conversational":
		return "chat"
	case "image":
		return "image generation"
	default:
		return cat
	}
}

func capabilityScoreFromHF(m HFModel) float64 {
	return capabilityScore(4, m.Likes, m.Downloads)
}
