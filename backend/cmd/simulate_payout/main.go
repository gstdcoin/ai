package main

import (
	"database/sql"
	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/services"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

func main() {
	// Load config
	cfg := config.Load()

	// Connect to DB
	dbInfo := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host, cfg.Database.Port, cfg.Database.User, cfg.Database.Password, cfg.Database.DBName, cfg.Database.SSLMode)
	
	db, err := sql.Open("postgres", dbInfo)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Initialize services
	telegramService := services.NewTelegramService(cfg.Telegram.BotToken, cfg.Telegram.ChatID)

	// User wallet (from args or default)
	userWallet := "UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED" // Default to admin for test if no arg
	if len(os.Args) > 1 {
		userWallet = os.Args[1]
	}

	taskID := "TEST_PAYOUT_001"
	
	// 1. Insert/Update Task
	fmt.Printf("Creating test task %s for wallet %s...\n", taskID, userWallet)
	_, err = db.Exec(`
		INSERT INTO tasks (
			task_id, creator_wallet, requester_address, assigned_device,
			task_type, status, budget_gstd, reward_gstd, 
			created_at, updated_at, completed_at, 
			executor_payout_status
		) VALUES (
			$1, $2, $2, 'test-device-001',
			'training', 'completed', 1.0, 1.0,
			NOW(), NOW(), NOW(),
			'pending'
		)
		ON CONFLICT (task_id) DO UPDATE SET
			status = 'completed',
			reward_gstd = 1.0,
			executor_payout_status = 'pending',
			creator_wallet = $2,
			requester_address = $2
	`, taskID, userWallet)
	if err != nil {
		log.Fatalf("Failed to insert task: %v", err)
	}

	// 2. Notify Telegram
	fmt.Println("Sending Telegram notification...")
	msg := fmt.Sprintf("🎁 <b>Тестовая задача выполнена!</b>\n\n"+
		"ID: %s\n"+
		"Награда: <b>1 GSTD</b>\n"+
		"Кошелек: <code>%s</code>\n\n"+
		"👉 <a href=\"https://app.gstdtoken.com\">Забрать награду</a>", taskID, userWallet)
	
	err = telegramService.SendMessage(context.Background(), msg)
	if err != nil {
		log.Printf("Failed to send telegram: %v", err)
	} else {
		fmt.Println("✅ Notification sent!")
	}
	
	// 3. Register user wallet to GSTD if needed (simulate backend valid user)
	// We ensure he has a 'user' entry
	_, err = db.Exec(`
		INSERT INTO users (wallet_address, created_at, updated_at)
		VALUES ($1, NOW(), NOW())
		ON CONFLICT (wallet_address) DO NOTHING
	`, userWallet)

	fmt.Println("✅ Simulation complete. Check Dashboard balance and Telegram.")
}
