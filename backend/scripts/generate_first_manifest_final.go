package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/services"
)

func main() {
	cfg := config.Load()
	// Override DB Host for Docker networking if needed, but config.Load() might read envs.
	// We will pass env vars when running the command.

	db, err := database.NewConnection(cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	manifestService := services.NewPayoutManifestService(db)
	
	ctx := context.Background()
	manifest, err := manifestService.GenerateManifest(ctx)
	if err != nil {
		log.Fatalf("Failed to generate manifest: %v", err)
	}

	manifestJSON, _ := json.MarshalIndent(manifest, "", "  ")
	fmt.Println("✅ First Payout Manifest Generated:")
	fmt.Println(string(manifestJSON))

	// Prepare the Telegram message format as requested
	fmt.Println("\n📊 Telegram Message Preview:")
	fmt.Printf("📊 Отчет по выплатам готов. Воркеров: %d. Сумма: %.2f GSTD. Хэш отчета: [%s]\n", 
		len(manifest.Workers), manifest.TotalAmount, manifest.ManifestHash)
}
