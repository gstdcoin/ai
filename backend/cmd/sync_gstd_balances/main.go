package main

import (
	"context"
	"database/sql"
	"log"
	"time"

	"distributed-computing-platform/internal/config"
	"distributed-computing-platform/internal/database"
	"distributed-computing-platform/internal/services"
)

// syncGSTDFromChain walks over all known user wallets and replaces
// off-chain GSTD balances with the real on-chain jetton balances.
// This is a one-shot migration tool – run it manually when you want
// to align the database with TON Mainnet.
func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	cfg := config.Load()

	db, err := database.NewConnection(cfg.Database)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	if cfg.TON.GSTDJettonAddress == "" {
		log.Fatalf("GSTD_JETTON_ADDRESS is not configured in TON config")
	}

	log.Printf("🔄 Starting GSTD on-chain balance sync using jetton master %s", cfg.TON.GSTDJettonAddress)

	tonService := services.NewTONService(cfg.TON.APIURL, cfg.TON.APIKey)

	// Select all distinct wallet addresses that have ever interacted with the platform.
	rows, err := db.QueryContext(ctx, `
		SELECT DISTINCT wallet_address
		FROM users
		WHERE wallet_address IS NOT NULL AND wallet_address <> ''
	`)
	if err != nil {
		log.Fatalf("failed to query users: %v", err)
	}
	defer rows.Close()

	var (
		totalUsers int
		updated    int
	)

	for rows.Next() {
		var addr string
		if err := rows.Scan(&addr); err != nil {
			log.Printf("skip user: failed to scan wallet_address: %v", err)
			continue
		}
		totalUsers++

		balance, err := tonService.GetJettonBalance(ctx, addr, cfg.TON.GSTDJettonAddress)
		if err != nil {
			log.Printf("⚠️  Failed to fetch on-chain GSTD balance for %s: %v", addr, err)
			continue
		}

		if err := updateUserBalance(ctx, db, addr, balance); err != nil {
			log.Printf("⚠️  Failed to update DB balance for %s: %v", addr, err)
			continue
		}
		updated++
	}

	if err := rows.Err(); err != nil {
		log.Printf("row iteration error: %v", err)
	}

	log.Printf("✅ GSTD balance sync complete. Users scanned: %d, updated: %d", totalUsers, updated)
}

// updateUserBalance overwrites gstd_balance and zeroes escrow/frozen fields
// to reflect the on-chain truth. Pending / off-chain balances are left intact.
func updateUserBalance(ctx context.Context, db *sql.DB, wallet string, onChain float64) error {
	_, err := db.ExecContext(ctx, `
		UPDATE users
		SET gstd_balance = $1,
		    gstd_escrow_balance = 0,
		    gstd_frozen = 0,
		    updated_at = NOW()
		WHERE wallet_address = $2
	`, onChain, wallet)
	return err
}
