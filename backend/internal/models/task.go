package models

import (
	"time"
)

type Task struct {
	TaskID              string     `json:"task_id" db:"task_id"`
	RequesterAddress    string     `json:"requester_address" db:"requester_address"`
	CreatorWallet       *string    `json:"creator_wallet,omitempty" db:"creator_wallet"`
	TaskType            string     `json:"task_type" db:"task_type"`
	Operation           string     `json:"operation" db:"operation"`
	Model               string     `json:"model" db:"model"`
	InputSource         string     `json:"input_source" db:"input_source"`
	InputHash           string     `json:"input_hash" db:"input_hash"`
	TimeLimitSec        int        `json:"time_limit_sec" db:"constraints_time_limit_sec"`
	MaxEnergyMwh        int        `json:"max_energy_mwh" db:"constraints_max_energy_mwh"`
	LaborCompensationTon float64    `json:"labor_compensation_ton" db:"labor_compensation_ton"`
	BudgetGSTD          *float64   `json:"budget_gstd,omitempty" db:"budget_gstd"`
	RewardGSTD          *float64   `json:"reward_gstd,omitempty" db:"reward_gstd"`
	DepositID           *string   `json:"deposit_id,omitempty" db:"deposit_id"`
	PaymentMemo         *string   `json:"payment_memo,omitempty" db:"payment_memo"`
	Payload             *string   `json:"payload,omitempty" db:"payload"` // JSON string
	ValidationMethod    string     `json:"validation_method" db:"validation_method"`
	PriorityScore       float64    `json:"priority_score" db:"priority_score"`
	Status              string     `json:"status" db:"status"`
	CreatedAt           time.Time  `json:"created_at" db:"created_at"`
	AssignedAt          *time.Time `json:"assigned_at" db:"assigned_at"`
	CompletedAt         *time.Time `json:"completed_at" db:"completed_at"`
	EscrowAddress       string     `json:"escrow_address" db:"escrow_address"`
	EscrowAmountTon     float64    `json:"escrow_amount_ton" db:"escrow_amount_ton"`
	AssignedDevice      *string    `json:"assigned_device" db:"assigned_device"`
	ResultData          *string    `json:"result_data" db:"result_data"`
	ResultNonce         *string    `json:"result_nonce" db:"result_nonce"`
	ResultProof         *string    `json:"result_proof" db:"result_proof"`
	ExecutionTimeMs     *int       `json:"execution_time_ms" db:"execution_time_ms"`
	ResultSubmittedAt   *time.Time `json:"result_submitted_at" db:"result_submitted_at"`
	PlatformFeeTon      *float64   `json:"platform_fee_ton" db:"platform_fee_ton"`
	ExecutorRewardTon   *float64   `json:"executor_reward_ton" db:"executor_reward_ton"`
	TimeoutAt           *time.Time `json:"timeout_at" db:"timeout_at"`
	EscrowStatus        string     `json:"escrow_status" db:"escrow_status"`
	MinTrustScore       float64    `json:"min_trust_score" db:"min_trust_score"`
	GeoRestriction      []string   `json:"geo_restriction" db:"geo_restriction"`
	IsPrivate           bool       `json:"is_private" db:"is_private"`
	RedundancyFactor    int        `json:"redundancy_factor" db:"redundancy_factor"`
	ConfidenceDepth     int        `json:"confidence_depth" db:"confidence_depth"`
	IsSpotCheck         bool       `json:"is_spot_check" db:"is_spot_check"`
}

type TaskDescriptor struct {
	TaskID          string      `json:"task_id"`
	TaskType        string      `json:"task_type"`
	Operation       string      `json:"operation"`
	Model           string      `json:"model"`
	Input           InputData   `json:"input"`
	Constraints     Constraints `json:"constraints"`
	Reward          Reward      `json:"reward"`
	Validation      string      `json:"validation"`
	MinTrust        float64     `json:"min_trust"`
	AllowedRegions  []string    `json:"allowed_regions"`
	IsPrivate       bool        `json:"is_private"`
}

type InputData struct {
	Source string `json:"source"`
	Hash   string `json:"hash"`
}

type Constraints struct {
	TimeLimitSec int `json:"time_limit_sec"`
	MaxEnergyMwh  int `json:"max_energy_mwh"`
}

type Reward struct {
	AmountTon float64 `json:"amount_ton"`
}



