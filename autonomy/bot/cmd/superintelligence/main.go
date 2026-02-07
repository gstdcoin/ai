package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"distributed-computing-platform/internal/services"
)

// SmartLauncher starts all autonomous components
func main() {
	log.Println("🧠 ═══════════════════════════════════════════════════════")
	log.Println("🧠   GSTD SUPERINTELLIGENCE CORE")
	log.Println("🧠   Automatic Error Correction + Self-Learning Enabled")
	log.Println("🧠 ═══════════════════════════════════════════════════════")

	// Create context that listens for shutdown signals
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		log.Println("🛑 Shutdown signal received...")
		cancel()
	}()

	// Initialize Hive Knowledge
	hive := services.NewHiveKnowledge("/app/data/hive_knowledge.json")
	log.Printf("📚 Hive Knowledge loaded: %v", hive.GetStats())

	// Initialize Intelligent Orchestrator (includes AutoFix)
	orchestrator := services.NewIntelligentOrchestrator()
	
	// Seed initial knowledge
	hive.StoreKnowledge(
		"platform_architecture",
		"GSTD uses Go backend with Gin, PostgreSQL, Redis. Frontend is Next.js. AI runs on Ollama.",
		"bootstrap",
		[]string{"architecture", "tech-stack"},
	)
	hive.StoreKnowledge(
		"error_patterns",
		"Common errors: container unhealthy -> restart. Database connection error -> check postgres. 401 -> check API keys.",
		"bootstrap",
		[]string{"errors", "troubleshooting"},
	)

	// Store common error fixes
	hive.StoreErrorFix(
		"container is unhealthy",
		"Restart the unhealthy container",
		[]string{"docker restart $CONTAINER_NAME"},
		true,
	)
	hive.StoreErrorFix(
		"connection refused",
		"Check if the target service is running",
		[]string{"docker ps", "docker start $SERVICE"},
		true,
	)
	hive.StoreErrorFix(
		"memory limit exceeded",
		"Clear caches and restart memory-heavy services",
		[]string{"docker system prune -f", "sync; echo 3 > /proc/sys/vm/drop_caches"},
		true,
	)

	log.Println("🚀 Starting Superintelligence Core...")
	
	// Start the orchestrator (this blocks until context is cancelled)
	orchestrator.Start(ctx)

	log.Println("👋 Superintelligence Core stopped. Goodbye!")
}
