package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"internal/config"
	"internal/database"
	"internal/services"
)

func main() {
	cfg := config.Load()
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
