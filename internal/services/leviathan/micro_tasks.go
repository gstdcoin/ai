package leviathan

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"
)

var (
	microTaskLastBTC  float64
	microTaskLastETH  float64
	microTaskLastTime time.Time
	microTaskMu       sync.Mutex
)

// RunMicroTaskLoop — Omnipresence: Synthetic Micro-Tasks. 15-60 min cycle, train long_term_lessons.
func (r *Runner) RunMicroTaskLoop(ctx context.Context) {
	ticker := time.NewTicker(45 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			r.runMicroTaskCycle(ctx)
		}
	}
}

func (r *Runner) runMicroTaskCycle(ctx context.Context) {
	btc, eth, err := r.oracle.FetchPythPrices(ctx)
	if err != nil || (btc == 0 && eth == 0) {
		return
	}
	microTaskMu.Lock()
	lastBTC, lastETH := microTaskLastBTC, microTaskLastETH
	lastTime := microTaskLastTime
	microTaskLastBTC, microTaskLastETH = btc, eth
	microTaskLastTime = time.Now()
	microTaskMu.Unlock()

	if lastBTC == 0 && lastETH == 0 {
		return
	}
	if time.Since(lastTime) < 10*time.Minute {
		return
	}
	up := (btc > lastBTC && lastBTC > 0) || (eth > lastETH && lastETH > 0)
	predictedYes := 0.55
	correct := (predictedYes >= 0.5 && up) || (predictedYes < 0.5 && !up)
	sector := "crypto"
	keywords := "btc eth price direction micro"
	sourceUsed := "Pyth"
	// Living Leviathan: Synergetic Growth — check against Golden Vectors BEFORE logging (avoid self-match)
	similar, _ := r.shadow.FindSimilarPatterns(sector, keywords, 5)
	_ = r.shadow.LogLesson(Lesson{
		Sector:     sector,
		Keywords:   keywords,
		Correct:    correct,
		SourceUsed: sourceUsed,
		Reasoning:  "Synthetic micro-task: Pyth price direction",
	})
	_ = r.shadow.UpdateSectorAccuracy(sector, sourceUsed, correct)
	if len(similar) > 0 {
		goldenCount := 0
		for _, s := range similar {
			if s.Correct {
				goldenCount++
			}
		}
		if goldenCount > 0 && !correct {
			EmitLearning(fmt.Sprintf("Synergetic Growth: Micro-task contradicts %d Golden Vector(s) — Pyth direction wrong", goldenCount))
		} else if goldenCount == len(similar) && correct {
			EmitLearning(fmt.Sprintf("Synergetic Growth: Micro-task aligns with %d Golden Vector(s) — Pyth direction correct", goldenCount))
		}
	}
	EmitLearning(fmt.Sprintf("Micro-task: Pyth direction %v (correct: %v)", up, correct))
	log.Printf("[Leviathan] Omnipresence: Micro-task resolved correct=%v", correct)

	// Omnipresence: Mining vertical — growth sector learns from telegram_mining activations
	r.runGrowthMicroTask(ctx)
}

// runGrowthMicroTask — Mining vertical: check growth sector, emit Synergetic Growth summary.
func (r *Runner) runGrowthMicroTask(ctx context.Context) {
	similar, err := r.shadow.FindSimilarPatterns("growth", "mining telegram wallet activation", 5)
	if err != nil || len(similar) == 0 {
		return
	}
	goldenCount := 0
	for _, s := range similar {
		if s.Correct {
			goldenCount++
		}
	}
	if goldenCount > 0 {
		EmitLearning(fmt.Sprintf("Synergetic Growth: Mining vertical — %d Golden Vector(s) from telegram_mining", goldenCount))
		log.Printf("[Leviathan] Omnipresence: Mining vertical — %d growth lessons", len(similar))
	}
}
