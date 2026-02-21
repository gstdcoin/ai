package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisStreamsService handles task distribution via Redis Streams
type RedisStreamsService struct {
	client *redis.Client
}

func NewRedisStreamsService(client *redis.Client) *RedisStreamsService {
	return &RedisStreamsService{
		client: client,
	}
}

const (
	TaskStreamKey = "tasks:stream"
	TaskGroupName = "task_workers"
)

// PublishTask publishes a task to Redis Stream for distribution
func (s *RedisStreamsService) PublishTask(ctx context.Context, taskID string, taskData map[string]interface{}) error {
	// Convert task data to JSON
	taskJSON, err := json.Marshal(taskData)
	if err != nil {
		return fmt.Errorf("failed to marshal task data: %w", err)
	}

	// Add to stream
	args := &redis.XAddArgs{
		Stream: TaskStreamKey,
		Values: map[string]interface{}{
			"task_id":   taskID,
			"task_data": string(taskJSON),
			"timestamp": time.Now().Unix(),
		},
	}

	_, err = s.client.XAdd(ctx, args).Result()
	if err != nil {
		return fmt.Errorf("failed to publish task to stream: %w", err)
	}

	return nil
}

// CreateConsumerGroup creates a consumer group for task distribution
func (s *RedisStreamsService) CreateConsumerGroup(ctx context.Context, groupName string) error {
	// Create group starting from the beginning (0) or latest ($)
	err := s.client.XGroupCreateMkStream(ctx, TaskStreamKey, groupName, "0").Err()

	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	return nil
}

// ReadTasks reads tasks from stream for a consumer
func (s *RedisStreamsService) ReadTasks(ctx context.Context, consumerName string, count int64) ([]map[string]interface{}, error) {
	// Ensure group exists
	if err := s.CreateConsumerGroup(ctx, TaskGroupName); err != nil {
		return nil, err
	}

	// Read from stream
	streams, err := s.client.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    TaskGroupName,
		Consumer: consumerName,
		Streams:  []string{TaskStreamKey, ">"},
		Count:    count,
		Block:    time.Second * 5, // Block for 5 seconds
	}).Result()

	if err == redis.Nil {
		// No messages
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("failed to read from stream: %w", err)
	}

	var tasks []map[string]interface{}
	for _, stream := range streams {
		for _, message := range stream.Messages {
			taskData := make(map[string]interface{})
			for key, value := range message.Values {
				if key == "task_data" {
					// Unmarshal task data
					var task map[string]interface{}
					if err := json.Unmarshal([]byte(value.(string)), &task); err == nil {
						taskData["task"] = task
					}
				} else {
					taskData[key] = value
				}
			}
			taskData["message_id"] = message.ID
			tasks = append(tasks, taskData)
		}
	}

	return tasks, nil
}

// AcknowledgeTask acknowledges task completion
func (s *RedisStreamsService) AcknowledgeTask(ctx context.Context, messageID string) error {
	return s.client.XAck(ctx, TaskStreamKey, TaskGroupName, messageID).Err()
}

