package services

import (
	"context"
	"database/sql"
	"math"
	"math/rand"

	"github.com/redis/go-redis/v9"
)

// HardenedGravityService implements Physics-based EGS
type HardenedGravityService struct {
	db      *sql.DB
	redis   *redis.Client
	physics *PhysicsService // v5.0
}

func NewHardenedGravityService(db *sql.DB, r *redis.Client) *HardenedGravityService {
	return &HardenedGravityService{
		db:      db, 
		redis:   r,
		physics: NewPhysicsService(db),
	}
}

// CalculateEGS_v3 implements Network Physics Law
// EGS = Labor_Compensation * (1 + GSTD_Utility) * (1 / Network_Temperature)
func (s *HardenedGravityService) CalculateEGS(compensation float64, gstd float64, entropy float64) float64 {
	T := math.Max(entropy, 0.01) // Prevent division by zero
	gstdCapped := math.Min(gstd, 1000000.0)
	utilityFactor := 1.0 + math.Log10(1.0 + gstdCapped/10000.0)
	
	// Physics Law: Gravity is inversely proportional to Network Temperature (Noise)
	return (compensation * utilityFactor) / T
}

// CalculateDynamicRedundancy implements AQL logic
func (s *HardenedGravityService) CalculateDynamicRedundancy(entropy float64, avgTrust float64) int {
	rd := 1.0 + (entropy * (1.0 - avgTrust))
	return int(math.Ceil(rd))
}

// ShouldPerformSpotCheck prevents "Optimistic Death Spiral"
func (s *HardenedGravityService) ShouldPerformSpotCheck(baseRd int) bool {
	if baseRd > 1 {
		return false
	}
	return rand.Float64() < 0.05
}

// GetNetworkTemperature returns global stability factor
func (s *HardenedGravityService) GetNetworkTemperature(ctx context.Context) float64 {
	val, err := s.redis.Get(ctx, "global_network_temp").Float64()
	if err != nil {
		return 1.0
	}
	return val
}
