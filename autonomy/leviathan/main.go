// Package leviathan implements an autonomous analytical node for Prediction Markets (Polymarket),
// blockchain metrics, and political sentiment. Zero-load surveillance, shadow predictions only (no real money).
package leviathan

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

// RunStandalone runs Leviathan as a standalone process. Use when LEVIATHAN_ENABLED=true.
func RunStandalone() {
	cfg := LoadConfig()
	if !cfg.Enabled {
		log.Printf("[Leviathan] Set LEVIATHAN_ENABLED=true to run")
		return
	}
	runner, err := NewRunner(cfg)
	if err != nil {
		log.Fatalf("[Leviathan] Init error: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	runner.Start(ctx)
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh
	log.Printf("[Leviathan] Shutting down...")
	cancel()
	runner.Stop()
}
