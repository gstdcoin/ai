package main

import (
	"distributed-computing-platform/internal/app"
	"distributed-computing-platform/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"log"
	"os"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("🌌 Starting GSTD Platform Backend (DI Mode)...")
	log.Printf("PHASE 2: FIRST BLOOD - SUCCESSFUL")

	// 0. Load environment variables from .env if present
	if err := godotenv.Load(); err != nil {
		log.Printf("ℹ️  No .env file found or error loading it: %v", err)
	}

	// 1. Initial configuration check
	cfg := config.Load()
	if cfg == nil {
		log.Fatal("❌ Failed to load configuration")
	}

	log.Printf("📂 DB Config: Host=%s Port=%s User=%s DBName=%s SSLMode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.User, cfg.Database.DBName, cfg.Database.SSLMode)

	// Security Check: Hardened Environment
	bridgeEncryptKey := os.Getenv("BRIDGE_ENCRYPTION_KEY")
	if bridgeEncryptKey == "" {
		log.Fatal("❌ BRIDGE_ENCRYPTION_KEY environment variable is required")
	}

	// Always use Release mode in production (override with GIN_MODE=debug for development)
	ginMode := os.Getenv("GIN_MODE")
	if ginMode == "" {
		ginMode = "release" // Default to release for security
	}
	gin.SetMode(ginMode)
	if ginMode == "release" {
		log.Printf("🔒 Running in Release Mode")
	}

	// 2. Build and Start Application using DI Container
	container := app.BuildContainer()

	if err := app.StartApplication(container); err != nil {
		log.Fatalf("❌ Failed to start application: %v", err)
	}
}
