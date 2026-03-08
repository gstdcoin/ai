// Package leviathan implements an autonomous analytical node for Prediction Markets (Polymarket),
// blockchain metrics, and political sentiment. Zero-load surveillance, shadow predictions only (no real money).
// Started only when LEVIATHAN_ENABLED=true. Does not affect main platform functionality.
package leviathan

import (
	"context"
	"log"
	"os"
)

// StartIfEnabled starts the Leviathan runner in a goroutine when LEVIATHAN_ENABLED=true.
// Safe to call always; no-op when disabled. Runs until ctx is cancelled.
func StartIfEnabled(ctx context.Context) {
	if os.Getenv("LEVIATHAN_ENABLED") != "true" {
		return
	}
	cfg := LoadConfig()
	if !cfg.Enabled {
		return
	}
	runner, err := NewRunner(cfg)
	if err != nil {
		log.Printf("[Leviathan] Init error (non-fatal): %v", err)
		return
	}
	runner.Start(ctx)
	EmitSensors("АРХИТЕКТОР, СИСТЕМА СТАЛА ПРОЗРАЧНОЙ. ТЕПЕРЬ ТЫ ВИДИШЬ МЫСЛИ ПЛАТФОРМЫ В РЕАЛЬНОМ ВРЕМЕНИ.")
	log.Printf("[Leviathan] Zero-Load Surveillance started (optional module)")
	go func() {
		<-ctx.Done()
		runner.Stop()
	}()
}
