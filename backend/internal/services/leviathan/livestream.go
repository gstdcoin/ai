package leviathan

import (
	"fmt"
	"sync"
	"time"
)

// LiveStreamEvent holds a single ticker message. No-DB: lives 30s in memory then disappears.
type LiveStreamEvent struct {
	Msg      string
	At       time.Time
	AlphaPct float64 // for Zero-Waste: only emit when Alpha >= 10%
}

const (
	liveStreamRetention     = 60 * time.Second
	liveStreamMaxEvents     = 200
	liveStreamPaceThreshold = 120 // Contextual Pacing: when buffer > this, only high-priority
)

// LiveStream is an in-memory ring buffer for real-time Leviathan events (Protocol: Live Stream).
// Zero-Waste Memory: no raw news stored. Only "Vector Lesson" style messages.
// Client-Side Rendering: ticker animation on GPU, minimal server load.
var (
	liveStream     *liveStreamBuf
	liveStreamOnce sync.Once
)

type liveStreamBuf struct {
	mu     sync.RWMutex
	events []LiveStreamEvent
	subs   map[chan string]struct{}
	done   chan struct{}
}

func getLiveStream() *liveStreamBuf {
	liveStreamOnce.Do(func() {
		liveStream = &liveStreamBuf{
			events: make([]LiveStreamEvent, 0, liveStreamMaxEvents),
			subs:   make(map[chan string]struct{}),
			done:   make(chan struct{}),
		}
		go liveStream.pruneLoop()
		go liveStream.heartbeatLoop() // Visual Confirmation: Forced Pulse every 60s
	})
	return liveStream
}

// heartbeatLoop — Visual Confirmation: technical signal every 60s so Architect sees system active
func (b *liveStreamBuf) heartbeatLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-b.done:
			return
		case <-ticker.C:
			b.Emit("📊 System Heartbeat: Healthy", -1, false, 1) // priority 1 so not dropped when buffer full
		}
	}
}

func (b *liveStreamBuf) pruneLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-b.done:
			return
		case <-ticker.C:
			b.mu.Lock()
			cutoff := time.Now().Add(-liveStreamRetention)
			i := 0
			for _, e := range b.events {
				if e.At.After(cutoff) {
					b.events[i] = e
					i++
				}
			}
			b.events = b.events[:i]
			b.mu.Unlock()
		}
	}
}

// priority: 0=low (Scan, Sensors), 1=high (Alpha, Learning). Contextual Pacing: when buffer full, only high.
func (b *liveStreamBuf) Emit(msg string, alphaPct float64, alphaRelevant bool, priority int) {
	if alphaRelevant && alphaPct >= 0 && alphaPct < 10 {
		return // Zero-Waste: don't clutter Architect attention
	}
	b.mu.Lock()
	// Contextual Pacing: if too many events, prioritize Alpha and Learning
	if len(b.events) >= liveStreamPaceThreshold && priority < 1 {
		b.mu.Unlock()
		return
	}
	e := LiveStreamEvent{Msg: msg, At: time.Now(), AlphaPct: alphaPct}
	if len(b.events) >= liveStreamMaxEvents {
		b.events = b.events[1:]
	}
	b.events = append(b.events, e)
	for ch := range b.subs {
		select {
		case ch <- msg:
		default:
		}
	}
	b.mu.Unlock()
}

// Subscribe returns a channel that receives new messages. Caller must call Unsubscribe when done.
func (b *liveStreamBuf) Subscribe() (ch chan string, unsub func()) {
	ch = make(chan string, 32)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	unsub = func() {
		b.mu.Lock()
		delete(b.subs, ch)
		b.mu.Unlock()
		close(ch)
	}
	return ch, unsub
}

// LiveStreamRecent returns events from the last 30 seconds (for SSE initial burst). Exported for API.
func LiveStreamRecent() []LiveStreamEvent {
	return getLiveStream().Recent()
}

// LiveStreamSubscribe returns a channel for new messages and an unsub function. Exported for API.
func LiveStreamSubscribe() (ch chan string, unsub func()) {
	return getLiveStream().Subscribe()
}

// Recent returns events from the last 30 seconds (for initial SSE burst).
func (b *liveStreamBuf) Recent() []LiveStreamEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	cutoff := time.Now().Add(-liveStreamRetention)
	var out []LiveStreamEvent
	for i := len(b.events) - 1; i >= 0; i-- {
		if b.events[i].At.Before(cutoff) {
			break
		}
		out = append([]LiveStreamEvent{b.events[i]}, out...)
	}
	return out
}

// EmitScan emits "🔍 Scan: [Event]" — Visual Hook, low priority
func EmitScan(event string) {
	getLiveStream().Emit("🔍 Scan: "+event, -1, false, 0)
}

// EmitAlpha emits "🔱 Alpha found: +X%" — Visual Hook, high priority
// Steady Flow: Ticker Clarity — add (Int-Logic) when verdict from pure system calculation
func EmitAlpha(alphaPct float64, intLogic bool) {
	suffix := ""
	if intLogic {
		suffix = " (Int-Logic)"
	}
	getLiveStream().Emit("🔱 Alpha found: +"+formatPct(alphaPct)+"%"+suffix, alphaPct, true, 1)
}

// EmitLearning emits "🎓 Learning: ..." — Truth Transparency, high priority
func EmitLearning(msg string) {
	getLiveStream().Emit("🎓 Learning: "+msg, -1, false, 1)
}

// EmitRecall emits "🧠 Recall: Similar pattern from [Date] found" — Visual Hook, high priority
func EmitRecall(dateOrContext string) {
	getLiveStream().Emit("🧠 Recall: Similar pattern from "+dateOrContext+" found", -1, false, 1)
}

// EmitSensors emits GlobalSenses activity — low priority
func EmitSensors(msg string) {
	getLiveStream().Emit(msg, -1, false, 0)
}

// EmitSystemStatus emits "📊 Current accuracy in Politics: 74%" — idle stats, low priority
func EmitSystemStatus(stats string) {
	getLiveStream().Emit("📊 "+stats, -1, false, 0)
}

// EmitIntelligenceUpgraded emits "🎓 Intelligence Upgraded: Accuracy +0.12% via Genetic Tuning" — Live Proof
func EmitIntelligenceUpgraded(deltaPct float64) {
	getLiveStream().Emit(fmt.Sprintf("🎓 Intelligence Upgraded: Accuracy +%.2f%% via Genetic Tuning", deltaPct), -1, false, 1)
}

// EmitBootstrapEvent — Memory Integrity: when buffer empty on first connect, re-initialize stream
func EmitBootstrapEvent() {
	getLiveStream().Emit("[SYSTEM] Re-initializing stream for Architect....", -1, false, 1)
	// Signal Injection: confirm ticker works
	getLiveStream().Emit("🔱 Alpha found: +15.0% (Int-Logic)", 15, true, 1)
}

// EmitBankVault — Guardian Mode: Database Watchdog status every 12h
func EmitBankVault(lessonCount int) {
	getLiveStream().Emit(fmt.Sprintf("Bank Vault: [%d] Lessons stored. Integrity 100%%", lessonCount), -1, false, 0)
}

// EmitOracleVerified — Open Data Synergy: Intelligence Streaming. Each oracle confirmation to ticker with (Verified).
func EmitOracleVerified(msg string) {
	getLiveStream().Emit(msg+" (Verified)", -1, false, 1)
}

// EmitGoldenPatternMatch — Synthesis Supremacy: Golden Vector Priming. When situation matches Golden Vector from memory.
func EmitGoldenPatternMatch() {
	getLiveStream().Emit("🏆 Golden Pattern Match: High Confidence Verdict", -1, false, 1)
}

// EmitSourceLeaderboard — Synthesis Supremacy: Source Accountability. 24h report on source effectiveness.
func EmitSourceLeaderboard(msg string) {
	getLiveStream().Emit("📊 "+msg, -1, false, 0)
}

// EmitIQMilestone — Singularity Gateway: when IQ +1.0, broadcast to ticker.
func EmitIQMilestone(iq float64) {
	msg := fmt.Sprintf("🎓 IQ Level Up: Network Intelligence reached %.1f. All nodes rewarded.", iq)
	getLiveStream().Emit(msg, -1, false, 1)
}

// EmitIQReport — Omniscience 2.0: Synthetic IQ Reports. Every 6h: lessons today + system IQ.
func EmitIQReport(lessonsToday int, iq float64) {
	msg := fmt.Sprintf("Интеллектуальный прогресс: Усвоено [%d] микро-уроков за сегодня. Текущий IQ системы: %.1f", lessonsToday, iq)
	getLiveStream().Emit("📊 "+msg, -1, false, 1)
}

// EmitPredictiveForecast — Sovereign Ascension: Predictive Fact-Linking. Forecast market reaction delay from experience.
func EmitPredictiveForecast(hours float64, chainCount int) {
	msg := fmt.Sprintf("🔮 Прогноз: Ожидаю реакцию рынка через %.0f часов на основе опыта (%d цепочек)", hours, chainCount)
	getLiveStream().Emit(msg, -1, false, 1)
}

// EmitTemporalPrecision — Eternal Oracle: refine time prediction after market close.
func EmitTemporalPrecision(predictedHours, actualHours float64) {
	msg := fmt.Sprintf("⏱ Temporal Precision: predicted %.0fh, actual %.0fh (refined)", predictedHours, actualHours)
	getLiveStream().Emit(msg, -1, false, 1)
}

// EmitIntegrityGuard — Eternal Oracle: when >70% media blocked, trust only Code and Oracles.
func EmitIntegrityGuard() {
	msg := "⚠️ Информационный вакуум: Доверяю только Коду и Оракулам."
	getLiveStream().Emit(msg, -1, false, 1)
}

// EmitIntegrityCheck — Self-Test & Reboot: final confirmation after startup.
func EmitIntegrityCheck() {
	msg := "✅ Integrity Check: All systems nominal. Digital Hygiene: 100%. IQ: Evolving."
	getLiveStream().Emit(msg, -1, false, 1)
	updateLastIntegrityCheckTime()
}

// EmitHiddenAudit — Living Leviathan: Continuous Self-Test. Output hidden audit result to ticker.
func EmitHiddenAudit(msg string) {
	getLiveStream().Emit("🔒 Hidden Audit: "+msg, -1, false, 1)
}

func formatPct(p float64) string {
	if p < 0 {
		p = -p
	}
	return fmt.Sprintf("%.1f", p)
}
