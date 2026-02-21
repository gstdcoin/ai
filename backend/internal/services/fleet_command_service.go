package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// FleetCommandService - Symbiotic Management: Group commands for all nodes of a wallet
// Commands are stored in Redis and delivered via WebSocket heartbeat response
type FleetCommandService struct {
	redis *redis.Client
	ttl   time.Duration
}

// FleetCommand actions
const (
	FleetActionStandby = "standby"
	FleetActionResume  = "resume"
	FleetActionModel   = "model"
	FleetActionUpdate  = "update"
	FleetActionClean   = "clean"
)

type FleetCommand struct {
	Action  string      `json:"action"`
	Payload interface{} `json:"payload,omitempty"`
}

func NewFleetCommandService(rdb *redis.Client) *FleetCommandService {
	if rdb == nil {
		return &FleetCommandService{ttl: 60 * time.Second}
	}
	return &FleetCommandService{redis: rdb, ttl: 60 * time.Second}
}

// SetCommand stores a fleet command for the given wallet. Next heartbeat will deliver it.
func (s *FleetCommandService) SetCommand(ctx context.Context, wallet string, cmd FleetCommand) error {
	if s.redis == nil {
		return nil
	}
	key := fmt.Sprintf("fleet:cmd:%s", wallet)
	data, _ := json.Marshal(cmd)
	return s.redis.Set(ctx, key, data, s.ttl).Err()
}

// GetAndClearCommand retrieves and deletes the pending fleet command for a wallet.
// Returns nil if no command.
func (s *FleetCommandService) GetAndClearCommand(ctx context.Context, wallet string) (*FleetCommand, error) {
	if s.redis == nil {
		return nil, nil
	}
	key := fmt.Sprintf("fleet:cmd:%s", wallet)
	data, err := s.redis.GetDel(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var cmd FleetCommand
	if err := json.Unmarshal([]byte(data), &cmd); err != nil {
		return nil, err
	}
	return &cmd, nil
}
