package services

import (
	"context"
	"database/sql"
)

// EntropyService implements Error-as-a-Resource model
type EntropyService struct {
	db *sql.DB
}

func NewEntropyService(db *sql.DB) *EntropyService {
	return &EntropyService{db: db}
}

// RecordExecution records a result and updates entropy if there's a collision
func (s *EntropyService) RecordExecution(ctx context.Context, operation string, collision bool) error {
	collisionInc := 0
	if collision {
		collisionInc = 1
	}

	_, err := s.db.ExecContext(ctx, `
		INSERT INTO operation_entropy (operation_id, total_executions, collision_count, last_updated)
		VALUES ($1, 1, $2, NOW())
		ON CONFLICT (operation_id) DO UPDATE SET
			total_executions = operation_entropy.total_executions + 1,
			collision_count = operation_entropy.collision_count + $2,
			entropy_score = CAST(operation_entropy.collision_count + $2 AS DECIMAL) / NULLIF(operation_entropy.total_executions + 1, 0),
			last_updated = NOW()
	`, operation, collisionInc)
	
	return err
}

func (s *EntropyService) GetEntropy(ctx context.Context, operation string) (float64, error) {
	var entropy float64
	err := s.db.QueryRowContext(ctx, "SELECT entropy_score FROM operation_entropy WHERE operation_id = $1", operation).Scan(&entropy)
	if err == sql.ErrNoRows {
		return 0.1, nil // Default for new operations
	}
	return entropy, err
}

