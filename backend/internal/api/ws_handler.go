package api

import (
	"context"
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		// Origin whitelist for production security
		allowedOrigins := []string{"https://app.gstdtoken.com", "http://localhost:3000", "ws://localhost:3000", "wss://app.gstdtoken.com"}
		if origin != "" {
			log.Printf("WebSocket connection from origin: %s", origin)
			allowed := false
			for _, allowedOrigin := range allowedOrigins {
				if origin == allowedOrigin || strings.HasPrefix(origin, allowedOrigin) {
					allowed = true
					break
				}
			}
			return allowed
		}
		// Allow connections without Origin header (some clients don't send it)
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// WSClient represents a WebSocket client (device/worker)
type WSClient struct {
	conn             *websocket.Conn
	deviceID         string
	trustScore       float64
	send             chan []byte
	hub              *WSHub
	assignmentService *services.AssignmentService
}

// WSHub manages WebSocket connections
type WSHub struct {
	clients       map[*WSClient]bool
	broadcast     chan *TaskNotification
	register      chan *WSClient
	unregister    chan *WSClient
	mu            sync.RWMutex
	redisPubSub   interface{} // *services.RedisPubSubService (avoid circular import)
	redisMsgChan  <-chan interface{} // Channel for Redis Pub/Sub messages (TaskMessage) - receive-only
}

// TaskNotification represents a task available for execution
type TaskNotification struct {
	Task      *models.Task `json:"task"`
	Timestamp time.Time    `json:"timestamp"`
}

// NewWSHub creates a new WebSocket hub
func NewWSHub() *WSHub {
	return &WSHub{
		clients:    make(map[*WSClient]bool),
		broadcast:  make(chan *TaskNotification, 256),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
	}
}

// SetRedisPubSub sets the Redis Pub/Sub service and starts subscription
func (h *WSHub) SetRedisPubSub(redisPubSub interface{}) {
	h.redisPubSub = redisPubSub
	
	// Use type assertion to call Subscribe method
	// We need to check if it's *services.RedisPubSubService
	if pubSub, ok := redisPubSub.(*services.RedisPubSubService); ok {
		msgChan, err := pubSub.Subscribe()
		if err != nil {
			log.Printf("❌ Failed to subscribe to Redis Pub/Sub: %v", err)
			return
		}
		
		h.redisMsgChan = msgChan
		log.Printf("✅ WSHub subscribed to Redis Pub/Sub channel: gstd_tasks_channel")
		
		// Start goroutine to receive messages from Redis
		go h.handleRedisMessages()
	} else {
		log.Printf("⚠️  Redis Pub/Sub service type assertion failed")
	}
}

// handleRedisMessages processes messages from Redis Pub/Sub
func (h *WSHub) handleRedisMessages() {
	if h.redisMsgChan == nil {
		return
	}
	
	for msgInterface := range h.redisMsgChan {
		if msgInterface == nil {
			continue
		}
		
		// Type assert to get TaskMessage fields
		// We need to use reflection or type assertion
		msgMap, ok := msgInterface.(map[string]interface{})
		if !ok {
			// Try to unmarshal from JSON if it's a byte slice
			continue
		}
		
		taskID, _ := msgMap["task_id"].(string)
		taskType, _ := msgMap["task_type"].(string)
		status, _ := msgMap["status"].(string)
		payload, _ := msgMap["payload"].(map[string]interface{})
		
		// Only process tasks with 'pending' or 'queued' status
		if status != "pending" && status != "queued" {
			continue
		}
		
		log.Printf("📥 Received task from Redis Pub/Sub: %s (status: %s)", taskID, status)
		
		// Convert to models.Task
		task := &models.Task{
			TaskID:              taskID,
			TaskType:            taskType,
			Status:              status,
			RequesterAddress:    getStringFromPayload(payload, "requester_address"),
			LaborCompensationGSTD: getFloatFromPayload(payload, "labor_compensation"),
			PriorityScore:        getFloatFromPayload(payload, "gravity_score"),
		}
		
		// Extract MinTrustScore if available
		if minTrust, ok := payload["min_trust_score"].(float64); ok {
			task.MinTrustScore = minTrust
		}
		
		// Broadcast to local WebSocket clients
		h.BroadcastTask(task)
	}
}

// Helper functions to extract values from payload
func getStringFromPayload(payload map[string]interface{}, key string) string {
	if val, ok := payload[key].(string); ok {
		return val
	}
	return ""
}

func getFloatFromPayload(payload map[string]interface{}, key string) float64 {
	if val, ok := payload[key].(float64); ok {
		return val
	}
	return 0.0
}

// Run starts the hub's main loop
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client registered: %s (trust: %.2f)", client.deviceID, client.trustScore)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client unregistered: %s", client.deviceID)

		case notification := <-h.broadcast:
			h.mu.RLock()
			// Filter clients by trust score
			for client := range h.clients {
				if client.trustScore >= notification.Task.MinTrustScore {
					select {
					case client.send <- h.marshalNotification(notification):
					default:
						close(client.send)
						delete(h.clients, client)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastTask notifies all eligible clients about a new task
func (h *WSHub) BroadcastTask(task *models.Task) {
	notification := &TaskNotification{
		Task:      task,
		Timestamp: time.Now(),
	}
	select {
	case h.broadcast <- notification:
	default:
		log.Printf("Hub broadcast channel full, dropping notification for task %s", task.TaskID)
	}
}

func (h *WSHub) marshalNotification(n *TaskNotification) []byte {
	data, err := json.Marshal(n)
	if err != nil {
		log.Printf("Failed to marshal notification: %v", err)
		return nil
	}
	return data
}

// readPump handles messages from the client with improved error handling
func (c *WSClient) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	// Set read deadline
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle message
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Failed to parse WebSocket message: %v", err)
			continue
		}

		// Handle different message types
		switch msg["type"] {
				case "claim_task":
			if taskID, ok := msg["task_id"].(string); ok {
					// Device wants to claim a task
						ctx := context.Background()
						err := c.assignmentService.ClaimTask(ctx, taskID, c.deviceID)
						if err != nil {
							errorMsg := fmt.Sprintf(`{"type":"error","message":"%s"}`, err.Error())
							select {
							case c.send <- []byte(errorMsg):
							default:
								// Channel full, close connection
								close(c.send)
							}
						} else {
							successMsg := fmt.Sprintf(`{"type":"task_claimed","task_id":"%s"}`, taskID)
							select {
							case c.send <- []byte(successMsg):
							default:
								// Channel full, close connection
								close(c.send)
							}
						}
					}
				case "heartbeat":
					// Respond to heartbeat
			select {
			case c.send <- []byte(`{"type":"heartbeat_ack"}`):
			default:
				// Channel full, skip heartbeat response
			}
		default:
			log.Printf("Unknown message type: %v", msg["type"])
		}
	}
}

// writePump handles messages to the client with improved error handling
func (c *WSClient) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// HandleWebSocket handles WebSocket connections
func HandleWebSocket(hub *WSHub, deviceService *services.DeviceService, assignmentService *services.AssignmentService) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		deviceID := c.Query("device_id")
		if deviceID == "" {
			conn.Close()
			return
		}

		// Get device trust score
		var trustScore float64
		ctx := context.Background()
		err = deviceService.GetDeviceTrust(ctx, deviceID, &trustScore)
		if err != nil {
			// Default trust for new devices
			trustScore = 0.1
		}

		client := &WSClient{
			conn:             conn,
			deviceID:         deviceID,
			trustScore:       trustScore,
			send:             make(chan []byte, 256),
			hub:              hub,
			assignmentService: assignmentService,
		}

		client.hub.register <- client

		// Start goroutines
		go client.writePump()
		go client.readPump()
	}
}

