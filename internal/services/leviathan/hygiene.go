package leviathan

import (
	"runtime"
	"sync"
	"time"
)

// Digital Hygiene & Efficiency — aggressive cleanup, GC hints, low-activity scheduling.

// AggressiveTrimLiveStream — Digital Hygiene: shrink backing array when buffer under 25% capacity.
func AggressiveTrimLiveStream() {
	b := getLiveStream()
	b.mu.Lock()
	defer b.mu.Unlock()
	if len(b.events) < liveStreamMaxEvents/4 && cap(b.events) > liveStreamMaxEvents/2 {
		trimmed := make([]LiveStreamEvent, len(b.events), liveStreamMaxEvents/2)
		copy(trimmed, b.events)
		b.events = trimmed
	}
}

// SuggestGC — Digital Hygiene: hint GC after aggressive cleanup (non-blocking).
func SuggestGC() {
	go func() {
		runtime.GC()
	}()
}

// IsLowMarketActivity — Server Health: run heavy EvolutionTuning during minimal activity (3-6 AM UTC).
func IsLowMarketActivity() bool {
	utc := time.Now().UTC()
	hour := utc.Hour()
	// 2-7 AM UTC = typical low Polymarket activity
	return hour >= 2 && hour < 7
}

var (
	lastHygieneTrim time.Time
	hygieneTrimMu   sync.Mutex
)

// RunHygieneCycle — called after verdict: trim live stream, optionally suggest GC.
func RunHygieneCycle() {
	hygieneTrimMu.Lock()
	defer hygieneTrimMu.Unlock()
	if time.Since(lastHygieneTrim) < 30*time.Second {
		return
	}
	lastHygieneTrim = time.Now()
	AggressiveTrimLiveStream()
}
