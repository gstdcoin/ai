package leviathan

import (
	"sync"
	"time"
)

// ScanRecord — Steady Flow: Memory Priming. Every Scan (even non-Alpha) stored for trend.
type ScanRecord struct {
	MarketID      string
	Question      string
	YesPct        float64
	OneHourChange float64
	At            time.Time
}

const scanMemoryMax = 100
const scanMemoryRetention = 10 * time.Minute

var (
	scanMemory     []ScanRecord
	scanMemoryMu   sync.RWMutex
	scanMemoryOnce sync.Once
)

func getScanMemory() *[]ScanRecord {
	scanMemoryOnce.Do(func() {
		scanMemory = make([]ScanRecord, 0, scanMemoryMax)
	})
	return &scanMemory
}

// RecordScan — Steady Flow: Memory Priming. Store every Scan for trend determination.
func RecordScan(mp MarketPrice) {
	sm := getScanMemory()
	scanMemoryMu.Lock()
	defer scanMemoryMu.Unlock()
	cutoff := time.Now().Add(-scanMemoryRetention)
	i := 0
	for _, r := range *sm {
		if r.At.After(cutoff) {
			(*sm)[i] = r
			i++
		}
	}
	*sm = (*sm)[:i]
	if len(*sm) >= scanMemoryMax {
		*sm = (*sm)[1:]
	}
	*sm = append(*sm, ScanRecord{
		MarketID:      mp.MarketID,
		Question:      mp.Question,
		YesPct:        mp.YesPct,
		OneHourChange: mp.OneHourChange,
		At:            time.Now(),
	})
}

// GetScanTrend returns upCount, downCount, total for recent scans. Steady Flow: trend for context.
func GetScanTrend() (up, down, total int) {
	sm := getScanMemory()
	scanMemoryMu.RLock()
	defer scanMemoryMu.RUnlock()
	cutoff := time.Now().Add(-scanMemoryRetention)
	for _, r := range *sm {
		if r.At.Before(cutoff) {
			continue
		}
		total++
		if r.OneHourChange > 0.01 {
			up++
		} else if r.OneHourChange < -0.01 {
			down++
		}
	}
	return up, down, total
}
