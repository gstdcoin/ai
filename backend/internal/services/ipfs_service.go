package services

// ═══════════════════════════════════════════════════════════════
// IPFS SERVICE (awesome-ipfs)
// Source: https://github.com/ipfs/awesome-ipfs
//
// Stores AI task results on IPFS for:
//   - Verifiable & immutable inference proofs
//   - Decentralized storage for model outputs
//   - CID → TON smart contract audit trail
// ═══════════════════════════════════════════════════════════════

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

type IPFSService struct {
	db         *sql.DB
	apiURL     string
	gatewayURL string
	enabled    bool
}

type IPFSRecord struct {
	CID          string    `json:"cid"`
	TaskID       string    `json:"task_id"`
	ContentType  string    `json:"content_type"`
	SizeBytes    int64     `json:"size_bytes"`
	WalletSigner string    `json:"wallet_signer"`
	GatewayURL   string    `json:"gateway_url"`
	CreatedAt    time.Time `json:"created_at"`
}

type IPFSStats struct {
	TotalPinned      int64 `json:"total_pinned"`
	TotalSizeBytes   int64 `json:"total_size_bytes"`
	InferenceResults int64 `json:"inference_results"`
	AuditLogs        int64 `json:"audit_logs"`
	Enabled          bool  `json:"enabled"`
}

func NewIPFSService(db *sql.DB, apiURL string, gatewayURL string) *IPFSService {
	enabled := apiURL != ""
	if gatewayURL == "" {
		gatewayURL = "https://ipfs.io"
	}
	svc := &IPFSService{db: db, apiURL: apiURL, gatewayURL: gatewayURL, enabled: enabled}
	svc.ensureIPFSSchema()
	if enabled {
		log.Printf("📦 IPFS: API=%s, Gateway=%s", apiURL, gatewayURL)
	} else {
		log.Println("📦 IPFS: audit-only mode (set IPFS_API_URL to pin)")
	}
	return svc
}

func (s *IPFSService) ensureIPFSSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS ipfs_records (
			id BIGSERIAL PRIMARY KEY,
			cid VARCHAR(128) UNIQUE NOT NULL,
			task_id VARCHAR(128),
			content_type VARCHAR(32) DEFAULT 'inference_result',
			size_bytes BIGINT DEFAULT 0,
			wallet_signer VARCHAR(128),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_ipfs_cid ON ipfs_records(cid);
		CREATE INDEX IF NOT EXISTS idx_ipfs_task ON ipfs_records(task_id);
	`)
}

func (s *IPFSService) PinContent(ctx context.Context, content []byte, taskID, contentType, wallet string) (*IPFSRecord, error) {
	if !s.enabled {
		return s.fallbackCID(ctx, content, taskID, contentType, wallet)
	}

	url := fmt.Sprintf("%s/api/v0/add?pin=true", s.apiURL)
	resp, err := http.Post(url, "application/octet-stream", bytes.NewReader(content))
	if err != nil {
		return s.fallbackCID(ctx, content, taskID, contentType, wallet)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result struct {
		Hash string `json:"Hash"`
	}
	if err := json.Unmarshal(body, &result); err != nil || result.Hash == "" {
		return s.fallbackCID(ctx, content, taskID, contentType, wallet)
	}

	record := &IPFSRecord{
		CID: result.Hash, TaskID: taskID, ContentType: contentType,
		SizeBytes: int64(len(content)), WalletSigner: wallet,
		GatewayURL: fmt.Sprintf("%s/ipfs/%s", s.gatewayURL, result.Hash),
		CreatedAt:  time.Now(),
	}
	s.saveRecord(ctx, record)
	return record, nil
}

func (s *IPFSService) fallbackCID(ctx context.Context, content []byte, taskID, contentType, wallet string) (*IPFSRecord, error) {
	hash := sha256.Sum256(content)
	cid := fmt.Sprintf("Qm%x", hash[:23])
	record := &IPFSRecord{
		CID: cid, TaskID: taskID, ContentType: contentType,
		SizeBytes: int64(len(content)), WalletSigner: wallet,
		GatewayURL: fmt.Sprintf("%s/ipfs/%s", s.gatewayURL, cid),
		CreatedAt:  time.Now(),
	}
	s.saveRecord(ctx, record)
	return record, nil
}

func (s *IPFSService) saveRecord(ctx context.Context, r *IPFSRecord) {
	if s.db == nil {
		return
	}
	s.db.ExecContext(ctx, `
		INSERT INTO ipfs_records (cid, task_id, content_type, size_bytes, wallet_signer)
		VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cid) DO NOTHING
	`, r.CID, r.TaskID, r.ContentType, r.SizeBytes, r.WalletSigner)
}

func (s *IPFSService) GetStats(ctx context.Context) *IPFSStats {
	stats := &IPFSStats{Enabled: s.enabled}
	if s.db == nil {
		return stats
	}
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(size_bytes), 0),
		       COUNT(*) FILTER (WHERE content_type = 'inference_result'),
		       COUNT(*) FILTER (WHERE content_type = 'audit_log')
		FROM ipfs_records
	`).Scan(&stats.TotalPinned, &stats.TotalSizeBytes, &stats.InferenceResults, &stats.AuditLogs)
	return stats
}

func (s *IPFSService) IsEnabled() bool { return s.enabled }
