package api

import (
	"distributed-computing-platform/internal/services"
	"log"

	"github.com/gin-gonic/gin"
)

// SetupSovereignRoutes registers all Phase: Final Infrastructure endpoints
// These routes power: Guardrails, Federated Learning, Mobile Compute, Agent Registry enhancements
func SetupSovereignRoutes(
	v1 *gin.RouterGroup,
	protected *gin.RouterGroup,
	guardrails *services.GuardrailsService,
	federated *services.FederatedEngineService,
	mobile *services.MobileComputeService,
	zbGate *services.ZeroBalanceGateService,
	recycling *services.RecyclingPoolService,
	kvCache *services.KVCacheService,
	dataAirlock *services.DataAirlockService,
	openClaw *services.OpenClawBridgeService,
) {
	// ============================================================
	// SILICON GUARDRAILS (Security Kernel)
	// ============================================================
	if guardrails != nil {
		v1.GET("/security/stats", func(c *gin.Context) {
			stats, err := guardrails.GetGuardrailStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})

		protected.POST("/security/register-key", func(c *gin.Context) {
			var req struct {
				PublicKeyHex string `json:"public_key_hex"`
			}
			if c.ShouldBindJSON(&req) != nil || req.PublicKeyHex == "" {
				c.JSON(400, gin.H{"error": "public_key_hex required"})
				return
			}
			wallet := c.GetString("wallet_address")
			if wallet == "" {
				wallet = c.GetString("user_id")
			}
			err := guardrails.RegisterSovereignKey(c.Request.Context(), wallet, req.PublicKeyHex)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"status": "sovereign_key_registered", "wallet": wallet})
		})
	}

	// ============================================================
	// FEDERATED LEARNING (Collective Memory)
	// ============================================================
	if federated != nil {
		v1.GET("/federated/stats", func(c *gin.Context) {
			stats, err := federated.GetFederatedStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})

		// Active fine-tuning target: nodes submit LoRA for this model; 10+ → Brain Update
		v1.GET("/federated/active-model", func(c *gin.Context) {
			model, err := federated.GetActiveModelTarget(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"model_name": model, "message": "Submit LoRA updates via POST /federated/submit. 10+ contributions trigger Brain Update."})
		})

		protected.POST("/federated/submit", func(c *gin.Context) {
			var update services.LoRAUpdate
			if err := c.ShouldBindJSON(&update); err != nil {
				c.JSON(400, gin.H{"error": "invalid LoRA update format"})
				return
			}

			wallet := c.GetString("wallet_address")
			if wallet == "" {
				wallet = c.GetString("user_id")
			}
			update.WalletAddress = wallet

			result, err := federated.SubmitUpdate(c.Request.Context(), &update)
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, result)
		})
	}

	// ============================================================
	// MOBILE COMPUTE & NPU ACCESS
	// ============================================================
	if mobile != nil {
		v1.GET("/mobile/stats", func(c *gin.Context) {
			stats, err := mobile.GetMobileStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})

		protected.POST("/mobile/start", func(c *gin.Context) {
			var req services.DeviceSession
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "invalid session request"})
				return
			}

			wallet := c.GetString("wallet_address")
			if wallet == "" {
				wallet = c.GetString("user_id")
			}
			req.WalletAddr = wallet

			session, err := mobile.StartSession(c.Request.Context(), &req)
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, session)
		})

		protected.POST("/mobile/heartbeat", func(c *gin.Context) {
			var req struct {
				SessionID      string  `json:"session_id"`
				IsCharging     bool    `json:"is_charging"`
				BatteryLevel   int     `json:"battery_level"`
				BatteryTemp    float64 `json:"battery_temp"`
				ConnectionType string  `json:"connection_type"`
				NPUAvailable   bool    `json:"npu_available"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "invalid heartbeat"})
				return
			}

			status := &services.DeviceSession{
				IsCharging:     req.IsCharging,
				BatteryLevel:   req.BatteryLevel,
				BatteryTemp:    req.BatteryTemp,
				ConnectionType: req.ConnectionType,
				NPUAvailable:   req.NPUAvailable,
			}

			task, err := mobile.Heartbeat(c.Request.Context(), req.SessionID, status)
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error(), "action": "pause"})
				return
			}

			c.JSON(200, gin.H{"status": "ok", "next_task": task})
		})

		protected.POST("/mobile/complete", func(c *gin.Context) {
			var req struct {
				SessionID string `json:"session_id"`
				TaskID    string `json:"task_id"`
				Success   bool   `json:"success"`
				LatencyMs int    `json:"latency_ms"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "invalid completion report"})
				return
			}

			err := mobile.ReportTaskCompletion(c.Request.Context(), req.SessionID, req.TaskID, req.Success, req.LatencyMs)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"status": "recorded"})
		})

		protected.POST("/mobile/register-device", func(c *gin.Context) {
			var cap services.DeviceCapability
			if err := c.ShouldBindJSON(&cap); err != nil {
				c.JSON(400, gin.H{"error": "invalid device capability"})
				return
			}

			err := mobile.RegisterDeviceCapability(c.Request.Context(), &cap)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, gin.H{"status": "device_registered", "device_id": cap.DeviceID})
		})
	}

	// ============================================================
	// ZERO-BALANCE-GATE (Public stats)
	// ============================================================
	if zbGate != nil {
		protected.GET("/gate/status", func(c *gin.Context) {
			wallet := c.GetString("wallet_address")
			if wallet == "" {
				wallet = c.GetString("user_id")
			}
			stats, err := zbGate.GetWorkStats(c.Request.Context(), wallet)
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})
	}

	// ============================================================
	// RECYCLING POOL (Public stats)
	// ============================================================
	if recycling != nil {
		v1.GET("/recycling/stats", func(c *gin.Context) {
			stats, err := recycling.GetPoolStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})
	}

	// ============================================================
	// KV-CACHE (Stats)
	// ============================================================
	if kvCache != nil {
		v1.GET("/kvcache/stats", func(c *gin.Context) {
			stats, err := kvCache.GetCacheStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})
	}

	// ============================================================
	// DATA AIRLOCK (GDPR/FZ-152 Compliance)
	// ============================================================
	if dataAirlock != nil {
		v1.GET("/airlock/stats", func(c *gin.Context) {
			stats, err := dataAirlock.GetAirlockStats(c.Request.Context())
			if err != nil {
				c.JSON(500, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, stats)
		})

		protected.POST("/airlock/create", func(c *gin.Context) {
			var req struct {
				DataOwnerWallet string               `json:"data_owner_wallet"`
				EdgeNodeID      string               `json:"edge_node_id"`
				SandboxType     string               `json:"sandbox_type"`
				ModelHash       string               `json:"model_hash"`
				DataRegion      string               `json:"data_region"`
				Policy          *services.DataPolicy `json:"policy"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"error": "invalid request"})
				return
			}
			wallet := c.GetString("wallet_address")
			if wallet == "" {
				wallet = c.GetString("user_id")
			}
			session := &services.AirlockSession{
				RequesterWallet: wallet,
				DataOwnerWallet: req.DataOwnerWallet,
				EdgeNodeID:      req.EdgeNodeID,
				SandboxType:     req.SandboxType,
				ModelHash:       req.ModelHash,
				DataRegion:      req.DataRegion,
			}
			result, err := dataAirlock.CreateSession(c.Request.Context(), session, req.Policy)
			if err != nil {
				c.JSON(400, gin.H{"error": err.Error()})
				return
			}
			c.JSON(200, result)
		})
	}

	// ============================================================
	// OPENCLAW BRIDGE (JSON-RPC for Robots)
	// ============================================================
	if openClaw != nil {
		// JSON-RPC endpoint
		v1.POST("/openclaw/rpc", func(c *gin.Context) {
			var req services.RPCRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(400, gin.H{"jsonrpc": "2.0", "error": gin.H{"code": -32700, "message": "Parse error"}, "id": nil})
				return
			}
			if req.JSONRPC != "2.0" {
				c.JSON(400, gin.H{"jsonrpc": "2.0", "error": gin.H{"code": -32600, "message": "Invalid Request: jsonrpc must be 2.0"}, "id": req.ID})
				return
			}
			resp := openClaw.HandleRPC(c.Request.Context(), &req)
			c.JSON(200, resp)
		})

		// REST-style convenience endpoints
		v1.GET("/openclaw/stats", func(c *gin.Context) {
			resp := openClaw.HandleRPC(c.Request.Context(), &services.RPCRequest{JSONRPC: "2.0", Method: "claw.getNetworkStats", ID: "stats"})
			c.JSON(200, resp.Result)
		})
	}

	log.Println("✅ Sovereign Infrastructure routes registered (Guardrails, Federated, Mobile, ZBG, Recycling, KVCache, Airlock, OpenClaw)")
}
