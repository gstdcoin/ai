package api

import (
	"distributed-computing-platform/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type InvoiceHandler struct {
	service *services.InvoiceService
}

func NewInvoiceHandler(service *services.InvoiceService) *InvoiceHandler {
	return &InvoiceHandler{service: service}
}

func (h *InvoiceHandler) Create(c *gin.Context) {
	var req struct {
		IssuerAddress string  `json:"issuer_address" binding:"required"`
		PayerAddress  string  `json:"payer_address" binding:"required"`
		AmountGSTD    float64 `json:"amount_gstd" binding:"required"`
		Description   string  `json:"description"`
		TaskID        string  `json:"task_id"`
		ExpiresHours  int     `json:"expires_hours"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.ExpiresHours == 0 {
		req.ExpiresHours = 24
	}

	invoice, err := h.service.CreateInvoice(c.Request.Context(), req.IssuerAddress, req.PayerAddress, req.AmountGSTD, req.Description, req.TaskID, req.ExpiresHours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, invoice)
}

func (h *InvoiceHandler) Get(c *gin.Context) {
	id := c.Param("id")
	invoice, err := h.service.GetInvoice(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, invoice)
}

func (h *InvoiceHandler) Pay(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		TxHash string `json:"tx_hash" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.service.MarkPaid(c.Request.Context(), id, req.TxHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "paid", "id": id})
}

func (h *InvoiceHandler) ListForPayer(c *gin.Context) {
	payer := c.Query("payer")
	if payer == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "payer query param required"})
		return
	}

	invoices, err := h.service.GetInvoicesForPayer(c.Request.Context(), payer)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"invoices": invoices})
}

func SetupInvoiceRoutes(group *gin.RouterGroup, service *services.InvoiceService) {
	h := NewInvoiceHandler(service)
	group.POST("/invoices", h.Create)
	group.GET("/invoices/:id", h.Get)
	group.POST("/invoices/:id/pay", h.Pay)
	group.GET("/invoices", h.ListForPayer)
}
