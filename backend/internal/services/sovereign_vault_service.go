package services

import (
	"database/sql"
	"fmt"
	"time"
)

// SovereignVaultService manages Decentralized Liquidity Nodes (DLN)
type SovereignVaultService struct {
	DB *sql.DB
}

func NewSovereignVaultService(db *sql.DB) *SovereignVaultService {
	return &SovereignVaultService{DB: db}
}

// VaultState represents a node operator's liquidity pool
type VaultState struct {
	VaultID        string  `json:"vault_id"`
	NodeWallet     string  `json:"node_wallet"`
	Asset          string  `json:"asset"` // e.g. "GSTD", "TON", "USDT"
	TotalLiquidity float64 `json:"total_liquidity"`
	OperatorStake  float64 `json:"operator_stake"`
	DelegatorStake float64 `json:"delegator_stake"`
	ManagementFee  float64 `json:"management_fee_pct"` // e.g. 0.15 (15%)
	TotalVolume    float64 `json:"total_volume"`
	GeneratedYield float64 `json:"generated_yield"`
	Status         string  `json:"status"`
}

// CreateVault allows a node operator to open a Liquidity Pool and persists it
func (s *SovereignVaultService) CreateVault(nodeWallet string, asset string, initialStake float64, feePct float64) (*VaultState, error) {
	vaultID := fmt.Sprintf("VAULT-%d", time.Now().UnixNano())

	// Insert into DB
	query := `
		INSERT INTO liquidity_vaults (vault_id, node_wallet, asset, total_liquidity, operator_stake, delegator_stake, management_fee_pct, total_volume, generated_yield, status)
		VALUES ($1, $2, $3, $4, $5, 0, $6, 0, 0, 'active')
		RETURNING vault_id
	`
	var returnedID string
	err := s.DB.QueryRow(query, vaultID, nodeWallet, asset, initialStake, initialStake, feePct).Scan(&returnedID)

	if err != nil {
		return nil, fmt.Errorf("failed to create liquidity vault in database: %w", err)
	}

	return &VaultState{
		VaultID:        vaultID,
		NodeWallet:     nodeWallet,
		Asset:          asset,
		TotalLiquidity: initialStake,
		OperatorStake:  initialStake,
		DelegatorStake: 0,
		ManagementFee:  feePct,
		TotalVolume:    0,
		GeneratedYield: 0,
		Status:         "active",
	}, nil
}

// GetAllVaults retrieves active vaults for the network mapping display
func (s *SovereignVaultService) GetAllVaults() ([]VaultState, error) {
	rows, err := s.DB.Query(`
		SELECT vault_id, node_wallet, asset, total_liquidity, operator_stake, delegator_stake, management_fee_pct, total_volume, generated_yield, status
		FROM liquidity_vaults
		WHERE status = 'active'
		ORDER BY total_liquidity DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []VaultState
	for rows.Next() {
		var v VaultState
		var volume sql.NullFloat64
		var yield sql.NullFloat64
		if err := rows.Scan(&v.VaultID, &v.NodeWallet, &v.Asset, &v.TotalLiquidity, &v.OperatorStake, &v.DelegatorStake, &v.ManagementFee, &volume, &yield, &v.Status); err == nil {
			v.TotalVolume = volume.Float64
			v.GeneratedYield = yield.Float64
			vaults = append(vaults, v)
		}
	}
	return vaults, nil
}

// RouteThroughVault attempts to use the node's local liquidity for a swap, generating yield
func (s *SovereignVaultService) RouteThroughVault(vaultID string, amount float64, routeFeePct float64) (float64, error) {
	yield := amount * routeFeePct

	_, err := s.DB.Exec(`
		UPDATE liquidity_vaults 
		SET total_volume = total_volume + $1,
		    generated_yield = generated_yield + $2
		WHERE vault_id = $3
	`, amount, yield, vaultID)

	if err != nil {
		return 0, err
	}

	return yield, nil
}
