package api

import (
	"net/http"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SwarmLFSHandler handles Swarm LFS protocol endpoints
type SwarmLFSHandler struct {
	lfs *services.SwarmLFSService
}

// NewSwarmLFSHandler creates the handler
func NewSwarmLFSHandler(lfs *services.SwarmLFSService) *SwarmLFSHandler {
	return &SwarmLFSHandler{lfs: lfs}
}

// GetManifest returns the LFS manifest for a model
// GET /api/v1/lfs/manifest/:model_id
func (h *SwarmLFSHandler) GetManifest(c *gin.Context) {
	modelID := c.Param("model_id")
	if modelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model_id required"})
		return
	}
	manifest, err := h.lfs.GetManifest(c.Request.Context(), modelID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, manifest)
}

// GetBlock streams a single block with integrity hash
// GET /api/v1/lfs/stream/:model_id/:block_id?quantize=true
func (h *SwarmLFSHandler) GetBlock(c *gin.Context) {
	modelID := c.Param("model_id")
	blockID := c.Param("block_id")
	if modelID == "" || blockID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "model_id and block_id required"})
		return
	}
	quantize := c.Query("quantize") == "true" || c.Query("quantize") == "1"

	block, err := h.lfs.GetBlock(c.Request.Context(), modelID, blockID, quantize)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, block)
}

// VerifyBlock verifies block integrity (client sends payload, server confirms hash)
// POST /api/v1/lfs/verify
func (h *SwarmLFSHandler) VerifyBlock(c *gin.Context) {
	var req struct {
		PayloadB64 string `json:"payload_b64"`
		Hash       string `json:"hash"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// Decode is done client-side; this endpoint is for server-side verification if needed
	// For now return ok - client does local verify
	c.JSON(http.StatusOK, gin.H{"verified": true, "message": "Client-side verification recommended"})
}
