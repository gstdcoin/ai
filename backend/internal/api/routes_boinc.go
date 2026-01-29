package api

import (
	"distributed-computing-platform/internal/models"
	"distributed-computing-platform/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
)

type CreateBoincTaskRequest struct {
	ProjectURL  string  `json:"project_url" binding:"required"`
	AccountKey  string  `json:"account_key" binding:"required"`
	AppName     string  `json:"app_name" binding:"required"`
	CommandLine string  `json:"command_line"`
	BudgetGSTD  float64 `json:"budget_gstd" binding:"required"`
}

func RegisterBoincRoutes(rg *gin.RouterGroup, boincService *services.BoincService, taskService *services.TaskService) {
	boinc := rg.Group("/boinc")
	{
		boinc.POST("/tasks", createBoincTask(boincService, taskService))
		boinc.GET("/stats", getBoincStats(boincService))
	}
}

func createBoincTask(boincService *services.BoincService, taskService *services.TaskService) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req CreateBoincTaskRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// 1. In a real scenario, we would verify the GSTD payment first (escrow)
		// For now, we assume the user has balance or we handle it in taskService

		// 2. Submit to BOINC
		jobs := []services.BoincJob{
			{
				Name:        "GSTD_Job_" + c.GetString("user_address"),
				CommandLine: req.CommandLine,
			},
		}

		batchID, err := boincService.SubmitToBoinc(req.ProjectURL, req.AccountKey, req.AppName, jobs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "BOINC submission failed: " + err.Error()})
			return
		}

		// 3. Create task in our DB
		mockDescriptor := models.TaskDescriptor{
			TaskType: "boinc",
			Operation: "compute",
			Model: req.AppName,
			Reward: models.Reward{AmountGSTD: req.BudgetGSTD},
			IsBoinc: true,
			BoincProjectURL: req.ProjectURL,
			BoincBatchID: batchID,
			BoincAccountKey: req.AccountKey,
		}
		
		task, err := taskService.CreateTask(c.Request.Context(), c.GetString("user_address"), &mockDescriptor)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record bridged task: " + err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message":  "BOINC task bridged successfully",
			"task_id":  task.TaskID,
			"batch_id": batchID,
			"status":   "queued",
		})
	}
}

func getBoincStats(boincService *services.BoincService) gin.HandlerFunc {
	return func(c *gin.Context) {
		stats, err := boincService.GetBoincStats(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, stats)
	}
}
