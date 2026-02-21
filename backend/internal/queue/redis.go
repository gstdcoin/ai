package queue

import (
	"context"
	"distributed-computing-platform/internal/config"
	"github.com/redis/go-redis/v9"
)

func NewRedisClient(cfg config.RedisConfig) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Host + ":" + cfg.Port,
		Password: cfg.Password,
		DB:       cfg.DB,
		PoolSize: 100, // Connection pool for scalability
	})

	ctx := context.Background()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	return client, nil
}

func EnqueueTask(client *redis.Client, ctx context.Context, taskID string, priority float64) error {
	return client.ZAdd(ctx, "task_queue", redis.Z{
		Score:  priority,
		Member: taskID,
	}).Err()
}

func DequeueTask(client *redis.Client, ctx context.Context) (string, error) {
	result := client.ZPopMax(ctx, "task_queue", 1)
	if result.Err() != nil {
		return "", result.Err()
	}

	vals := result.Val()
	if len(vals) == 0 {
		return "", nil
	}

	return vals[0].Member.(string), nil
}

