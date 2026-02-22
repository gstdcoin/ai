package api

import (
	"github.com/gin-gonic/gin"
)

// OmegaGatewayHandler wraps GatewayHandler for /v1/chat/completions and /v1/models.
// Omega keys (gstd_sk_*) are validated by OmegaAuthMiddleware.
type OmegaGatewayHandler struct {
	gateway   *GatewayHandler
	omegaKeys APIKeyValidator // API key service for Omega auth
}

// NewOmegaGatewayHandler creates the Omega gateway handler.
func NewOmegaGatewayHandler(gateway *GatewayHandler, apiKeyService APIKeyValidator) *OmegaGatewayHandler {
	return &OmegaGatewayHandler{gateway: gateway, omegaKeys: apiKeyService}
}

// HandleChatCompletions delegates to GatewayHandler.
func (h *OmegaGatewayHandler) HandleChatCompletions(c *gin.Context) {
	if h.gateway != nil {
		h.gateway.HandleChatCompletions(c)
	}
}

// HandleListModels delegates to GatewayHandler.ListModels.
func (h *OmegaGatewayHandler) HandleListModels(c *gin.Context) {
	if h.gateway != nil {
		h.gateway.ListModels(c)
	}
}
