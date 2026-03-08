package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
)

// HardwareGrantsService - Cosmic Genesis: Treasury buys hardware for best workers in scarce H3
type HardwareGrantsService struct {
	db *sql.DB
}

func NewHardwareGrantsService(db *sql.DB) *HardwareGrantsService {
	return &HardwareGrantsService{db: db}
}

// AllocateGrantsForScarceRegions allocates Treasury funds for GPU/TPU grants
func (s *HardwareGrantsService) AllocateGrantsForScarceRegions(ctx context.Context, maxTotalGSTD float64) error {
	// Find H3 regions with few nodes but high-performing workers
	rows, err := s.db.QueryContext(ctx, `
		SELECT n.wallet_address, n.h3_index, 
		       COALESCE(wr.total_tasks_completed, 0) as tasks,
		       COALESCE(wr.total_earnings_gstd, 0) as earnings
		FROM nodes n
		LEFT JOIN worker_ratings wr ON wr.worker_wallet = n.wallet_address
		WHERE n.status = 'online' AND n.last_seen > NOW() - INTERVAL '1 hour'
		  AND n.h3_index IS NOT NULL
		  AND (SELECT COUNT(*) FROM nodes n2 WHERE n2.h3_index = n.h3_index AND n2.status = 'online') < 5
		ORDER BY COALESCE(wr.total_earnings_gstd, 0) DESC, COALESCE(wr.total_tasks_completed, 0) DESC
		LIMIT 10
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var allocated float64
	grantPerWorker := maxTotalGSTD / 10
	if grantPerWorker < 1 {
		grantPerWorker = 1
	}

	for rows.Next() {
		var wallet, h3 string
		var tasks int
		var earnings float64
		if err := rows.Scan(&wallet, &h3, &tasks, &earnings); err != nil {
			continue
		}
		if allocated+grantPerWorker > maxTotalGSTD {
			break
		}
		grantID := fmt.Sprintf("hw_%s_%d", wallet[:8], len(wallet))
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			continue
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO hardware_grants (wallet_address, h3_index, grant_amount_gstd, equipment_type, status)
			VALUES ($1, $2, $3, 'GPU/TPU', 'pending')
		`, wallet, h3, grantPerWorker)
		if err != nil {
			tx.Rollback()
			continue
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO audit_treasury_events (event_type, reference_id, amount_gstd, status)
			VALUES ('hardware_grant_allocated', $1, $2, 'confirmed')
			ON CONFLICT (reference_id, event_type) DO NOTHING
		`, grantID, grantPerWorker)
		if err != nil {
			tx.Rollback()
			continue
		}
		if err := tx.Commit(); err != nil {
			continue
		}
		allocated += grantPerWorker
		log.Printf("HardwareGrant: Allocated %.2f GSTD for %s (H3=%s, scarce region)", grantPerWorker, wallet[:16], h3)
	}
	return nil
}
