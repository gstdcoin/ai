package leviathan

import (
	"log"
	"sync"
)

var (
	globalShadowMu sync.Mutex
	globalShadow   *ShadowEngine
)

// GetGlobalShadow returns the global ShadowEngine for cross-module access (e.g. Global Neural Merge).
func GetGlobalShadow() *ShadowEngine {
	globalShadowMu.Lock()
	s := globalShadow
	globalShadowMu.Unlock()
	return s
}

// SetGlobalShadow stores the ShadowEngine for growth signal recording.
// Called by Runner when it starts. Safe no-op when Leviathan is disabled.
func SetGlobalShadow(s *ShadowEngine) {
	globalShadowMu.Lock()
	defer globalShadowMu.Unlock()
	globalShadow = s
}

// GetSystemIQSafe returns Leviathan IQ (0-100) when ShadowEngine is available.
func GetSystemIQSafe() (float64, bool) {
	s := GetGlobalShadow()
	if s == nil {
		return 0, false
	}
	return s.GetSystemIQ(), true
}

// RecordMiningGrowth records a mining/growth signal for network learning.
// Sector "growth" + source "telegram_mining" feeds into long_term_lessons.
// Omnipresence: Mining vertical — network learns from user activation patterns.
func RecordMiningGrowth(source, eventType string) {
	globalShadowMu.Lock()
	s := globalShadow
	globalShadowMu.Unlock()
	if s == nil {
		return
	}
	lesson := Lesson{
		Sector:     "growth",
		Keywords:   "mining telegram " + eventType + " wallet activation",
		Correct:    true,
		SourceUsed: source,
		Reasoning:  "Mining growth signal: " + eventType + " — network learns from user activity",
	}
	if err := s.LogLesson(lesson); err != nil {
		log.Printf("[Leviathan] RecordMiningGrowth LogLesson error: %v", err)
		return
	}
	_ = s.UpdateSectorAccuracy("growth", source, true)
	EmitLearning("Mining growth: " + eventType + " from " + source)
	log.Printf("[Leviathan] Omnipresence: Mining growth recorded — %s from %s", eventType, source)
}
