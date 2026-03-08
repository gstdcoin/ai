package leviathan

import (
	"runtime"
	"sync"
	"time"
)

// Living Leviathan: Continuous Self-Test — track last Integrity Check for 4h audit trigger.
var (
	lastIntegrityCheckMu sync.RWMutex
	lastIntegrityCheckAt time.Time
)

func updateLastIntegrityCheckTime() {
	lastIntegrityCheckMu.Lock()
	lastIntegrityCheckAt = time.Now()
	lastIntegrityCheckMu.Unlock()
}

func getLastIntegrityCheckTime() time.Time {
	lastIntegrityCheckMu.RLock()
	t := lastIntegrityCheckAt
	lastIntegrityCheckMu.RUnlock()
	return t
}

// Living Leviathan: Global Homeostasis — balance accuracy and resources.
// If accuracy drops: temporarily increase Code Layer poll frequency.
// If CPU load rises: switch to Predictive Silence (reduce emissions).

const (
	homeostasisAccuracyDropThreshold = 5.0  // % drop to trigger CodeLayerBoost
	homeostasisTickDurationThreshold = 30.0 // seconds — above this → PredictiveSilence
	homeostasisGoroutineThreshold    = 150  // high goroutine count → PredictiveSilence
)

var (
	homeostasisMu       sync.RWMutex
	homeostasisAccuracy float64
	homeostasisLastAcc  float64
	homeostasisTickDur  time.Duration
	homeostasisSilence  bool
	homeostasisBoost    bool
)

// UpdateHomeostasisAccuracy is called from systemStatusLoop when we have fresh IQ/accuracy.
func UpdateHomeostasisAccuracy(acc float64) {
	homeostasisMu.Lock()
	defer homeostasisMu.Unlock()
	homeostasisLastAcc = homeostasisAccuracy
	homeostasisAccuracy = acc
	// Synergetic Growth: if accuracy dropped significantly, boost Code Layer
	if homeostasisLastAcc > 0 && homeostasisAccuracy < homeostasisLastAcc-homeostasisAccuracyDropThreshold {
		homeostasisBoost = true
	} else if homeostasisAccuracy >= homeostasisLastAcc {
		homeostasisBoost = false
	}
}

// UpdateHomeostasisTickDuration is called at end of each tick.
func UpdateHomeostasisTickDuration(d time.Duration) {
	homeostasisMu.Lock()
	defer homeostasisMu.Unlock()
	homeostasisTickDur = d
	// Predictive Silence: if tick took too long or goroutines high, reduce load
	goroutines := runtime.NumGoroutine()
	if d.Seconds() > homeostasisTickDurationThreshold || goroutines > homeostasisGoroutineThreshold {
		homeostasisSilence = true
	} else {
		homeostasisSilence = false
	}
}

// GetHomeostasisPollInterval returns the effective poll interval based on state.
func GetHomeostasisPollInterval(baseSec int) time.Duration {
	homeostasisMu.RLock()
	defer homeostasisMu.RUnlock()
	if homeostasisSilence {
		return 120 * time.Second // Predictive Silence: poll less often
	}
	if homeostasisBoost {
		return 30 * time.Second // Code Layer Boost: poll more often
	}
	return time.Duration(baseSec) * time.Second
}

// IsPredictiveSilence returns true when we should skip low-priority emissions.
func IsPredictiveSilence() bool {
	homeostasisMu.RLock()
	defer homeostasisMu.RUnlock()
	return homeostasisSilence
}
