package api

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"distributed-computing-platform/internal/services/leviathan"

	"github.com/gin-gonic/gin"
)

func escapeSSE(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r", " "), "\n", " ")
}

// SetupLeviathanLiveStream registers the SSE and WebSocket endpoints for the Live Stream protocol.
// Leviathan Bridge: WebSocket for instant notifications to Telegram bot / TMA.
func SetupLeviathanLiveStream(router *gin.Engine) {
	router.GET("/api/v1/leviathan/stream", handleLeviathanSSE)
	router.GET("/api/v1/leviathan/ws", HandleLeviathanWebSocket)
}

func handleLeviathanSSE(c *gin.Context) {
	// SSE Diagnostic: strict Content-Type, CORS for frontend
	c.Header("Content-Type", "text/event-stream; charset=utf-8")
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	origin := c.GetHeader("Origin")
	allowedOrigins := map[string]bool{
		"https://app.gstdtoken.com":  true,
		"https://gstdtoken.com":      true,
		"https://www.gstdtoken.com":  true,
	}
	if allowedOrigins[origin] {
		c.Header("Access-Control-Allow-Origin", origin)
	} else {
		c.Header("Access-Control-Allow-Origin", "https://app.gstdtoken.com")
	}
	c.Header("Access-Control-Expose-Headers", "Content-Type")
	c.Status(http.StatusOK)
	c.Writer.Flush()

	// Initial burst: send recent events; Memory Integrity: if empty, inject bootstrap
	recent := leviathan.LiveStreamRecent()
	if len(recent) == 0 {
		leviathan.EmitBootstrapEvent()
		recent = leviathan.LiveStreamRecent()
	}
	for _, e := range recent {
		fmt.Fprintf(c.Writer, "data: %s\n\n", escapeSSE(e.Msg))
		c.Writer.Flush()
	}

	// Subscribe to new events
	ch, unsub := leviathan.LiveStreamSubscribe()
	defer unsub()

	// Fix: keep-alive 10s (was 15) — reduces Broken Pipe / Connection Closed
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-ch:
			if !ok {
				return
			}
			fmt.Fprintf(c.Writer, "data: %s\n\n", escapeSSE(msg))
			c.Writer.Flush()
		case <-ticker.C:
			// Keep-alive comment for SSE
			fmt.Fprintf(c.Writer, ": keepalive\n\n")
			c.Writer.Flush()
		case <-c.Request.Context().Done():
			return
		}
	}
}
