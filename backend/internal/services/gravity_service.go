package services

import (
	"database/sql"
	"math"
)

// GravityService implements Economic Gravity Score (EGS)
type GravityService struct {
	db *sql.DB
}

func NewGravityService(db *sql.DB) *GravityService {
	return &GravityService{db: db}
}

// CalculateEGS calculates the "attraction" force of a task
// EGS = V_ton * (1 + log10(1 + G/K)) * Phi
func (s *GravityService) CalculateEGS(rewardTon float64, gstdBalance float64, entropy float64) float64 {
	const K = 10000.0
	
	// logTerm = 1 + log10(1 + G/K)
	logTerm := 1.0 + math.Log10(1.0 + gstdBalance/K)
	
	// Phi (Complexity index) = 1 + Entropy
	phi := 1.0 + entropy
	
	return rewardTon * logTerm * phi
}

// CalculateDynamicRedundancy implements AQL
// Rd = ceil(1 + Entropy * (1 - Trust_avg))
func (s *GravityService) CalculateDynamicRedundancy(entropy float64, avgTrust float64) int {
	rd := 1.0 + (entropy * (1.0 - avgTrust))
	return int(math.Ceil(rd))
}

