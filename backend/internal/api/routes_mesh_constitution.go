package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// SetupMeshConstitutionRoutes registers Decentralized Governance endpoints
func SetupMeshConstitutionRoutes(v1 *gin.RouterGroup, constitution *services.MeshConstitutionService) {
	if constitution == nil {
		return
	}
	v1.GET("/mesh/constitution", func(c *gin.Context) {
		report, err := constitution.GetLatestReport(c.Request.Context())
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		if report == nil {
			c.JSON(200, gin.H{"message": "No constitution report yet", "report": nil})
			return
		}
		c.JSON(200, gin.H{"report": report})
	})
}
