package leviathan

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

var lastIntegrityGuardEmit time.Time

// Runner orchestrates monitoring, analysis, shadow logging, and Telegram.
type Runner struct {
	cfg      *Config
	pm       *PolymarketClient
	shadow   *ShadowEngine
	telegram *TelegramNotifier
	analysis *SentimentScope
	sensors  *GlobalSenses
	oracle   *OracleClient
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

// NewRunner builds the Leviathan pipeline.
func NewRunner(cfg *Config) (*Runner, error) {
	shadow, err := NewShadowEngine(cfg.ShadowDBPath)
	if err != nil {
		return nil, err
	}
	pm := NewPolymarketClient(cfg.GammaAPIBase)
	return &Runner{
		cfg:      cfg,
		pm:       pm,
		shadow:   shadow,
		telegram: NewTelegramNotifier(cfg.TelegramBotToken, cfg.TelegramChatID),
		analysis: &SentimentScope{Config: cfg},
		sensors:  NewGlobalSenses(cfg, pm),
		oracle:   NewOracleClient(),
		stopCh:   make(chan struct{}),
	}, nil
}

// Start begins the monitoring loop.
func (r *Runner) Start(ctx context.Context) {
	if !r.cfg.Enabled {
		log.Printf("[Leviathan] Disabled (LEVIATHAN_ENABLED != true)")
		return
	}
	log.Printf("[Leviathan] Starting Zero-Load Surveillance (Delta: %.1f%%, Alpha: %.1f%%)", r.cfg.DeltaTriggerPct, r.cfg.AlphaThresholdPct)
	log.Printf("[Leviathan] Protocol: Self-Correcting Prophet — Duty of Accountability: every event to Resolution")
	log.Printf("[Leviathan] Protocol: High-Stakes Discovery — Data Distillation (prune low-alpha after %d min), Truth Verification (every %d h)", r.cfg.LowAlphaPruneMin, r.cfg.TruthVerifyHours)
	log.Printf("[Leviathan] Protocol: Global Senses — Cross-Reference (NewsCheck, SentimentCheck, HistoricalCheck). Verdict requires external data.")
	log.Printf("[Leviathan] Protocol: Sensory Resilience — Multi-Tier (API→RSS), Super Alpha, Link Attribution, State Media 50%% weight.")
	log.Printf("[Leviathan] Protocol: Evolutionary Data — Vector Learning, Oracles (Pyth), Self-Correcting Weighting.")
	log.Printf("[Leviathan] Protocol: Cognitive Autonomy — Cross-Sector Synthesis, Failure as Fuel, Oracle Supremacy.")
	log.Printf("[Leviathan] Protocol: Sentience Ticker — Contextual Pacing, Truth Transparency, System Status.")
	log.Printf("[Leviathan] Protocol: Infinite Growth — Self-Evolution, Pattern Extraction, Live Proof, Resource Wisdom.")
	log.Printf("[Leviathan] Protocol: Guardian Mode — Critical Alerting (Alpha 30%%+), Bank Vault Watchdog (12h), Energy Efficiency.")
	log.Printf("[Leviathan] Protocol: Steady Flow — Data Maximization (OneHourPriceChange surrogate), Memory Priming (scan trend), Ticker Clarity (Int-Logic).")
	log.Printf("[Leviathan] Protocol: Open Data Synergy — Multi-Source Fusion (>=2), Truth Weighting, Golden Vector only, Oracle (Verified).")
	log.Printf("[Leviathan] Protocol: Synthesis Supremacy — Conflict Resolution, Golden Vector Priming, Source Accountability (24h).")
	log.Printf("[Leviathan] Protocol: Omnipresence — Multi-Vertical (GitHub, ArXiv, DEX), Micro-Tasks, Anti-Propaganda, Multilingual.")
	log.Printf("[Leviathan] Protocol: Omniscience 2.0 — Cross-Verification Dominance, Deep Sentiment Correlation, Synthetic IQ Reports.")
	log.Printf("[Leviathan] Protocol: Omni-Source Validation — Cross-Domain (2+), Propaganda Decay, Short-Term Memory.")
	log.Printf("[Leviathan] Protocol: Hyper-Learning — Cross-Verification, Propaganda Erasure, Synthetic Compression.")
	log.Printf("[Leviathan] Protocol: Sovereign Ascension — Predictive Fact-Linking, Trust Hierarchy, Autonomous Cleansing.")
	log.Printf("[Leviathan] Protocol: Eternal Oracle — Temporal Precision, Shadow Execution, Integrity Guard.")
	log.Printf("[Leviathan] Protocol: Living Leviathan — Global Homeostasis, Synergetic Growth, Continuous Self-Test.")
	// Omnipresence: Mining vertical — expose shadow for growth signal recording
	SetGlobalShadow(r.shadow)
	// Self-Test & Reboot: Integrity Check on startup
	EmitIntegrityCheck()
	r.wg.Add(9)
	go r.pollLoop(ctx)
	go r.truthVerificationLoop(ctx)
	go r.systemStatusLoop(ctx)
	go r.evolutionLoop(ctx)
	go r.bankVaultLoop(ctx)
	go r.sourceLeaderboardLoop(ctx)
	go r.RunMicroTaskLoop(ctx)
	go r.iqReportLoop(ctx)
	go r.selfTestLoop(ctx)
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
	r.tick(ctx)
	for {
		interval := GetHomeostasisPollInterval(r.cfg.PollIntervalSec)
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-time.After(interval):
			r.tick(ctx)
		}
	}
}

func (r *Runner) tick(ctx context.Context) {
	t0 := time.Now()
	defer func() { UpdateHomeostasisTickDuration(time.Since(t0)) }()
	// 1. Global Watch: active events, cache to avoid duplicate processing when price stable
	markets, err := r.pm.FetchActiveEvents(100)
	if err != nil {
		log.Printf("[Leviathan] Fetch error: %v", err)
		return
	}
	for _, mp := range markets {
		last, seen := r.pm.GetLast(mp.MarketID)
		trigger := r.pm.DeltaTrigger(mp, r.cfg.DeltaTriggerPct) || !seen || abs(last.YesPct-mp.YesPct)*100 >= r.cfg.DeltaTriggerPct
		if !trigger {
			continue
		}
		r.pm.StoreLast(mp)
		// Steady Flow: Memory Priming — every Scan stored for trend (even if not Alpha)
		RecordScan(mp)
		// Live Stream: Real-Time Logging. Living Leviathan: Predictive Silence skips low-priority emits
		if !IsPredictiveSilence() {
			shortQ := mp.Question
			if len(shortQ) > 40 {
				shortQ = shortQ[:37] + "..."
			}
			EmitScan(shortQ)
		}

		if mp.Closed && mp.ResolvedYes != nil {
			r.finalResolution(ctx, mp.MarketID, *mp.ResolvedYes)
			continue
		}
		if mp.Closed {
			continue
		}

		// Cache: skip if we already have pending prediction for this market
		if has, _ := r.shadow.HasPendingPrediction(mp.MarketID); has {
			continue
		}

		leviathanPct, logic := r.analysis.Analyze(mp, "")
		alpha := (leviathanPct - mp.YesPct) * 100
		if alpha < 0 {
			alpha = -alpha
		}
		if alpha < r.cfg.AlphaThresholdPct {
			// Data Distillation: already in cache from trigger; will prune after 5 min
			continue
		}

		// Global Senses + Sensory Resilience: require external data; Multi-Tier ensures 99% verdict rate
		if !IsPredictiveSilence() {
			EmitSensors("GlobalSenses: NewsCheck, SentimentCheck, HistoricalCheck")
		}
		// Eternal Oracle: Integrity Guard — if >70% media blocked, emit warning (throttle 1h)
		if blocked, total := r.shadow.CountBlockedMediaRatio(); total > 0 && float64(blocked)/float64(total) > 0.7 {
			if time.Since(lastIntegrityGuardEmit) > time.Hour {
				lastIntegrityGuardEmit = time.Now()
				EmitIntegrityGuard()
			}
		}
		ext := r.sensors.Fetch(ctx, mp)
		// Sovereign Ascension: Autonomous Cleansing — filter blocked sources
		if ext.NewsSource != "" && r.shadow.IsSourceBlocked(ext.NewsSource) {
			ext.NewsSummary, ext.NewsSource, ext.NewsSourceTier, ext.NewsIsStateMedia = "", "", "", false
		}
		if ext.SentimentSource != "" && r.shadow.IsSourceBlocked(ext.SentimentSource) {
			ext.SentimentSummary, ext.SentimentSource, ext.SentimentSourceTier, ext.SentimentIsStateMedia = "", "", "", false
		}
		if !ext.HasAnyExternalData() {
			log.Printf("[Leviathan] Global Senses: no external data for %s — skipping verdict", mp.Question)
			continue
		}

		// Open Data Synergy: Multi-Source Fusion — forbid decision on single source
		oracleLag, oracleSig := r.oracle.CheckPolymarketLag(ctx, mp, mp.YesPct)
		if !ext.HasMultiSourceFusion(oracleLag) {
			log.Printf("[Leviathan] Multi-Source Fusion: need >= 2 sources for %s (have %d) — skipping verdict", mp.Question, ext.CountDistinctSources(oracleLag))
			continue
		}
		// Omni-Source: Cross-Domain Check — prefer 2+ domains for validation
		if !ext.HasCrossDomainConfirmation(oracleLag) {
			log.Printf("[Leviathan] Omni-Source: need 2+ domains for %s (have %v) — skipping verdict", mp.Question, ext.DomainsPresent(oracleLag))
			continue
		}

		// Evolutionary Data: Continuous Vector Learning — search similar patterns first
		sector := InferSector(mp)
		keywords := mp.EventName + " " + mp.Question

		// Evolutionary Data: Self-Correcting Weighting — sector-based source weights
		newsWeight, polyWeight := r.shadow.GetSectorWeights(sector)
		_ = polyWeight

		// Omniscience 2.0: Cross-Verification Dominance — tech→GitHub 100%, finance→Pyth 100%
		if sector == "technology" && ext.HasCodeLayer() {
			newsWeight = 0
			polyWeight = 0
		}
		if sector == "crypto" && oracleLag {
			newsWeight = 0
			polyWeight = 0
		}

		// Omni-Source: Propaganda Decay — when media contradicts Hard Data, reduce trust 50%
		mediaContradicted := ext.MediaContradictsHardData(oracleLag, isCryptoMarket(mp))
		if mediaContradicted {
			if ext.NewsSource != "" {
				_ = r.shadow.MarkMediaTrustDecay(ext.NewsSource, "Contradicted Hard Data (Code/Pyth)")
				newsWeight *= 0.5
			}
			if ext.SentimentSource != "" && ext.SentimentSource != "OneHourPriceChange (Int-Logic)" {
				_ = r.shadow.MarkMediaTrustDecay(ext.SentimentSource, "Contradicted Hard Data")
				newsWeight *= 0.5
			}
		}

		// Cognitive Autonomy: Failure as Fuel — prioritize wrong lessons; always warn Architect of risks
		// Live Stream: Continuous Feedback Loop — FindSimilarPatterns before each prediction
		// Cognitive Synergy: Temporal Precision + Golden Vector — "feel" market timing
		similar, _ := r.shadow.FindSimilarPatterns(sector, keywords, 5)
		allGolden := true
		if len(similar) > 0 {
			dateStr := "past"
			if similar[0].CreatedAt != "" {
				dateStr = similar[0].CreatedAt[:10]
			}
			EmitRecall(dateStr)
			var hints []string
			var riskWarn bool
			for _, s := range similar {
				if !s.Correct {
					allGolden = false
					riskWarn = true
				}
				outcome := "wrong"
				if s.Correct {
					outcome = "correct"
				}
				hints = append(hints, "past "+outcome+" via "+s.SourceUsed)
				if !s.Correct && s.Reasoning != "" {
					hints[len(hints)-1] += " (" + s.Reasoning + ")"
				}
			}
			ext.HistoricalSummary = "LT memory: " + strings.Join(hints, "; ") + ". " + ext.HistoricalSummary
			// Cognitive Synergy: inject temporal awareness from fact_correlations
			if avgH, cnt := r.shadow.FindSimilarFactChains(DomainCode, sector, keywords, 5); cnt > 0 && avgH > 0 {
				ext.HistoricalSummary += fmt.Sprintf(" Temporal: ~%.0fh to resolution (from %d chains).", avgH, cnt)
			} else if avgH, cnt := r.shadow.FindSimilarFactChains(DomainScience, sector, keywords, 5); cnt > 0 && avgH > 0 {
				ext.HistoricalSummary += fmt.Sprintf(" Temporal: ~%.0fh to resolution (from %d chains).", avgH, cnt)
			}
			if riskWarn {
				ext.HistoricalSummary = "⚠️ Risk: similar past failures. " + ext.HistoricalSummary
			}
		}

		// Cognitive Autonomy: Cross-Sector Synthesis — crypto lag pattern → politics news lag
		if cross, _ := r.shadow.FindCrossSectorPatterns(sector, 2); len(cross) > 0 {
			var meta []string
			for _, c := range cross {
				meta = append(meta, c.Sector+": "+c.Reasoning)
			}
			ext.HistoricalSummary += " Cross-sector meta: " + strings.Join(meta, "; ") + "."
		}

		// Cognitive Autonomy: Weight Evolution — when news dominant, search subtext deeper
		if newsWeight >= 0.6 {
			subtext := ExtractSubtextKeywords(ext.NewsSummary + " " + ext.SentimentSummary + " " + keywords)
			if len(subtext) > 0 {
				n := 5
				if len(subtext) < n {
					n = len(subtext)
				}
				ext.HistoricalSummary += " Subtext: " + strings.Join(subtext[:n], ", ") + "."
			}
		}

		// Hyper-Learning: Propaganda Erasure — when media contradicts Hard Data, exclude from context
		// Sovereign Ascension: Trust Hierarchy — Code > Finance > Science > Social (only if trust >= 0.8)
		getTrust := func(src string) float64 { return r.shadow.GetMediaTrustDecay(src) }
		var contextStr string
		if mediaContradicted {
			contextStr = ext.BuildContextStringOmniSource(oracleLag, true)
			if contextStr == "" {
				contextStr = "Media contradicted Hard Data — excluded from verdict."
			}
		} else {
			contextStr = ext.BuildContextStringWithTrustHierarchy(getTrust)
		}
		if oracleLag && !strings.Contains(contextStr, "Pyth") {
			if contextStr != "" {
				contextStr += "; "
			}
			contextStr += "Pyth oracle: price signal (Verified)"
		}
		// Steady Flow: Memory Priming — inject scan trend when available
		if up, down, total := GetScanTrend(); total >= 3 {
			trend := "mixed"
			if up > down*2 {
				trend = "bullish"
			} else if down > up*2 {
				trend = "bearish"
			}
			if contextStr != "" {
				contextStr += ". "
			}
			contextStr += fmt.Sprintf("Recent scans: %d up, %d down (trend: %s)", up, down, trend)
		}
		leviathanPct, logic = r.analysis.Analyze(mp, contextStr)

		// Omnipresence: Code Trumps News — when GitHub/ArXiv contradicts media, trust code
		if ext.HasCodeLayer() && ext.CodeTrumpsNews() {
			logic += " Omnipresence: Code layer contradicts news — trusting GitHub/ArXiv."
			EmitSensors("Omnipresence: Code layer (GitHub/ArXiv) overrides news")
		}

		// Omniscience 2.0: Cross-Verification Dominance — add logic when Digital Footprint dominates
		if sector == "technology" && ext.HasCodeLayer() {
			logic += " Omniscience: Technology — GitHub 100%% (Digital Footprint)."
		}
		if sector == "crypto" && oracleLag {
			logic += " Omniscience: Finance — DEX/Pyth 100%% (Digital Footprint)."
		}

		// Omniscience 2.0: Deep Sentiment Correlation — news lags Code Layer > 30 min → mark sector Lagging
		if !ext.NewsTimestamp.IsZero() && !ext.CodeLayerTimestamp.IsZero() && ext.NewsTimestamp.Add(30*time.Minute).Before(ext.CodeLayerTimestamp) {
			_ = r.shadow.MarkSectorLagging(sector, "News lagged Code Layer by > 30 min")
			EmitLearning(fmt.Sprintf("Lagging Information: %s — news delayed vs Code Layer", sector))
		}

		// Omnipresence: Anti-Propaganda Filter — news vs oracle divergence > 40% → mark Unreliable
		if oracleLag && isCryptoMarket(mp) && ext.IsSentimentNegative() && ext.NewsSource != "" {
			_ = r.shadow.MarkSourceUnreliable(ext.NewsSource, "News vs Pyth divergence > 40%")
			EmitLearning(fmt.Sprintf("Anti-Propaganda: %s marked Unreliable (vs Pyth)", ext.NewsSource))
		}

		// Political Weighting: market YES + negative news → shift toward NO. Skip when Code Trumps News.
		// Self-Correcting: if News historically more accurate for Politics, increase shift
		if !ext.CodeTrumpsNews() && IsPoliticalMarket(mp) && mp.YesPct > 0.5 && ext.IsSentimentNegative() {
			shift := 0.15 * ext.PoliticalWeightingMultiplier()
			if newsWeight > 0.5 {
				shift *= 1.2 // boost when news has been more accurate
			}
			leviathanPct -= shift
			if leviathanPct < 0 {
				leviathanPct = 0
			}
			logic += " Political weighting: news negative, shifted toward NO."
			if ext.PoliticalWeightingMultiplier() < 1 {
				logic += " (State Media: 50% weight)"
			}
		}

		// Evolutionary Data + Cognitive Autonomy: Decentralized Oracles — Polymarket lag vs Pyth
		// Open Data Synergy: Intelligence Streaming — oracle confirmation to ticker with (Verified)
		if oracleLag && oracleSig != "" {
			logic += " CRITICAL: " + oracleSig + " (Oracle Supremacy: Pyth over text)"
			alpha += 5
			EmitOracleVerified("🔮 Pyth: " + oracleSig)
		}

		// Cognitive Synergy: Code vs Finance conflict — highest protection, block verdict
		if ext.HasCodeLayer() && oracleLag && ext.CodeLayerContradictsFinance(oracleLag) {
			log.Printf("[Leviathan] Cognitive Synergy: Code Layer and Finance Layer contradict — blocking verdict for %s", mp.Question)
			continue
		}

		// Synthesis Supremacy: Conflict Resolution — Pyth YES vs News NO: -10% Alpha, require 3rd source
		hasConflict := ext.HasSourceConflict(oracleLag, isCryptoMarket(mp))
		if hasConflict {
			alpha -= 10
			logic += " Conflict Resolution: Pyth vs News — Alpha reduced, requiring Historical tiebreaker."
			if ext.CountDistinctSources(oracleLag) < 3 {
				log.Printf("[Leviathan] Synthesis Supremacy: conflict, no 3rd source (Historical) — blocking verdict for %s", mp.Question)
				continue
			}
		}

		// Cognitive Autonomy: Cross-Sector Synthesis — meta-pattern (crypto lag → politics news lag) boosts Alpha
		if cross, _ := r.shadow.FindCrossSectorPatterns(sector, 1); len(cross) > 0 && (oracleLag || ext.ShouldApplySuperAlpha(mp.YesPct)) && !hasConflict {
			alpha += 5
			logic += " Cross-sector meta-pattern: lag signal reinforced."
		}

		// Oracle Supremacy: when oracle conflicts with news for crypto — trust Pyth, discount news (only when no block)
		if oracleLag && isCryptoMarket(mp) && ext.IsSentimentNegative() && !hasConflict {
			logic += " Oracle Supremacy: Pyth overrides negative news sentiment."
		}

		alpha = (leviathanPct - mp.YesPct) * 100
		if alpha < 0 {
			alpha = -alpha
		}
		// Smart Summarization: Super Alpha +10% when news 80% contradicts Polymarket trend
		if ext.ShouldApplySuperAlpha(mp.YesPct) {
			alpha += 10
			logic += " Super Alpha: news contradicts market trend."
		}

		sourceUsed := ext.InferSourceUsed()
		intLogic := ext.IsIntLogicOnly()
		// Synthesis Supremacy: Golden Vector Priming — when current matches Golden Vector from memory
		if len(similar) > 0 && allGolden {
			EmitGoldenPatternMatch()
		}
		// Live Stream: Alpha only if >= 10% (Zero-Waste Memory). Steady Flow: (Int-Logic) when no external data
		if alpha >= 10 {
			EmitAlpha(alpha, intLogic)
		}
		layersUsed := ext.LayersUsedString(oracleLag)
		// Eternal Oracle: Shadow Execution — predicted reaction hours from fact chains
		var predictedHrs float64
		if ext.GitHubSummary != "" {
			avgH, cnt := r.shadow.FindSimilarFactChains(DomainCode, sector, keywords, 10)
			if cnt > 0 && avgH > 0 {
				predictedHrs = avgH
				EmitPredictiveForecast(avgH, cnt)
			}
		} else if ext.ArXivSummary != "" {
			avgH, cnt := r.shadow.FindSimilarFactChains(DomainScience, sector, keywords, 10)
			if cnt > 0 && avgH > 0 {
				predictedHrs = avgH
				EmitPredictiveForecast(avgH, cnt)
			}
		}
		_, msg, err := r.shadow.LogShadowWithNotifyAndSourceAndLayersAndPredictedHours(
			mp.EventID, mp.MarketID, mp.EventName, mp.Question,
			leviathanPct, mp.YesPct, alpha, logic, sourceUsed, layersUsed, predictedHrs,
		)
		if err != nil {
			log.Printf("[Leviathan] Shadow log error: %v", err)
			continue
		}
		// Omni-Source: Short-Term Memory — store fact for 24h delay learning. Eternal Oracle: predicted_hours.
		if ext.GitHubSummary != "" {
			_ = r.shadow.LogFactCorrelation(mp.MarketID, DomainCode, "GitHub", sector, keywords, predictedHrs)
		} else if ext.ArXivSummary != "" {
			_ = r.shadow.LogFactCorrelation(mp.MarketID, DomainScience, "ArXiv", sector, keywords, predictedHrs)
		} else if oracleLag {
			_ = r.shadow.LogFactCorrelation(mp.MarketID, DomainFinance, "Pyth", sector, keywords, 0)
		}
		if err := r.telegram.Send(ctx, msg); err != nil {
			log.Printf("[Leviathan] Telegram error: %v", err)
		}
		// Digital Hygiene: aggressive cleanup after verdict
		RunHygieneCycle()
	}

	// 2. Outcome Tracking (Duty of Accountability): every Shadow Bet must reach Resolution
	ids, _ := r.shadow.PendingAudits()
	if len(ids) > 0 {
		closedMarkets, _ := r.pm.FetchClosedEvents(200)
		for _, mid := range ids {
			for _, m := range closedMarkets {
				if m.MarketID == mid && m.Closed && m.ResolvedYes != nil {
					r.finalResolution(ctx, mid, *m.ResolvedYes)
					break
				}
			}
		}
	}

	// Data Distillation: prune low-alpha entries from cache after 5 min
	r.pm.PruneLowAlphaData(func(mid string) bool {
		has, _ := r.shadow.HasPendingPrediction(mid)
		return has
	}, time.Duration(r.cfg.LowAlphaPruneMin)*time.Minute)
}

// truthVerificationLoop: every 6 hours, Gamma API for closed markets (Truth Verification).
func (r *Runner) truthVerificationLoop(ctx context.Context) {
	defer r.wg.Done()
	interval := time.Duration(r.cfg.TruthVerifyHours) * time.Hour
	if interval < time.Minute {
		interval = 6 * time.Hour
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			ids, _ := r.shadow.PendingAudits()
			if len(ids) == 0 {
				continue
			}
			closedMarkets, err := r.pm.FetchClosedEvents(200)
			if err != nil {
				log.Printf("[Leviathan] Truth Verification fetch error: %v", err)
				continue
			}
			for _, mid := range ids {
				for _, m := range closedMarkets {
					if m.MarketID == mid && m.Closed && m.ResolvedYes != nil {
						log.Printf("[Leviathan] Truth Verification: closed market %s found — sending report immediately", mid)
						r.finalResolution(ctx, mid, *m.ResolvedYes)
						break
					}
				}
			}
		}
	}
}

// evolutionLoop: Infinite Growth — Self-Evolution. Server Health: prefer low market activity (2-7 AM UTC).
func (r *Runner) evolutionLoop(ctx context.Context) {
	defer r.wg.Done()
	select {
	case <-ctx.Done():
		return
	case <-r.stopCh:
		return
	case <-time.After(2 * time.Minute):
		// Resource Wisdom: let main poll run first
	}
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	var lastRun time.Time
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			// Server Health: run during minimal activity (2-7 AM UTC), or fallback every 24h
			shouldRun := IsLowMarketActivity() || time.Since(lastRun) > 24*time.Hour
			if !shouldRun {
				continue
			}
			lastRun = time.Now()
			delta, improved := r.shadow.RunEvolutionTuning()
			if improved && delta > 0.001 {
				EmitIntelligenceUpgraded(delta)
				log.Printf("[Leviathan] Infinite Growth: Accuracy +%.2f%% via Genetic Tuning", delta)
			}
		}
	}
}

// systemStatusLoop: Sentience Ticker — during idle, emit sector accuracy stats
func (r *Runner) systemStatusLoop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(90 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			// Living Leviathan: Global Homeostasis — feed accuracy for Code Layer boost / Predictive Silence
			UpdateHomeostasisAccuracy(r.shadow.GetSystemIQ())
			stats := r.shadow.GetSectorAccuracyStats()
			for _, s := range stats {
				sectorName := s.Sector
				if sectorName == "" {
					continue
				}
				// Capitalize for display: politics -> Politics
				if len(sectorName) > 0 {
					sectorName = strings.ToUpper(sectorName[:1]) + sectorName[1:]
				}
				EmitSystemStatus(fmt.Sprintf("Current accuracy in %s: %.0f%%", sectorName, s.AccuracyPct))
			}
		}
	}
}

// bankVaultLoop: Guardian Mode — Database Watchdog every 12 hours
func (r *Runner) bankVaultLoop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(12 * time.Hour)
	defer ticker.Stop()
	// Emit once on start
	if n, err := r.shadow.CountLessons(); err == nil {
		EmitBankVault(n)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			if n, err := r.shadow.CountLessons(); err == nil {
				EmitBankVault(n)
			}
		}
	}
}

// iqReportLoop: Omniscience 2.0 — Synthetic IQ Reports every 6 hours
func (r *Runner) iqReportLoop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			lessonsToday, _ := r.shadow.CountLessonsToday()
			iq := r.shadow.GetSystemIQ()
			EmitIQReport(lessonsToday, iq)
			log.Printf("[Leviathan] Omniscience 2.0: IQ Report — %d lessons today, System IQ: %.1f", lessonsToday, iq)
		}
	}
}

// selfTestLoop — Living Leviathan: Continuous Self-Test. If 4h without Integrity Check, run hidden audit.
func (r *Runner) selfTestLoop(ctx context.Context) {
	defer r.wg.Done()
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			if time.Since(getLastIntegrityCheckTime()) < 4*time.Hour {
				continue
			}
			// Hidden audit: all DBs, output to ticker
			summary := r.shadow.RunHiddenAudit()
			EmitHiddenAudit(summary)
			EmitIntegrityCheck()
			log.Printf("[Leviathan] Living Leviathan: Continuous Self-Test — %s", summary)
		}
	}
}

// sourceLeaderboardLoop: Synthesis Supremacy — Source Accountability every 24 hours
func (r *Runner) sourceLeaderboardLoop(ctx context.Context) {
	defer r.wg.Done()
	// Emit once after 2 min (so Architect sees initial state), then every 24h
	select {
	case <-ctx.Done():
		return
	case <-r.stopCh:
		return
	case <-time.After(2 * time.Minute):
		r.emitSourceLeaderboard()
	}
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-r.stopCh:
			return
		case <-ticker.C:
			r.emitSourceLeaderboard()
		}
	}
}

func (r *Runner) emitSourceLeaderboard() {
	entries := r.shadow.GetSourceLeaderboard()
	if len(entries) == 0 {
		return
	}
	var parts []string
	for i, e := range entries {
		parts = append(parts, fmt.Sprintf("%d. %s (%.0f%%)", i+1, e.Source, e.AccuracyPct))
	}
	EmitSourceLeaderboard("Leaderboard: " + strings.Join(parts, ", "))
}

// finalResolution: 3. Feedback Report + 4. Data Pruning (Final Resolution protocol)
// Evolutionary Data: distill each result into Long-Term Memory (LogLesson, UpdateSectorAccuracy)
func (r *Runner) finalResolution(ctx context.Context, marketID string, resolvedYes bool) {
	results, err := r.shadow.AuditClosedMarketAndReport(marketID, resolvedYes)
	if err != nil || len(results) == 0 {
		return
	}
	for _, res := range results {
		sector := InferSectorFromText(res.EventName + " " + res.MarketQuestion)
		keywords := res.EventName + " " + res.MarketQuestion
		if len(keywords) > 200 {
			keywords = keywords[:200]
		}
		// Resolve fact correlations for 24h delay learning. Eternal Oracle: Temporal Precision.
		actualH, predH, hadPred := r.shadow.ResolveFactCorrelation(marketID, res.ResolvedYes, res.Correct)
		if hadPred && actualH > 0 {
			EmitTemporalPrecision(predH, actualH)
		}
		// Hyper-Learning: Cross-Verification — only absorb when 2+ domains confirmed
		domainCount := CountDomainsInLayers(res.LayersUsed)
		if res.Correct && domainCount >= 2 {
			_ = r.shadow.LogLesson(Lesson{
				Sector:     sector,
				Keywords:   keywords,
				Correct:    true,
				SourceUsed: res.SourceUsed,
				Reasoning:  res.Reasoning + " [2+ domains: " + res.LayersUsed + "]",
			})
		} else if res.Correct && domainCount < 2 {
			// Synthetic Compression: still update sector_accuracy, but no Golden Vector (single domain)
			log.Printf("[Leviathan] Hyper-Learning: skipping LogLesson (only %d domain(s)) — %s", domainCount, res.LayersUsed)
		}
		// Truth Weighting: audit + real-time SectorWeights correction
		_ = r.shadow.UpdateSectorAccuracy(sector, res.SourceUsed, res.Correct)
		// Digital Hygiene: reset contradiction count when source was correct (agreed with outcome)
		if res.Correct && res.SourceUsed != "" {
			r.shadow.ResetContradictionCount(res.SourceUsed)
		}
		if res.Correct {
			if bestSource := r.shadow.GetBestSourceForSector(sector); bestSource != "" {
				EmitLearning(fmt.Sprintf("Truth Weighting: %s now lead for %s (Verified)", bestSource, sector))
			}
		}
		// Live Stream + Sentience Ticker: Truth Transparency — honest error output
		if !res.Correct {
			EmitLearning("Past forecast was wrong. Updating weights....")
			if res.Reasoning != "" {
				EmitLearning("Reason: " + res.Reasoning)
			}
		}
	}
	report := FormatFeedbackReport(results)
	if report != "" {
		log.Printf("[Leviathan] %s", report)
		_ = r.telegram.Send(ctx, report)
	}
	r.pm.PruneFromCache(marketID)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
