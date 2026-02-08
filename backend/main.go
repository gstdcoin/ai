package main

import (
	"distributed-computing-platform/internal/app"
	"distributed-computing-platform/internal/config"
	"github.com/gin-gonic/gin"
	"log"
	"os"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("🌌 Starting GSTD Platform Backend (DI Mode)...")

	// 1. Initial configuration check
	cfg := config.Load()
	if cfg == nil {
		log.Fatal("❌ Failed to load configuration")
	}

	// Security Check: Hardened Environment
	bridgeEncryptKey := os.Getenv("BRIDGE_ENCRYPTION_KEY")
	if bridgeEncryptKey == "" {
		log.Fatal("❌ BRIDGE_ENCRYPTION_KEY environment variable is required")
	}

	// Set Gin mode based on environment/port
	if cfg.Server.Port == "80" || cfg.Server.Port == "443" {
		log.Printf("🔒 Running in Release Mode")
		gin.SetMode(gin.ReleaseMode)
	}

	// 2. Build and Start Application using DI Container
	container := app.BuildContainer()
	
	if err := app.StartApplication(container); err != nil {
		log.Fatalf("❌ Failed to start application: %v", err)
	}
}
