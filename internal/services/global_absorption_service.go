package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Global Absorption Protocol — Proxy-Hugging-Bridge, License Guard, Redundancy Scaling
// Automatically indexes HF models, adds license metadata, scales shards by popularity.

const (
	openLicenseApache  = "apache-2.0"
	openLicenseMIT     = "mit"
	openLicenseBSD     = "bsd"
	hfAPIBase          = "https://huggingface.co/api"
	absorptionCooldown = 5 * time.Minute
)

// OpenLicensePriority — higher = preferred for open swarm
var openLicensePriority = map[string]int{
	"apache-2.0":   100,
	"mit":          95,
	"bsd-3-clause": 90,
	"bsd-2-clause": 85,
}

// HFModel represents a model from Hugging Face API
type HFModel struct {
	ModelID     string   `json:"modelId"`
	ID          string   `json:"id"`
	Likes       int      `json:"likes"`
	Downloads   int      `json:"downloads"`
	Tags        []string `json:"tags"`
	PipelineTag string   `json:"pipeline_tag"`
}

// GlobalAbsorptionService implements the Global Absorption Protocol
type GlobalAbsorptionService struct {
	lfs        *SwarmLFSService
	cleanCore  *CleanCoreService
	integrator *KnowledgeIntegrator
	mu         sync.RWMutex
	lastAbsorb map[string]time.Time // model_id -> last absorption
}

// NewGlobalAbsorptionService creates the absorption service
func NewGlobalAbsorptionService(lfs *SwarmLFSService, cleanCore *CleanCoreService) *GlobalAbsorptionService {
	return &GlobalAbsorptionService{
		lfs:        lfs,
		cleanCore:  cleanCore,
		lastAbsorb: make(map[string]time.Time),
	}
}

// SetKnowledgeIntegrator injects Knowledge_Integrator for Cross-Link updates
func (s *GlobalAbsorptionService) SetKnowledgeIntegrator(k *KnowledgeIntegrator) {
	s.integrator = k
}

// SearchHF searches Hugging Face models by query
func (s *GlobalAbsorptionService) SearchHF(ctx context.Context, query string, limit int) ([]HFModel, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	u := fmt.Sprintf("%s/models?search=%s&limit=%d", hfAPIBase, url.QueryEscape(query), limit)
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GSTD-Global-Absorption/1.0")

	client := ThrottledHTTPClient(15 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HF API error: %d", resp.StatusCode)
	}

	var models []HFModel
	if err := json.NewDecoder(resp.Body).Decode(&models); err != nil {
		return nil, err
	}
	return models, nil
}

// FetchHFTrending fetches trending models (sort=likes7d) for Archon Protocol
func (s *GlobalAbsorptionService) FetchHFTrending(ctx context.Context, limit int) ([]HFModel, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	u := fmt.Sprintf("%s/models?sort=likes7d&limit=%d", hfAPIBase, limit)
	req, err := http.NewRequestWithContext(ctx, "GET", u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "GSTD-Global-Absorption/1.0")
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

// ExtractLicense extracts license from HF model tags (license:apache-2.0, license:mit, etc.)
func ExtractLicense(tags []string) string {
	for _, t := range tags {
		if strings.HasPrefix(t, "license:") {
			return strings.TrimPrefix(t, "license:")
		}
	}
	return ""
}

// IsOpenLicense returns true if license is Apache 2.0, MIT, or BSD (prioritized for open swarm)
func IsOpenLicense(license string) bool {
	license = strings.ToLower(strings.TrimSpace(license))
	if license == "" {
		return false
	}
	_, ok := openLicensePriority[license]
	if ok {
		return true
	}
	return strings.Contains(license, "apache") || strings.Contains(license, "mit") || strings.Contains(license, "bsd")
}

// LicensePriority returns priority for open swarm (higher = more preferred)
func LicensePriority(license string) int {
	license = strings.ToLower(strings.TrimSpace(license))
	if p, ok := openLicensePriority[license]; ok {
		return p
	}
	if strings.Contains(license, "apache") {
		return 80
	}
	if strings.Contains(license, "mit") {
		return 75
	}
	if strings.Contains(license, "bsd") {
		return 70
	}
	return 0
}

// RedundancyFromRating computes shard count from HF likes+downloads (Redundancy Scaling)
// Higher rating → more mirror shards in GSTD network
func RedundancyFromRating(likes, downloads int) int {
	score := likes*10 + downloads/1000
	if score > 1000000 {
		return 16
	}
	if score > 500000 {
		return 12
	}
	if score > 100000 {
		return 8
	}
	if score > 50000 {
		return 6
	}
	if score > 10000 {
		return 4
	}
	return 4 // minimum
}

// AbsorbModel — Proxy-Hugging-Bridge: if model not in registry, trigger Sharding & Propagation
// License Guard: add license metadata to manifest
// Redundancy Scaling: shard count from HF rating
// fromPredictive: true when called from Predictive Mirroring (Performance-Based Pruning)
func (s *GlobalAbsorptionService) AbsorbModel(ctx context.Context, hfModelID string, hfModel *HFModel) error {
	return s.AbsorbModelWithSource(ctx, hfModelID, hfModel, "manual")
}

// AbsorbModelWithSource allows specifying source for Supreme Coordinator routing
func (s *GlobalAbsorptionService) AbsorbModelWithSource(ctx context.Context, hfModelID string, hfModel *HFModel, source string) error {
	return s.AbsorbModelWithSourceAndCategory(ctx, hfModelID, hfModel, source, "")
}

// AbsorbModelWithSourceAndCategory for Talent Hunting (explicit category)
func (s *GlobalAbsorptionService) AbsorbModelWithSourceAndCategory(ctx context.Context, hfModelID string, hfModel *HFModel, source string, category string) error {
	modelID := strings.ReplaceAll(hfModelID, "/", "-")
	modelID = strings.ToLower(modelID)
	s.mu.Lock()
	if last, ok := s.lastAbsorb[modelID]; ok && time.Since(last) < absorptionCooldown {
		s.mu.Unlock()
		return nil // Already absorbed recently
	}
	s.mu.Unlock()

	if source != "predictive" && source != "manual" && source != "talent_hunt" && source != "archon" {
		source = "manual"
	}

	// Check if already in registry
	_, err := s.lfs.GetManifest(ctx, modelID)
	if err == nil {
		log.Printf("[Global Absorption] Model %s already in registry", modelID)
		return nil
	}

	// Resolve HF metadata
	var license string
	var likes, downloads int
	if hfModel != nil {
		license = ExtractLicense(hfModel.Tags)
		likes = hfModel.Likes
		downloads = hfModel.Downloads
	} else {
		// Fetch from HF API
		models, err := s.SearchHF(ctx, hfModelID, 1)
		if err != nil || len(models) == 0 {
			return fmt.Errorf("model not found on HF: %s", hfModelID)
		}
		m := models[0]
		license = ExtractLicense(m.Tags)
		likes = m.Likes
		downloads = m.Downloads
	}

	// License Guard: prioritize open licenses
	if !IsOpenLicense(license) && license != "" {
		log.Printf("[Global Absorption] Model %s has non-open license %s — skipping", modelID, license)
		return fmt.Errorf("license %s not prioritized for open swarm (use Apache 2.0 or MIT)", license)
	}
	if license == "" {
		license = "unknown"
	}

	// Redundancy Scaling: block count from HF rating
	blockCount := RedundancyFromRating(likes, downloads)

	// Add manifest with license metadata (License Guard)
	manifest, err := s.lfs.AddManifestWithLicense(ctx, modelID, blockCount, license, hfModelID)
	if err != nil {
		return err
	}

	// Sharding & Propagation
	if s.cleanCore != nil {
		if err := s.cleanCore.PropagateModel(ctx, modelID); err != nil {
			log.Printf("[Global Absorption] Propagate failed: %v", err)
		}
	}

	s.mu.Lock()
	s.lastAbsorb[modelID] = time.Now()
	s.mu.Unlock()

	// Knowledge Cross-Link: Knowledge_Integrator updates UniversalMesh_Routing
	if s.integrator != nil {
		if category == "" {
			category = inferCategoryFromSource(hfModelID)
		}
		s.integrator.OnModelAbsorbedWithSourceAndCategory(ctx, modelID, license, hfModelID, blockCount, likes, downloads, source, category)
	}

	log.Printf("[Global Absorption] Absorbed %s | license=%s | shards=%d | HF likes=%d downloads=%d",
		modelID, manifest.License, blockCount, likes, downloads)
	return nil
}

// SearchAndAbsorb — user search: find on HF, absorb if not in registry (open license only)
func (s *GlobalAbsorptionService) SearchAndAbsorb(ctx context.Context, query string) ([]HFModel, error) {
	models, err := s.SearchHF(ctx, query, 20)
	if err != nil {
		return nil, err
	}

	// Filter by open license, sort by priority
	var open []HFModel
	for _, m := range models {
		lic := ExtractLicense(m.Tags)
		if IsOpenLicense(lic) || lic == "" {
			open = append(open, m)
		}
	}

	// Try to absorb first open-license model not in registry
	for _, m := range open {
		modelID := strings.ReplaceAll(m.ModelID, "/", "-")
		modelID = strings.ToLower(modelID)
		_, err := s.lfs.GetManifest(ctx, modelID)
		if err != nil {
			_ = s.AbsorbModel(ctx, m.ModelID, &m)
			break
		}
	}

	return models, nil
}
