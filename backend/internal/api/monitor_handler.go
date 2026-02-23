package api

import (
	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// UnifiedOrganismResponse combines organism, monitor, monetization, ecosystem, and neural in one response
type UnifiedOrganismResponse struct {
	Organism     services.EquilibriumState            `json:"organism"`
	Flows        services.GlobalFinancialFlowsSnapshot `json:"flows"`
	Monetization services.MonetizationMetrics        `json:"monetization"`
	Ecosystem    services.EcosystemStats             `json:"ecosystem"`
	Neural       string                              `json:"neural"`
}

func getUnifiedOrganism(
	organism *services.SovereignOrganismService,
	monitor *services.FinancialMonitorService,
	monetization *services.MonetizationMetricsService,
	hub *services.OrganismHubService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		organismState := organism.GetState()
		flows := monitor.GetMonitorData()
		var monet services.MonetizationMetrics
		if monetization != nil {
			monet = monetization.GetMetrics(ctx)
		}
		var ecosystem services.EcosystemStats
		if hub != nil {
			ecosystem = hub.GetEcosystemStats(ctx)
		}
		neural := monitor.GetNeuralAnalysis()
		c.JSON(200, UnifiedOrganismResponse{
			Organism:     organismState,
			Flows:        flows,
			Monetization: monet,
			Ecosystem:    ecosystem,
			Neural:       neural,
		})
	}
}

func getFinancialMonitorData(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		data := monitorService.GetMonitorData()
		c.JSON(200, data)
	}
}

func getNeuralFinancialAnalysis(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		data := monitorService.GetMonitorData()
		analysis := monitorService.GetNeuralAnalysis()
		c.JSON(200, gin.H{
			"analysis":    analysis,
			"alpha_score": data.AIAlphaScore,
		})
	}
}

func getOrganismState(organismService *services.SovereignOrganismService) gin.HandlerFunc {
	return func(c *gin.Context) {
		state := organismService.GetState()
		c.JSON(200, state)
	}
}

func getMonetizationMetrics(monetizationService *services.MonetizationMetricsService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if monetizationService == nil {
			c.JSON(200, services.MonetizationMetrics{})
			return
		}
		metrics := monetizationService.GetMetrics(c.Request.Context())
		c.JSON(200, metrics)
	}
}
