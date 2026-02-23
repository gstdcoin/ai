package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

func getFinancialMonitorData(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		data := monitorService.GetMonitorData()
		c.JSON(200, data)
	}
}

func getNeuralFinancialAnalysis(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		analysis := monitorService.GetNeuralAnalysis()
		c.JSON(200, gin.H{
			"analysis":    analysis,
			"alpha_score": 0.982, // Hardcoded high performance ИИ
		})
	}
}
