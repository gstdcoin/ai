package services

import (
	"context"
	"log"
	"time"
)

// GoldBroadcastRunner - Absolute Point: Gold Reserve changes → instant Hash-Rate Multiplier via WebSocket
type GoldBroadcastRunner struct {
	goldHash *GoldHashRateService
	hub      interface{ BroadcastAnnouncement(string, string, interface{}) }
}

func NewGoldBroadcastRunner(goldHash *GoldHashRateService, hub interface{ BroadcastAnnouncement(string, string, interface{}) }) *GoldBroadcastRunner {
	return &GoldBroadcastRunner{goldHash: goldHash, hub: hub}
}

func (r *GoldBroadcastRunner) Start(ctx context.Context) {
	if r.hub == nil {
		return
	}
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	var lastMult float64
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			mult := r.goldHash.GetGoldMultiplier(ctx)
			if mult != lastMult || lastMult == 0 {
				lastMult = mult
				payload := map[string]interface{}{"gold_multiplier": mult, "timestamp": time.Now().Unix()}
				r.hub.BroadcastAnnouncement("gold_multiplier", "", payload)
				log.Printf("📡 Gold multiplier broadcast: %.4f", mult)
			}
		}
	}
}
