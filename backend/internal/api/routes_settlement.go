package api

import (
	"database/sql"
	"net/http"

	"distributed-computing-platform/internal/services"
	"github.com/gin-gonic/gin"
)

func SetupSettlementRoutes(v1 *gin.RouterGroup, db *sql.DB) {
	router := services.NewSettlementRouter(db)
	bridge := v1.Group("/bridge/settlement")

	bridge.POST("/route", func(c *gin.Context) {
		var req services.RouteRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid settlement request"})
			return
		}

		res, err := router.ExecuteRouting(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, res)
	})
}
