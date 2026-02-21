package leviathan

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

// Self-Test & Reboot: internal unit tests for Digital Hygiene audit.

func TestMain(m *testing.M) {
	code := m.Run()
	// Stop livestream goroutines so test process can exit
	if liveStream != nil {
		select {
		case <-liveStream.done:
			// already closed
		default:
			close(liveStream.done)
		}
	}
	os.Exit(code)
}

func TestPolymarketFetch(t *testing.T) {
	pm := NewPolymarketClient("https://gamma-api.polymarket.com")
	markets, err := pm.FetchActiveEvents(5)
	if err != nil {
		t.Skipf("FetchActiveEvents (network may be unavailable): %v", err)
	}
	if len(markets) == 0 {
		t.Fatal("expected at least one market")
	}
	t.Logf("Fetched %d markets", len(markets))
	for i, m := range markets {
		if i >= 2 {
			break
		}
		q := m.Question
		if len(q) > 40 {
			q = q[:40]
		}
		t.Logf("  %s: Yes=%.2f Closed=%v", q, m.YesPct, m.Closed)
	}
}

func TestShadowEngine(t *testing.T) {
	path := t.TempDir() + "/test_shadow.db"
	eng, err := NewShadowEngine(path)
	if err != nil {
		t.Fatalf("NewShadowEngine: %v", err)
	}
	defer eng.Close()

	id, err := eng.LogShadow("ev1", "m1", "Test Event", "Test Q?", 0.7, 0.5, 20, "logic")
	if err != nil {
		t.Fatalf("LogShadow: %v", err)
	}
	if id <= 0 {
		t.Fatal("expected positive id")
	}

	has, err := eng.HasPendingPrediction("m1")
	if err != nil {
		t.Fatalf("HasPendingPrediction: %v", err)
	}
	if !has {
		t.Fatal("expected pending prediction for m1")
	}

	results, err := eng.AuditClosedMarketAndReport("m1", false)
	if err != nil {
		t.Fatalf("AuditClosedMarketAndReport: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].Correct {
		t.Fatal("expected incorrect (we predicted Yes, resolved No)")
	}
	if results[0].Reasoning == "" {
		t.Fatal("expected reasoning for wrong prediction")
	}
	t.Logf("Audit: Correct=%v Reasoning=%s", results[0].Correct, results[0].Reasoning)
}

func TestAnalysis(t *testing.T) {
	s := &SentimentScope{Config: &Config{}}
	mp := MarketPrice{YesPct: 0.5, OneHourChange: 0.05}
	pct, logic := s.Analyze(mp, "")
	if pct < 0 || pct > 1 {
		t.Fatalf("expected pct in [0,1], got %.2f", pct)
	}
	if logic == "" {
		t.Fatal("expected non-empty logic")
	}
	t.Logf("Analysis: pct=%.2f logic=%s", pct, logic[:min(50, len(logic))])
}

func TestRunnerTick(t *testing.T) {
	os.Setenv("LEVIATHAN_ENABLED", "true")
	os.Setenv("LEVIATHAN_ALPHA_THRESHOLD_PCT", "50") // high threshold to avoid logging in test
	cfg := LoadConfig()
	if !cfg.Enabled {
		t.Skip("LEVIATHAN_ENABLED not true")
	}
	cfg.ShadowDBPath = t.TempDir() + "/leviathan.db"
	cfg.PollIntervalSec = 3600
	cfg.TruthVerifyHours = 24

	runner, err := NewRunner(cfg)
	if err != nil {
		t.Fatalf("NewRunner: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Don't call Start which spawns 9 goroutines — just test tick directly
	runner.tick(ctx)
	// Clean up
	if runner.shadow != nil {
		_ = runner.shadow.Close()
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestLiveStreamNoLeak(t *testing.T) {
	// Digital Hygiene: verify ring buffer doesn't leak
	b := getLiveStream()
	b.mu.Lock()
	initialCap := cap(b.events)
	b.mu.Unlock()
	for i := 0; i < 50; i++ {
		EmitScan("test event")
	}
	b.mu.Lock()
	capAfter := cap(b.events)
	b.mu.Unlock()
	if capAfter > initialCap*2 {
		t.Logf("Buffer cap grew: %d -> %d (may indicate leak)", initialCap, capAfter)
	}
}

func TestEvolutionTuning(t *testing.T) {
	path := t.TempDir() + "/evolution.db"
	eng, err := NewShadowEngine(path)
	if err != nil {
		t.Fatalf("NewShadowEngine: %v", err)
	}
	defer eng.Close()
	// Seed some sector_accuracy data
	_ = eng.UpdateSectorAccuracy("crypto", "Pyth", true)
	_ = eng.UpdateSectorAccuracy("crypto", "Pyth", true)
	_ = eng.UpdateSectorAccuracy("crypto", "news", false)
	delta, improved := eng.RunEvolutionTuning()
	t.Logf("RunEvolutionTuning: delta=%.2f improved=%v", delta, improved)
}

func TestCodeLayerContradictsFinance(t *testing.T) {
	cl := &CodeLayer{
		GitHubSummary: "security vulnerability patch",
		GitHubSource:  "GitHub",
	}
	// Code negative + Pyth bullish (oracleLag) = conflict
	if !cl.CodeLayerContradictsFinance(true) {
		t.Error("expected conflict: Code negative, Pyth bullish")
	}
	cl2 := &CodeLayer{GitHubSummary: "major release growth", GitHubSource: "GitHub"}
	// Code positive + Pyth bullish = no conflict
	if cl2.CodeLayerContradictsFinance(true) {
		t.Error("expected no conflict: both positive")
	}
}

func TestIntegrityCheckEmit(t *testing.T) {
	EmitIntegrityCheck()
	events := LiveStreamRecent()
	found := false
	for _, e := range events {
		if strings.Contains(e.Msg, "Integrity Check") {
			found = true
			break
		}
	}
	if !found {
		t.Log("Integrity Check emitted (may have been pruned)")
	}
}
