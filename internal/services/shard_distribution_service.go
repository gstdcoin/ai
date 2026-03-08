package services

import (
	"context"
	"database/sql"
)

// ShardDistributionService ensures critical shards are evenly distributed across continents
// to prevent "geographic data blackouts"
type ShardDistributionService struct {
	db *sql.DB
}

// ContinentCounts returns shard replica counts per continent for a model
func (s *ShardDistributionService) ContinentCounts(ctx context.Context, modelID string) (map[string]int, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(continent, 'XX') as c, COUNT(*) FROM model_shard_replicas
		WHERE model_id = $1 AND is_available GROUP BY continent
	`, modelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int)
	for rows.Next() {
		var c string
		var n int
		if err := rows.Scan(&c, &n); err != nil {
			continue
		}
		m[c] = n
	}
	return m, nil
}

// NeedsShardInContinent returns true if continent has fewer replicas than target
func (s *ShardDistributionService) NeedsShardInContinent(ctx context.Context, modelID string, shardIndex int, continent string, targetPerContinent int) bool {
	var count int
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM model_shard_replicas
		WHERE model_id = $1 AND shard_index = $2 AND continent = $3 AND is_available
	`, modelID, shardIndex, continent).Scan(&count)
	if err != nil {
		return true
	}
	return count < targetPerContinent
}

// GetUnderrepresentedContinents returns continents that need more shards for a model
func (s *ShardDistributionService) GetUnderrepresentedContinents(ctx context.Context, modelID string, targetPerContinent int) ([]string, error) {
	// Standard continents to check
	continents := []string{"NA", "EU", "AS", "SA", "AF", "OC"}
	var need []string
	for _, c := range continents {
		var count int
		s.db.QueryRowContext(ctx, `
			SELECT COUNT(*) FROM model_shard_replicas
			WHERE model_id = $1 AND continent = $2 AND is_available
		`, modelID, c).Scan(&count)
		if count < targetPerContinent {
			need = append(need, c)
		}
	}
	return need, nil
}

// NewShardDistributionService creates the service
func NewShardDistributionService(db *sql.DB) *ShardDistributionService {
	return &ShardDistributionService{db: db}
}
