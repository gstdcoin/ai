package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"distributed-computing-platform/internal/services/leviathan"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var leviathanUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		allowed := []string{"https://app.gstdtoken.com", "http://localhost:3000", "https://web.telegram.org", "https://t.me"}
		for _, a := range allowed {
			if origin == a || strings.HasPrefix(origin, a) {
				return true
			}
		}
		return origin == ""
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
}

// LeviathanWSHub manages WebSocket connections for Leviathan live stream (Leviathan Bridge)
type LeviathanWSHub struct {
	clients    map[*leviathanWSClient]bool
	register   chan *leviathanWSClient
	unregister chan *leviathanWSClient
	broadcast  chan string
	mu         sync.RWMutex
}

type leviathanWSClient struct {
	hub  *LeviathanWSHub
	conn *websocket.Conn
	send chan []byte
}

var leviathanHub *LeviathanWSHub
var leviathanHubOnce sync.Once

func getLeviathanHub() *LeviathanWSHub {
	leviathanHubOnce.Do(func() {
		leviathanHub = &LeviathanWSHub{
			clients:    make(map[*leviathanWSClient]bool),
			register:   make(chan *leviathanWSClient),
			unregister: make(chan *leviathanWSClient),
			broadcast:  make(chan string, 128),
		}
		go leviathanHub.run()
		go leviathanHub.leviathanSubscribe()
	})
	return leviathanHub
}

func (h *LeviathanWSHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			n := len(h.clients)
			h.mu.Unlock()
			log.Printf("[Leviathan Bridge] Client connected. Total: %d", n)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case msg := <-h.broadcast:
			payload, _ := json.Marshal(map[string]interface{}{
				"type":      "leviathan",
				"message":   msg,
				"timestamp": time.Now().Unix(),
			})
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- payload:
				default:
					// Client buffer full, skip
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *LeviathanWSHub) leviathanSubscribe() {
	ch, unsub := leviathan.LiveStreamSubscribe()
	defer unsub()
	for msg := range ch {
		select {
		case h.broadcast <- msg:
		default:
			// Buffer full, drop
		}
	}
}

func (c *leviathanWSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// HandleLeviathanWebSocket serves Leviathan live stream via WebSocket (Leviathan Bridge)
func HandleLeviathanWebSocket(c *gin.Context) {
	conn, err := leviathanUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	hub := getLeviathanHub()
	client := &leviathanWSClient{hub: hub, conn: conn, send: make(chan []byte, 64)}
	hub.register <- client
	defer func() { hub.unregister <- client }()

	go client.writePump()

	// Send initial burst
	recent := leviathan.LiveStreamRecent()
	for _, e := range recent {
		payload, _ := json.Marshal(map[string]interface{}{
			"type":      "leviathan",
			"message":   e.Msg,
			"timestamp": e.At.Unix(),
		})
		conn.WriteMessage(websocket.TextMessage, payload)
	}

	// Read loop (discard client messages, just keep connection alive)
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
