package services

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
)

// Immortal Identity: Each Mesh Constitution is saved with hash-signature in blockchain (TON/Solana)
// — immutable record of success.

// ConstitutionAnchorService anchors constitution hashes to blockchain
type ConstitutionAnchorService struct {
	db         *sql.DB
	tonService *TONService
	solana     interface{} // multichain.SolanaService for future
}

// NewConstitutionAnchorService creates the anchor service
func NewConstitutionAnchorService(db *sql.DB, ton *TONService) *ConstitutionAnchorService {
	return &ConstitutionAnchorService{db: db, tonService: ton}
}

func (s *ConstitutionAnchorService) ensureSchema() {
	if s.db == nil {
		return
	}
	_, _ = s.db.Exec(`
		ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS constitution_hash VARCHAR(64);
		ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(128);
		ALTER TABLE mesh_constitution ADD COLUMN IF NOT EXISTS anchored_chain VARCHAR(16);
	`)
}

// AnchorReport computes hash and stores/anchors the constitution
func (s *ConstitutionAnchorService) AnchorReport(ctx context.Context, report *MeshConstitutionReport) (hashHex, txHash string) {
	if s.db == nil || report == nil {
		return "", ""
	}
	s.ensureSchema()

	payload, err := json.Marshal(report)
	if err != nil {
		return "", ""
	}
	h := sha256.Sum256(payload)
	hashHex = hex.EncodeToString(h[:])

	// Attempt blockchain anchoring (TON preferred)
	txHash = s.anchorToBlockchain(ctx, hashHex)

	if txHash != "" {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE mesh_constitution
			SET constitution_hash = $1, blockchain_tx_hash = $2, anchored_chain = 'TON'
			WHERE report_month = $3
		`, hashHex, txHash, report.ReportMonth)
		log.Printf("[Immortal Identity] Constitution %s anchored: hash=%s tx=%s", report.ReportMonth, hashHex[:16]+"...", txHash)
	} else {
		_, _ = s.db.ExecContext(ctx, `
			UPDATE mesh_constitution SET constitution_hash = $1 WHERE report_month = $2
		`, hashHex, report.ReportMonth)
		log.Printf("[Immortal Identity] Constitution %s hash stored (blockchain anchor pending): %s", report.ReportMonth, hashHex[:16]+"...")
	}
	return hashHex, txHash
}

// anchorToBlockchain attempts to store hash on TON (comment in transfer) or Solana
func (s *ConstitutionAnchorService) anchorToBlockchain(ctx context.Context, hashHex string) string {
	// TON: would use platform wallet to send 0.001 TON with comment=hash
	// Requires PLATFORM_WALLET_PRIVATE_KEY and anchor recipient address
	// For now: placeholder — actual implementation when wallet configured
	if s.tonService != nil {
		// TODO: TonWalletService.SendWithComment(hashHex) when available
		return ""
	}
	return ""
}
