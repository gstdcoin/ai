package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
)

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTED AI RENDER ENGINE (3D / Video / Generative Art)
//
// Extends the Sovereign DePIN network beyond LLM Inference to
// heavy GPU-bound rendering tasks (Blender, SVD, Sora-like models).
// ═══════════════════════════════════════════════════════════════

type RenderTask struct {
	TaskID         string    `json:"task_id"`
	Requester      string    `json:"requester_wallet"`
	AssignedNode   string    `json:"assigned_node,omitempty"`
	TaskType       string    `json:"task_type"` // e.g., "blender_cycles", "stable_video_diffusion"
	Status         string    `json:"status"`    // pending, rendering, completed, failed
	CostGSTD       float64   `json:"cost_gstd"`
	ProgressTokens int       `json:"progress"`
	CreatedAt      time.Time `json:"created_at"`
}

type RenderService struct {
	db *sql.DB
}

func NewRenderService(db *sql.DB) *RenderService {
	return &RenderService{db: db}
}

// SubmitRenderJob allows users to lease network GPUs for rendering workloads
func (s *RenderService) SubmitRenderJob(ctx context.Context, wallet, taskType string, maxGSTD float64) (*RenderTask, error) {
	if maxGSTD <= 0 {
		return nil, fmt.Errorf("budget must be greater than zero")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// 1. Verify balances
	var balance float64
	err = tx.QueryRowContext(ctx, `SELECT COALESCE(gstd_balance, 0) FROM users WHERE wallet_address = $1`, wallet).Scan(&balance)
	if err != nil || balance < maxGSTD {
		return nil, fmt.Errorf("insufficient GSTD balance to fund render job")
	}

	// 2. Lock Budget
	_, err = tx.ExecContext(ctx, `UPDATE users SET gstd_balance = gstd_balance - $1 WHERE wallet_address = $2`, maxGSTD, wallet)
	if err != nil {
		return nil, err
	}

	// 3. Create generic compute task targeting rendering capabilities
	taskID := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO tasks (task_id, task_type, payload, status, priority_score, created_at, requester_address)
		VALUES ($1, $2, '{"budget": '||$3||'}', 'pending', 100, NOW(), $4)
	`, taskID, "render_"+taskType, maxGSTD, wallet)

	if err != nil {
		return nil, err
	}

	tx.Commit()

	log.Printf("🎬 [RenderEngine] New %s job submitted by %s. Budget: %.2f GSTD", taskType, wallet[:8], maxGSTD)

	return &RenderTask{
		TaskID:    taskID,
		Requester: wallet,
		TaskType:  taskType,
		Status:    "pending",
		CostGSTD:  maxGSTD,
		CreatedAt: time.Now(),
	}, nil
}

// GetJobStatus polls the render pipeline state
func (s *RenderService) GetJobStatus(ctx context.Context, taskID string) (*RenderTask, error) {
	var rt RenderTask
	err := s.db.QueryRowContext(ctx, `
		SELECT task_id, task_type, status, requester_address, created_at 
		FROM tasks WHERE task_id = $1
	`, taskID).Scan(&rt.TaskID, &rt.TaskType, &rt.Status, &rt.Requester, &rt.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &rt, nil
}
