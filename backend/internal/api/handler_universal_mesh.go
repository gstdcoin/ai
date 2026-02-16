package api

import (
	"net/http"
	"strconv"

	"distributed-computing-platform/internal/services"

	"github.com/gin-gonic/gin"
)

// HandleInfer serves GET /api/v1/infer - public inference endpoint.
// Any user can send a prompt; the GSTD network processes it collectively.
func HandleInfer(mesh *services.UniversalMeshService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if mesh == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Universal Mesh not configured"})
			return
		}

		var req services.InferRequest
		if err := c.ShouldBindQuery(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid query params"})
			return
		}

		resp, err := mesh.Infer(c.Request.Context(), &req)
		if err != nil {
			if err == services.ErrInferPromptRequired {
				c.JSON(http.StatusBadRequest, gin.H{"error": "prompt is required"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, resp)
	}
}

// HandleMeshShares serves GET /api/v1/mesh/shares - XAUt share per node for the epoch.
func HandleMeshShares(contrib *services.ContributionMonetizationService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if contrib == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Contribution Monetization not configured"})
			return
		}

		epochHours := 24
		if h := c.Query("epoch_hours"); h != "" {
			if n, err := parseInt(h); err == nil && n > 0 && n <= 168 {
				epochHours = n
			}
		}

		shares, total, err := contrib.GetSharesForEpoch(c.Request.Context(), epochHours)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		xautPrice := contrib.GetXAUtPriceUSD()

		c.JSON(http.StatusOK, gin.H{
			"shares":       shares,
			"total_units":  total,
			"epoch_hours":  epochHours,
			"xaut_price_usd": xautPrice,
		})
	}
}

func parseInt(s string) (int, error) {
	return strconv.Atoi(s)
}
