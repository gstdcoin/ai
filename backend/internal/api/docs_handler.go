package api

import (
	"github.com/gin-gonic/gin"
	httpSwagger "github.com/swaggo/http-swagger"
)

// DocsHandler handles API documentation
type DocsHandler struct{}

func NewDocsHandler() *DocsHandler {
	return &DocsHandler{}
}

// SetupSwagger configures Swagger documentation endpoint
func (h *DocsHandler) SetupSwagger(router *gin.Engine) {
	// Swagger UI endpoint
	router.GET("/api/v1/swagger/*any", gin.WrapH(httpSwagger.Handler(
		httpSwagger.URL("/api/v1/swagger/doc.json"), // The url pointing to API definition
		httpSwagger.DeepLinking(true),
		httpSwagger.DocExpansion("none"),
		httpSwagger.DomID("swagger-ui"),
	)))

	// Swagger JSON endpoint (basic implementation)
	router.GET("/api/v1/swagger/doc.json", func(c *gin.Context) {
		// Basic OpenAPI 3.0 structure
		c.JSON(200, gin.H{
			"openapi": "3.0.0",
			"info": gin.H{
				"title":       "GSTD DePIN Platform API",
				"description": "API documentation for GSTD Decentralized Physical Infrastructure Network Platform",
				"version":     "1.0.0",
			},
			"servers": []gin.H{
				{
					"url":         "https://app.gstdtoken.com",
					"description": "Production server",
				},
				{
					"url":         "http://localhost:8080",
					"description": "Local development server",
				},
			},
			"paths": gin.H{
				"/api/v1/health": gin.H{
					"get": gin.H{
						"summary":     "Health check endpoint",
						"description": "Returns the health status of the API and database",
						"responses": gin.H{
							"200": gin.H{
								"description": "Service is healthy",
							},
						},
					},
				},
				"/api/v1/stats/public": gin.H{
					"get": gin.H{
						"summary":     "Get public statistics",
						"description": "Returns public platform statistics (no authentication required)",
						"responses": gin.H{
							"200": gin.H{
								"description": "Public statistics",
							},
						},
					},
				},
				"/api/v1/pool/status": gin.H{
					"get": gin.H{
						"summary":     "Get pool status",
						"description": "Returns GSTD/XAUt liquidity pool status",
						"responses": gin.H{
							"200": gin.H{
								"description": "Pool status",
							},
						},
					},
				},
				"/api/v1/users/login": gin.H{
					"post": gin.H{
						"summary":     "User login",
						"description": "Authenticate user with TON Connect signature",
						"responses": gin.H{
							"200": gin.H{
								"description": "Login successful",
							},
							"400": gin.H{
								"description": "Invalid request",
							},
						},
					},
				},
			},
		})
	})
}
