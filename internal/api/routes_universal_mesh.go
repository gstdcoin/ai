package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SetupUniversalMeshRoutes registers Universal Mesh Protocol endpoints.
// - GET /api/v1/infer: Public inference (any user can send prompt)
// - GET /api/v1/mesh/shares: XAUt share per node
func SetupUniversalMeshRoutes(v1 *gin.RouterGroup, mesh *services.UniversalMeshService, contrib *services.ContributionMonetizationService) {
	if mesh == nil {
		return
	}

	v1.GET("/infer", HandleInfer(mesh))

	if contrib != nil {
		v1.GET("/mesh/shares", HandleMeshShares(contrib))
	}
}
