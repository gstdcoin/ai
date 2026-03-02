package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"sync"
	"time"
)

// Singularity Ready: Final status orchestrating Global Equilibrium, Immortal Identity, Archon Protocol.

const (
	equilibriumInterval       = 30 * time.Minute
	reserveGrowthPlanPct      = 5.0 // target monthly reserve growth %
	archonCapabilityThreshold = 5.0 // critical: total capability score below this
	archonTopModelsToMirror   = 10
	archonCooldown            = 24 * time.Hour
)

// SingularityReadyService orchestrates Global Equilibrium and Archon Protocol
type SingularityReadyService struct {
	db            *sql.DB
	absorption    *GlobalAbsorptionService
	talentHunting *TalentHuntingService
	predictive    *PredictiveMirroringService
	constitution  *MeshConstitutionService
	mu            sync.Mutex
	lastArchonRun time.Time
}

// NewSingularityReadyService creates the orchestrator
func NewSingularityReadyService(
	db *sql.DB,
	absorption *GlobalAbsorptionService,
	talentHunting *TalentHuntingService,
	predictive *PredictiveMirroringService,
	constitution *MeshConstitutionService,
) *SingularityReadyService {
	return &SingularityReadyService{
		db:            db,
		absorption:    absorption,
		talentHunting: talentHunting,
		predictive:    predictive,
		constitution:  constitution,
	}
}

// Start runs Global Equilibrium and Archon Protocol loops
func (s *SingularityReadyService) Start(ctx context.Context) {
	log.Printf("[Singularity Ready] ACTIVE — Global Equilibrium, Archon Protocol")
	ticker := time.NewTicker(equilibriumInterval)
	defer ticker.Stop()
	select {
	case <-ctx.Done():
		return
	case <-time.After(2 * time.Minute):
		s.runEquilibrium(ctx)
		s.checkArchon(ctx)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runEquilibrium(ctx)
			s.checkArchon(ctx)
		}
	}
}

// runEquilibrium: balance Profit (greed) vs Talent (learning)
// If golden reserve grows faster than plan → allocate more hashrate to model search
func (s *SingularityReadyService) runEquilibrium(ctx context.Context) {
	if s.db == nil {
		return
	}
	var reserveNow, reserveMonthAgo float64
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE xaut_amount IS NOT NULL`).Scan(&reserveNow)
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(xaut_amount), 0) FROM golden_reserve_log WHERE timestamp < NOW() - INTERVAL '30 days' AND xaut_amount IS NOT NULL`).Scan(&reserveMonthAgo)

	if reserveMonthAgo <= 0 {
		return
	}
	growthPct := ((reserveNow - reserveMonthAgo) / reserveMonthAgo) * 100

	// Reserve growing faster than plan → more learning (Talent Hunting, Predictive Mirroring)
	if growthPct > reserveGrowthPlanPct {
		log.Printf("[Singularity Ready] Global Equilibrium: reserve +%.1f%% > plan %.1f%% — allocating hashrate to learning", growthPct, reserveGrowthPlanPct)
		if s.talentHunting != nil {
			s.talentHunting.TriggerHunt(ctx)
		}
		if s.predictive != nil {
			s.predictive.TriggerMirror(ctx)
		}
	}
}

// checkArchon: if total capability score < 5.0 → full routing reset + top-10 mirroring
func (s *SingularityReadyService) checkArchon(ctx context.Context) {
	s.mu.Lock()
	if time.Since(s.lastArchonRun) < archonCooldown {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	if s.db == nil || s.absorption == nil {
		return
	}

	var avgScore sql.NullFloat64
	err := s.db.QueryRowContext(ctx, `
		SELECT AVG(capability_score) FROM universal_mesh_routing
	`).Scan(&avgScore)
	if err != nil || !avgScore.Valid || avgScore.Float64 >= archonCapabilityThreshold {
		return
	}

	log.Printf("[Singularity Ready] ARCHON PROTOCOL: capability %.2f < %.1f — full routing reset + top-%d mirroring",
		avgScore.Float64, archonCapabilityThreshold, archonTopModelsToMirror)

	s.mu.Lock()
	s.lastArchonRun = time.Now()
	s.mu.Unlock()

	// 1. Full routing reset
	_, _ = s.db.ExecContext(ctx, `DELETE FROM universal_mesh_routing`)
	log.Printf("[Archon] Routing reset complete")

	// 2. Forced mirroring: top 10 world models from HF
	models, err := s.absorption.FetchHFTrending(ctx, archonTopModelsToMirror)
	if err != nil {
		log.Printf("[Archon] HF fetch error: %v", err)
		return
	}
	absorbed := 0
	for _, m := range models {
		lic := ExtractLicense(m.Tags)
		if !IsOpenLicense(lic) && lic != "" {
			continue
		}
		if m.PipelineTag != "" && m.PipelineTag != "text-generation" && m.PipelineTag != "conversational" && m.PipelineTag != "image-text-to-text" {
			continue
		}
		normID := strings.ReplaceAll(m.ModelID, "/", "-")
		normID = strings.ToLower(normID)
		_, err := s.absorption.lfs.GetManifest(ctx, normID)
		if err == nil {
			continue
		}
		if err := s.absorption.AbsorbModelWithSourceAndCategory(ctx, m.ModelID, &m, "archon", ""); err != nil {
			continue
		}
		absorbed++
	}
	log.Printf("[Archon] Forced mirroring: absorbed %d of top-%d models", absorbed, archonTopModelsToMirror)
}
