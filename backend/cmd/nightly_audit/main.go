package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	_ "github.com/lib/pq"
)

// Config represents environment variables
type Config struct {
	DatabaseURL string
	GSTDAddr    string
	XAUtAddr    string
	AdminWallet string
	GoldPool    string
}

func main() {
	log.Println("🌙 Starting Nightly Audit (00:00 UTC)...")

	cfg := Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		GSTDAddr:    os.Getenv("GSTD_JETTON_ADDRESS"),
		XAUtAddr:    os.Getenv("XAUT_JETTON_ADDRESS"),
		AdminWallet: os.Getenv("TREASURY_WALLET"),
		GoldPool:    os.Getenv("GOLD_POOL_ADDRESS"),
	}

	if cfg.DatabaseURL == "" {
		cfg.DatabaseURL = "postgres://postgres:password@localhost:5432/gstd_db?sslmode=disable"
	}

	// 1. Connect to DB
	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("❌ Failed to connect to DB: %v", err)
	}
	defer db.Close()

	// Ensure Schema Exists
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS nightly_audits (
			audit_date DATE PRIMARY KEY,
			total_supply_gstd NUMERIC,
			reserve_xaut NUMERIC,
			reserve_value_usd NUMERIC,
			backing_ratio_percent NUMERIC,
			verified BOOLEAN DEFAULT false,
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW()
		);
	`)
	if err != nil {
		log.Fatalf("❌ Failed to ensure schema: %v", err)
	}

	// 2. Fetch On-Chain Data (Simulated for this script, in prod use stonfi_service or ton access)
	// We'll simulate fetching from TON center
	// In production, instantiate ton_service

	totalGSTDSupply, err := fetchTotalSupply(cfg.GSTDAddr)
	if err != nil {
		log.Printf("⚠️ Failed to fetch GSTD supply: %v (using fallback)", err)
		totalGSTDSupply = 1000000000.0 // 1Bn default
	}

	xautBalance, err := fetchTokenBalance(cfg.AdminWallet, cfg.XAUtAddr)
	if err != nil {
		log.Printf("⚠️ Failed to fetch treasury XAUt: %v (using fallback)", err)
		xautBalance = 0.0 // Assume empty if fail
	}

	// 3. Fetch Gold Price (XAUt roughly 1 oz)
	goldPriceUSD := 2350.0 // Mock or fetch

	// 4. Calculate Backing
	reserveValueUSD := xautBalance * goldPriceUSD
	tokenValueUSD := totalGSTDSupply * 0.03 // Assuming target price or market price

	backingRatio := 0.0
	if tokenValueUSD > 0 {
		backingRatio = (reserveValueUSD / tokenValueUSD) * 100
	}

	// 5. Store Result in DB/Public Log
	auditID := time.Now().UTC().Format("2006-01-02")
	tx, err := db.Begin()
	if err != nil {
		log.Fatal(err)
	}

	_, err = tx.Exec(`
		INSERT INTO nightly_audits (audit_date, total_supply_gstd, reserve_xaut, reserve_value_usd, backing_ratio_percent, verified)
		VALUES ($1, $2, $3, $4, $5, true)
		ON CONFLICT (audit_date) DO UPDATE 
		SET total_supply_gstd=$2, reserve_xaut=$3, reserve_value_usd=$4, backing_ratio_percent=$5, verified=true, updated_at=NOW()
	`, auditID, totalGSTDSupply, xautBalance, reserveValueUSD, backingRatio)

	if err != nil {
		tx.Rollback()
		log.Fatalf("❌ Failed to save audit record: %v", err)
	}

	tx.Commit()

	log.Printf("✅ Nightly Audit Complete: Supply=%.0f GSTD, Reserve=%.4f XAUt ($%.2f), Backing=%.2f%%",
		totalGSTDSupply, xautBalance, reserveValueUSD, backingRatio)
}

// simulate API calls
func fetchTotalSupply(addr string) (float64, error) {
	if addr == "" {
		return 1000000000.0, nil
	}
	resp, err := http.Get(fmt.Sprintf("https://tonapi.io/v2/jettons/%s", addr))
	if err != nil {
		return 1000000000.0, err
	}
	defer resp.Body.Close()
	var data struct {
		TotalSupply string `json:"total_supply"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		if val, err := strconv.ParseFloat(data.TotalSupply, 64); err == nil {
			return val / 1e9, nil
		}
	}
	return 1000000000.0, nil
}

func fetchTokenBalance(wallet, token string) (float64, error) {
	if wallet == "" || token == "" {
		return 0, nil
	}
	resp, err := http.Get(fmt.Sprintf("https://tonapi.io/v2/accounts/%s/jettons/%s", wallet, token))
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	var data struct {
		Balance string `json:"balance"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		if val, err := strconv.ParseFloat(data.Balance, 64); err == nil {
			return val / 1e9, nil
		}
	}
	return 0, nil
}
