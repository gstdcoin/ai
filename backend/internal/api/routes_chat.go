package api

import (
	"database/sql"
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// RegisterChatRoutes encapsulates all chat/AI endpoints.
func RegisterChatRoutes(
	v1 *gin.RouterGroup,
	gatewayHandler *GatewayHandler,
	omegaHandler *OmegaGatewayHandler,
	dbConn *sql.DB,
	burnService *services.BurnService,
) {
	// ═══ OMEGA GATEWAY INTEGRATION ═══
	// OpenAI-compatible chat: /api/v1/chat/* (GSTD pricing, balance checks)
	v1.POST("/chat/completions", omegaHandler.HandleChatCompletions)
	v1.POST("/chat/smartmix", omegaHandler.HandleChatCompletions) // Alias for frontend SmartMix tiers
	v1.GET("/chat/ultra-status", gatewayHandler.GetUltraStatus)   // Optional auth: X-GSTD-Target-Wallet
	v1.GET("/models", omegaHandler.HandleListModels)

	// Cocoon Confidential Compute — TEE-protected inference on TON blockchain
	// Docs: https://cocoon.org/developers
	v1.GET("/chat/cocoon-status", gatewayHandler.GetCocoonStatus)
	v1.GET("/chat/hybrid-status", gatewayHandler.GetHybridStatus)
	v1.GET("/chat/sovereignty-index", gatewayHandler.GetSovereigntyIndex)

	// ═══ CHAT DEDUCTION — Called by frontend for paid Collective Intelligence tiers ═══
	v1.POST("/chat/deduct", chatDeductHandler(dbConn, burnService))
}
