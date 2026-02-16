package leviathan

import (
	"context"
	"log"
	"sync"
	"time"
)

// Runner orchestrates monitoring, analysis, shadow logging, and Telegram.
type Runner struct {
	cfg       *Config
	pm        *PolymarketClient
	shadow    *ShadowEngine
	telegram  *TelegramNotifier
	analysis  *SentimentScope
	stopCh    chan struct{}
	wg        sync.WaitGroup
}

// NewRunner builds the Leviathan pipeline.
func NewRunner(cfg *Config) (*Runner, error) {
	shadow, err := NewShadowEngine(cfg.ShadowDBPath)
	if err != nil {
		return nil, err
	}
	return &Runner{
		cfg:      cfg,
		pm:       NewPolymarketClient(cfg.GammaAPIBase),
		shadow:   shadow,
		telegram: NewTelegramNotifier(cfg.TelegramBotToken, cfg.TelegramChatID),
		analysis: &SentimentScope{Config: cfg},
		stopCh:   make(chan struct{}),
	}, nil
}

// Start begins the monitoring loop. Uses polling + delta-trigger. No full JSON storage.
func (r *Runner) Start(ctx context.Context) {
	if !r.cfg.Enabled {
		log.Printf("[Leviathan] Disabled (LEVIATHAN_ENABLED != true)")
		return
	}
	log.Printf("[Leviathan] Starting Zero-Load Surveillance (Delta-Trigger: %.1f%%, Alpha: %.1f%%)", r.cfg.DeltaTriggerPct, r.cfg.AlphaThresholdPct)
	r.wg.Add(1)
	go r.pollLoop(ctx)
}

// Stop gracefully stops the runner.
func (r *Runner) Stop() {
	close(r.stopCh)
	r.wg.Wait()
	if r.shadow != nil {
		_ = r.shadow.Close()
	}
}

func (r *Runner) pollLoop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(time.Duration(r.cfg.PollIntervalSec) * time.Second)
	defer ticker.Stop()
	// Initial run
	r.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			r.tick(ctx)
		}
	}
}

func (r *Runner) tick(ctx context.Context) {
	markets, err := r.pm.FetchActiveEvents(100)
	if err != nil {
		log.Printf("[Leviathan] Fetch error: %v", err)
		return
	}
	for _, mp := range markets {
		// Delta-Trigger: wake only if price changed > threshold in last hour (from API) or new market
		last, seen := r.pm.GetLast(mp.MarketID)
		trigger := r.pm.DeltaTrigger(mp, r.cfg.DeltaTriggerPct) || !seen || abs(last.YesPct-mp.YesPct)*100 >= r.cfg.DeltaTriggerPct
		if !trigger {
			continue
		}
		r.pm.StoreLast(mp)

		// Closed market: run audit
		if mp.Closed && mp.ResolvedYes != nil {
			_ = r.shadow.AuditClosedMarket(mp.MarketID, *mp.ResolvedYes)
			continue
		}
		if mp.Closed {
			continue
		}

		// Analyze
		leviathanPct, logic := r.analysis.Analyze(mp, "")
		alpha := (leviathanPct - mp.YesPct) * 100
		if alpha < 0 {
			alpha = -alpha
		}
		if alpha < r.cfg.AlphaThresholdPct {
			continue
		}

		// Shadow bet (no real money)
		_, msg, err := r.shadow.LogShadowWithNotify(
			mp.EventID, mp.MarketID, mp.EventName, mp.Question,
			leviathanPct, mp.YesPct, alpha, logic,
		)
		if err != nil {
			log.Printf("[Leviathan] Shadow log error: %v", err)
			continue
		}
		if err := r.telegram.Send(ctx, msg); err != nil {
			log.Printf("[Leviathan] Telegram error: %v", err)
		}
	}

	// Periodic audit of closed markets we predicted
	ids, _ := r.shadow.PendingAudits()
	for _, mid := range ids {
		// Re-fetch to check if now closed
		markets2, _ := r.pm.FetchActiveEvents(200)
		for _, m := range markets2 {
			if m.MarketID == mid && m.Closed && m.ResolvedYes != nil {
				_ = r.shadow.AuditClosedMarket(mid, *m.ResolvedYes)
				break
			}
		}
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
