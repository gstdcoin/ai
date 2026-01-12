package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisPubSubService handles task distribution via Redis Pub/Sub for horizontal scaling
type RedisPubSubService struct {
	client    *redis.Client
	pubsub    *redis.PubSub
	ctx       context.Context
	cancel    context.CancelFunc
	channel   string
	isRunning bool
}

const (
	// TaskPubSubChannel is the Redis channel for task distribution
	TaskPubSubChannel = "gstd_tasks_channel"
)

// NewRedisPubSubService creates a new Redis Pub/Sub service
func NewRedisPubSubService(client *redis.Client) *RedisPubSubService {
	ctx, cancel := context.WithCancel(context.Background())
	return &RedisPubSubService{
		client:  client,
		ctx:     ctx,
		cancel:  cancel,
		channel: TaskPubSubChannel,
	}
}

// TaskMessage represents a task notification message
type TaskMessage struct {
	TaskID      string                 `json:"task_id"`
	TaskType    string                 `json:"task_type"`
	Status      string                 `json:"status"`
	Payload     map[string]interface{} `json:"payload,omitempty"`
	Timestamp   int64                  `json:"timestamp"`
	ServerID    string                 `json:"server_id,omitempty"` // Optional: identify which server published
}

// PublishTask publishes a task to Redis Pub/Sub channel
// This allows multiple API server instances to receive the task
func (s *RedisPubSubService) PublishTask(ctx context.Context, taskID string, taskType string, status string, payload map[string]interface{}) error {
	message := TaskMessage{
		TaskID:    taskID,
		TaskType:  taskType,
		Status:    status,
		Payload:   payload,
		Timestamp: time.Now().Unix(),
	}

	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal task message: %w", err)
	}

	// Publish to Redis channel
	err = s.client.Publish(ctx, s.channel, data).Err()
	if err != nil {
		return fmt.Errorf("failed to publish task to Redis: %w", err)
	}

	log.Printf("✅ Published task %s to Redis channel %s", taskID, s.channel)
	return nil
}

// Subscribe starts listening to Redis Pub/Sub channel
// Returns a channel that receives TaskMessage notifications as interface{}
func (s *RedisPubSubService) Subscribe() (<-chan interface{}, error) {
	if s.isRunning {
		return nil, fmt.Errorf("subscription already running")
	}

	// Create pubsub subscription
	s.pubsub = s.client.Subscribe(s.ctx, s.channel)
	
	// Wait for subscription confirmation
	_, err := s.pubsub.Receive(s.ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to subscribe to Redis channel: %w", err)
	}

	s.isRunning = true
	log.Printf("✅ Subscribed to Redis channel: %s", s.channel)

	// Create message channel (interface{} to avoid circular import)
	msgChan := make(chan interface{}, 100)

	// Start goroutine to receive messages
	go func() {
		defer close(msgChan)
		defer s.pubsub.Close()

		ch := s.pubsub.Channel()
		for {
			select {
			case <-s.ctx.Done():
				log.Printf("Redis Pub/Sub subscription stopped")
				return
			case msg := <-ch:
				if msg == nil {
					continue
				}

				var taskMsg TaskMessage
				if err := json.Unmarshal([]byte(msg.Payload), &taskMsg); err != nil {
					log.Printf("❌ Failed to unmarshal task message: %v", err)
					continue
				}

				// Send message to channel as map for easier handling
				msgMap := map[string]interface{}{
					"task_id":   taskMsg.TaskID,
					"task_type": taskMsg.TaskType,
					"status":    taskMsg.Status,
					"payload":   taskMsg.Payload,
					"timestamp": taskMsg.Timestamp,
				}
				select {
				case msgChan <- msgMap:
				default:
					log.Printf("⚠️  Task message channel full, dropping message for task %s", taskMsg.TaskID)
				}
			}
		}
	}()

	return msgChan, nil
}

// Stop stops the subscription
func (s *RedisPubSubService) Stop() {
	if !s.isRunning {
		return
	}

	s.cancel()
	if s.pubsub != nil {
		s.pubsub.Close()
	}
	s.isRunning = false
	log.Printf("Redis Pub/Sub service stopped")
}

// IsRunning returns whether the subscription is active
func (s *RedisPubSubService) IsRunning() bool {
	return s.isRunning
}
