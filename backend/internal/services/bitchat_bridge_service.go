package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// BitchatBridgeService bridges GSTD Swarm with bitchat mesh for offline task distribution.
// Protocol: BITCHAT_INTEGRATION.md — gstd:task, gstd:result, gstd:status, gstd:recall.
// Sends queued tasks to bitchat; relays results back to API when connectivity returns.
type BitchatBridgeService struct {
	db         *sql.DB
	httpClient *http.Client
	apiBaseURL string
	enabled    bool
}

// GstdTaskMessage is the gstd:task format for bitchat mesh.
type GstdTaskMessage struct {
	V       int                    `json:"v"`
	Type    string                 `json:"type"`
	Ts      int64                  `json:"ts"`
	Payload map[string]interface{} `json:"payload"`
}

// GstdResultMessage is the gstd:result format from offline nodes.
type GstdResultMessage struct {
	V       int    `json:"v"`
	Type    string `json:"type"`
	Ts      int64  `json:"ts"`
	Payload struct {
		TaskID   string `json:"task_id"`
		DeviceID string `json:"device_id"`
		Result   string `json:"result"`
	} `json:"payload"`
}

// NewBitchatBridgeService creates the bridge. Enable with BITCHAT_BRIDGE_ENABLED=1.
func NewBitchatBridgeService(db *sql.DB) *BitchatBridgeService {
	enabled := os.Getenv("BITCHAT_BRIDGE_ENABLED") == "1" || strings.ToLower(os.Getenv("BITCHAT_BRIDGE_ENABLED")) == "true"
	apiBaseURL := os.Getenv("API_PUBLIC_URL")
	if apiBaseURL == "" {
		apiBaseURL = "http://localhost:8080"
	}
	return &BitchatBridgeService{
		db:         db,
		httpClient: &http.Client{Timeout: 15 * time.Second},
		apiBaseURL: strings.TrimSuffix(apiBaseURL, "/"),
		enabled:    enabled,
	}
}

// Start runs the bridge loop: fetch queued tasks, build gstd:task, send to bitchat (placeholder).
func (s *BitchatBridgeService) Start(ctx context.Context) {
	if !s.enabled {
		log.Printf("ℹ️  Bitchat Bridge disabled (set BITCHAT_BRIDGE_ENABLED=1 to enable)")
		return
	}
	log.Printf("📡 Bitchat Bridge started (offline mesh transport)")
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.tick(ctx)
		}
	}
}

func (s *BitchatBridgeService) tick(ctx context.Context) {
	tasks, err := s.fetchQueuedTasks(ctx, 5)
	if err != nil {
		log.Printf("[BitchatBridge] fetch tasks: %v", err)
		return
	}
	for _, t := range tasks {
		msg := s.buildGstdTask(t)
		if msg == nil {
			continue
		}
		// FUTURE: integrate with bitchat mesh (bitchat-python SDK or relay). Set BITCHAT_BRIDGE_ENABLED=1
		if err := s.sendToBitchat(ctx, msg); err != nil {
			log.Printf("[BitchatBridge] send: %v", err)
		}
	}
}

func (s *BitchatBridgeService) fetchQueuedTasks(ctx context.Context, limit int) ([]taskRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT task_id, task_type, labor_compensation_gstd, payload
		FROM tasks
		WHERE status IN ('queued', 'pending')
		ORDER BY created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []taskRow
	for rows.Next() {
		var r taskRow
		var payload sql.NullString
		if err := rows.Scan(&r.TaskID, &r.TaskType, &r.RewardGSTD, &payload); err != nil {
			continue
		}
		if payload.Valid {
			r.Payload = payload.String
		}
		out = append(out, r)
	}
	return out, nil
}

type taskRow struct {
	TaskID     string
	TaskType   string
	RewardGSTD float64
	Payload    string
}

func (s *BitchatBridgeService) buildGstdTask(t taskRow) *GstdTaskMessage {
	payload := make(map[string]interface{})
	payload["task_id"] = t.TaskID
	payload["task_type"] = t.TaskType
	payload["reward_gstd"] = t.RewardGSTD
	if t.Payload != "" {
		var p map[string]interface{}
		if json.Unmarshal([]byte(t.Payload), &p) == nil {
			payload["payload"] = p
		} else {
			payload["payload"] = t.Payload
		}
	}
	return &GstdTaskMessage{
		V:       1,
		Type:    "gstd:task",
		Ts:      time.Now().Unix(),
		Payload: payload,
	}
}

// sendToBitchat broadcasts the message. Placeholder: logs until bitchat API/SDK integration.
func (s *BitchatBridgeService) sendToBitchat(ctx context.Context, msg *GstdTaskMessage) error {
	raw, _ := json.Marshal(msg)
	// FUTURE: replace with bitchat-python SDK or permissionlesstech/bitchat relay
	log.Printf("[BitchatBridge] would broadcast gstd:task %s: %s", msg.Payload["task_id"], string(raw))
	return nil
}

// IngestResult processes gstd:result from bitchat and submits to API.
// Call this when bridge receives a result from the mesh.
func (s *BitchatBridgeService) IngestResult(ctx context.Context, raw []byte) error {
	var m GstdResultMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return err
	}
	if m.Type != "gstd:result" || m.Payload.TaskID == "" || m.Payload.DeviceID == "" {
		return nil // ignore invalid
	}
	// FUTURE: POST /device/tasks/:id/result with bridge auth when bitchat SDK integrated
	log.Printf("[BitchatBridge] would submit result task=%s device=%s", m.Payload.TaskID, m.Payload.DeviceID)
	return nil
}
