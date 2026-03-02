package api

import (
	"context"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// RealWorldMarketData — live prices and metrics from DEX/CoinGecko
type RealWorldMarketData struct {
	GSTDPriceUSD    float64 `json:"gstd_price_usd"`
	TONPriceUSD     float64 `json:"ton_price_usd"`
	XAUtPriceUSD    float64 `json:"xaut_price_usd"`
	MarketCapUSD    float64 `json:"market_cap_usd"` // circulating * price
	Volume24hUSD    float64 `json:"volume_24h_usd"` // from DB + DEX
	CirculatingGSTD float64 `json:"circulating_gstd"`
}

// UnifiedOrganismResponse combines organism, monitor, monetization, ecosystem, neural, and real market data
type UnifiedOrganismResponse struct {
	Organism     services.EquilibriumState             `json:"organism"`
	Flows        services.GlobalFinancialFlowsSnapshot `json:"flows"`
	Monetization services.MonetizationMetrics          `json:"monetization"`
	Ecosystem    services.EcosystemStats               `json:"ecosystem"`
	Neural       string                                `json:"neural"`
	Market       RealWorldMarketData                   `json:"market"`
}

func getUnifiedOrganism(
	organism *services.SovereignOrganismService,
	monitor *services.FinancialMonitorService,
	monetization *services.MonetizationMetricsService,
	hub *services.OrganismHubService,
	poolMonitor *services.PoolMonitorService,
) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx := c.Request.Context()
		var organismState services.EquilibriumState
		var flows services.GlobalFinancialFlowsSnapshot
		var neural string
		if organism != nil {
			organismState = organism.GetState()
		}
		if monitor != nil {
			flows = monitor.GetMonitorData()
			neural = monitor.GetNeuralAnalysis()
		}
		var monet services.MonetizationMetrics
		if monetization != nil {
			monet = monetization.GetMetrics(ctx)
		}
		var ecosystem services.EcosystemStats
		if hub != nil {
			ecosystem = hub.GetEcosystemStats(ctx)
		}
		market := getRealWorldMarket(ctx, poolMonitor, monitor)
		c.JSON(200, UnifiedOrganismResponse{
			Organism:     organismState,
			Flows:        flows,
			Monetization: monet,
			Ecosystem:    ecosystem,
			Neural:       neural,
			Market:       market,
		})
	}
}

func getRealWorldMarket(ctx context.Context, pool *services.PoolMonitorService, monitor *services.FinancialMonitorService) RealWorldMarketData {
	m := RealWorldMarketData{}
	if pool == nil {
		return m
	}
	m.TONPriceUSD = pool.GetTONPriceUSD()
	m.XAUtPriceUSD = pool.GetXAUtPriceUSD()
	gstdPrice, err := pool.GetGSTDPriceUSD(ctx)
	if err == nil && gstdPrice > 0 {
		m.GSTDPriceUSD = gstdPrice
	}
	// Circulating supply estimate from DB (total minted - burned)
	if monitor != nil {
		circ, vol := monitor.GetCirculatingAndVolume24h(ctx)
		m.CirculatingGSTD = circ
		m.Volume24hUSD = vol * m.GSTDPriceUSD
		if m.GSTDPriceUSD > 0 && circ > 0 {
			m.MarketCapUSD = circ * m.GSTDPriceUSD
		}
	}
	return m
}

func getFinancialMonitorData(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if monitorService == nil {
			c.JSON(200, services.GlobalFinancialFlowsSnapshot{})
			return
		}
		data := monitorService.GetMonitorData()
		c.JSON(200, data)
	}
}

func getNeuralFinancialAnalysis(monitorService *services.FinancialMonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if monitorService == nil {
			c.JSON(200, gin.H{"analysis": "NEURAL_STABLE", "alpha_score": 0.5})
			return
		}
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
		if organismService == nil {
			c.JSON(200, services.EquilibriumState{})
			return
		}
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
