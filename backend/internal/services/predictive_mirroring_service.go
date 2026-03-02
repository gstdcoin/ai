package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

// Predictive Mirroring: Leviathan analyzes HF Trending and shards top-3 models of the day
// before users request them via API. Runs when LEVIATHAN_ENABLED=true.

const (
	hfTrendingAPI      = "https://huggingface.co/api/models"
	trendingSort       = "likes7d"
	trendingLimit      = 20
	topModelsToShard   = 3
	predictiveInterval = 6 * time.Hour
)

// PredictiveMirroringService fetches HF Trending and triggers absorption for top open-license models
type PredictiveMirroringService struct {
	absorption *GlobalAbsorptionService
}

// NewPredictiveMirroringService creates the predictive mirroring service
func NewPredictiveMirroringService(absorption *GlobalAbsorptionService) *PredictiveMirroringService {
	return &PredictiveMirroringService{absorption: absorption}
}

// TriggerMirror triggers an out-of-order mirror cycle (Global Equilibrium)
func (s *PredictiveMirroringService) TriggerMirror(ctx context.Context) {
	if s.absorption != nil {
		s.mirrorTrending(ctx)
	}
}

// Start runs the predictive mirroring loop (call in goroutine)
func (s *PredictiveMirroringService) Start(ctx context.Context) {
	if s.absorption == nil {
		return
	}
	log.Printf("[Predictive Mirroring] Leviathan HF Trending analysis ACTIVE — top-%d models/day", topModelsToShard)
	ticker := time.NewTicker(predictiveInterval)
	defer ticker.Stop()
	// Run once on start after short delay
	select {
	case <-ctx.Done():
		return
	case <-time.After(2 * time.Minute):
		s.mirrorTrending(ctx)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mirrorTrending(ctx)
		}
	}
}

// mirrorTrending fetches HF trending, filters open-license, absorbs top N not in registry
func (s *PredictiveMirroringService) mirrorTrending(ctx context.Context) {
	models, err := s.fetchHFTrending(ctx, trendingLimit)
	if err != nil {
		log.Printf("[Predictive Mirroring] HF Trending fetch error: %v", err)
		return
	}
	// Filter open-license, text-generation preferred
	var open []HFModel
	for _, m := range models {
		lic := ExtractLicense(m.Tags)
		if !IsOpenLicense(lic) && lic != "" {
			continue
		}
		// Prefer text-generation for inference
		if m.PipelineTag != "" && m.PipelineTag != "text-generation" && m.PipelineTag != "conversational" {
			continue
		}
		open = append(open, m)
	}
	absorbed := 0
	for i := 0; i < len(open) && absorbed < topModelsToShard; i++ {
		m := open[i]
		normID := strings.ReplaceAll(m.ModelID, "/", "-")
		normID = strings.ToLower(normID)
		_, err := s.absorption.lfs.GetManifest(ctx, normID)
		if err == nil {
			continue // already in registry
		}
		if err := s.absorption.AbsorbModelWithSource(ctx, m.ModelID, &m, "predictive"); err != nil {
			log.Printf("[Predictive Mirroring] Absorb %s: %v", m.ModelID, err)
			continue
		}
		absorbed++
		log.Printf("[Predictive Mirroring] Sharded top model: %s (likes=%d)", m.ModelID, m.Likes)
	}
	if absorbed > 0 {
		log.Printf("[Predictive Mirroring] Day cycle: absorbed %d trending models", absorbed)
	}
}

// fetchHFTrending calls HF API with sort=likes7d (trending)
func (s *PredictiveMirroringService) fetchHFTrending(ctx context.Context, limit int) ([]HFModel, error) {
	u := fmt.Sprintf("%s?sort=%s&limit=%d", hfTrendingAPI, trendingSort, limit)
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GSTD-Predictive-Mirroring/1.0")

	client := ThrottledHTTPClient(15 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF API: %d", resp.StatusCode)
	}

	var models []HFModel
	if err := json.NewDecoder(resp.Body).Decode(&models); err != nil {
		return nil, err
	}
	return models, nil
}
