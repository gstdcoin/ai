package services

import (
	"context"
	"database/sql"
	"log"
	"strings"
	"time"
)

// inferenceFeeGSTD returns fee per proxy inference.
// Dynamic Equilibrium: base from GetBaseInferenceFeeGSTD() (24h-adjusted by GSTD/XAUt, target $0.01/micro).
// Golden Age: multiplied by GetInferenceFeeMultiplier() when network load > 80%.
func inferenceFeeGSTD(latencyMs int64) float64 {
	return GetBaseInferenceFeeGSTD() * GetInferenceFeeMultiplier()
}


// UniversalMeshService orchestrates inference across Mobile, Desktop, and Server.
// Implements the Universal Mesh Protocol: dynamic weight distribution and collective inference.
// Clean Core: when cleanCore is set, infer first tries Proxy-Balancer (decentralized) before server.
type UniversalMeshService struct {
	db              *sql.DB
	inference       *InferenceService
	mobile          *MobileComputeService
	pipeline        *PipelineParallelismService
	contributions   *ContributionMonetizationService
	cleanCore       *CleanCoreService // optional: decentralized inference, proxy to nodes
	settlement      *SettlementService // optional: ProcessPayment on proxy infer success
}

// InferRequest is the public inference request
type InferRequest struct {
	Prompt string `form:"prompt" json:"prompt"`
	Model  string `form:"model" json:"model"` // light, medium, full
	Stream bool   `form:"stream" json:"stream"`
}

// InferResponse is the public inference response
type InferResponse struct {
	Response    string   `json:"response"`
	Model       string   `json:"model"`
	Platform    string   `json:"platform"` // mobile, desktop, server
	LatencyMs   int64    `json:"latency_ms"`
	Contributors []string `json:"contributors,omitempty"`
}

// NewUniversalMeshService creates the mesh orchestrator
func NewUniversalMeshService(
	db *sql.DB,
	inference *InferenceService,
	mobile *MobileComputeService,
	pipeline *PipelineParallelismService,
	contributions *ContributionMonetizationService,
	cleanCore *CleanCoreService,
	settlement *SettlementService,
) *UniversalMeshService {
	return &UniversalMeshService{
		db:            db,
		inference:     inference,
		mobile:       mobile,
		pipeline:     pipeline,
		contributions: contributions,
		cleanCore:    cleanCore,
		settlement:   settlement,
	}
}

// Infer routes the prompt to the best available platform and returns the collective result.
func (s *UniversalMeshService) Infer(ctx context.Context, req *InferRequest) (*InferResponse, error) {
	start := time.Now()

	if req.Prompt == "" {
		return nil, ErrInferPromptRequired
	}

	model := strings.ToLower(strings.TrimSpace(req.Model))
	if model == "" {
		model = "full"
	}

	platform := s.selectPlatform(ctx, len(req.Prompt), model)

	// Clean Core: try decentralized proxy first (Proxy-Balancer)
	if s.cleanCore != nil {
		modelID := s.resolveModelName(model)
		if pr := s.cleanCore.ProxyInfer(ctx, req.Prompt, modelID); pr.OK {
			latencyMs := time.Since(start).Milliseconds()
			if s.contributions != nil {
				_ = s.contributions.Record(ctx, &ContributionRecord{
					NodeID:       pr.NodeID,
					WalletAddr:   pr.WalletAddr,
					Platform:     "node",
					ComputeUnits: float64(latencyMs) * 0.001,
					Model:        model,
				})
			}
			// Proxy Settlement: ProcessPayment on successful proxy inference
			if s.settlement != nil {
				inferenceFee := inferenceFeeGSTD(latencyMs)
				_, _ = s.settlement.ProcessPayment(ctx, &SettlementRequest{
					AmountGSTD:   inferenceFee,
					WorkerWallet: pr.WalletAddr,
					NodeID:       pr.NodeID,
					InferenceID:  "",
					ModelID:      modelID,
				})
			}
			return &InferResponse{
				Response:     pr.Response,
				Model:        modelID,
				Platform:     "node",
				LatencyMs:    latencyMs,
				Contributors: []string{pr.NodeID},
			}, nil
		}
	}

	// Route to appropriate backend
	var response string
	var contributors []string

	switch platform {
	case "mobile":
		// Mobile: lightweight tasks via mobile workers (fallback to server if no mobile capacity)
		response, contributors = s.inferMobile(ctx, req.Prompt, model)
	case "desktop":
		// Desktop: pipeline parallelism if nodes available
		response, contributors = s.inferDesktop(ctx, req.Prompt, model)
	default:
		// Server: Ollama (always available)
		response, contributors = s.inferServer(ctx, req.Prompt, model)
	}

	latencyMs := time.Since(start).Milliseconds()

	// Record contribution for monetization (server node as fallback)
	if s.contributions != nil {
		_ = s.contributions.Record(ctx, &ContributionRecord{
			NodeID:       "server-orchestrator",
			WalletAddr:  "",
			Platform:     platform,
			ComputeUnits: float64(latencyMs) * 0.001, // token-seconds proxy
			TaskID:       "",
			Model:        model,
		})
	}

	return &InferResponse{
		Response:     response,
		Model:        s.resolveModelName(model),
		Platform:     platform,
		LatencyMs:    latencyMs,
		Contributors: contributors,
	}, nil
}

func (s *UniversalMeshService) selectPlatform(ctx context.Context, promptLen int, model string) string {
	// light + short prompt → try mobile
	if model == "light" && promptLen < 100 {
		if s.mobile != nil && s.hasMobileCapacity(ctx) {
			return "mobile"
		}
	}
	// medium + medium prompt → try desktop (pipeline)
	if model == "medium" && promptLen < 500 {
		if s.pipeline != nil && s.hasDesktopCapacity(ctx) {
			return "desktop"
		}
	}
	// Default: server (Ollama)
	return "server"
}

func (s *UniversalMeshService) hasMobileCapacity(ctx context.Context) bool {
	if s.mobile == nil {
		return false
	}
	stats, err := s.mobile.GetMobileStats(ctx)
	if err != nil {
		return false
	}
	switch v := stats["active_sessions"].(type) {
	case int:
		return v > 0
	case float64:
		return v > 0
	default:
		return false
	}
}

func (s *UniversalMeshService) hasDesktopCapacity(ctx context.Context) bool {
	if s.pipeline == nil {
		return false
	}
	status, err := s.pipeline.GetPipelineStatus(ctx)
	if err != nil {
		return false
	}
	online, _ := status["online_nodes"].(int)
	return online > 0
}

func (s *UniversalMeshService) inferMobile(ctx context.Context, prompt, model string) (string, []string) {
	// Mobile workers process via /mobile/complete; for public infer we fallback to server
	// In production, a task would be dispatched to mobile and awaited
	log.Printf("[UniversalMesh] Mobile fallback to server (no direct mobile infer path)")
	return s.inferServer(ctx, prompt, model)
}

func (s *UniversalMeshService) inferDesktop(ctx context.Context, prompt, model string) (string, []string) {
	// Pipeline parallelism: distribute layers across desktop nodes
	// For now, fallback to server; full integration requires Swarm LFS + layer dispatch
	log.Printf("[UniversalMesh] Desktop fallback to server (pipeline dispatch not wired)")
	return s.inferServer(ctx, prompt, model)
}

func (s *UniversalMeshService) inferServer(ctx context.Context, prompt, model string) (string, []string) {
	res, err := s.inference.Think(ctx, prompt)
	if err != nil {
		return "Error: " + err.Error(), []string{"server"}
	}
	return res, []string{"server"}
}

func (s *UniversalMeshService) resolveModelName(model string) string {
	switch model {
	case "light":
		return "qwen2.5-coder:1.5b"
	case "medium":
		return "qwen2.5-coder:7b"
	default:
		return "qwen2.5-coder:7b"
	}
}

// ErrInferPromptRequired is returned when prompt is empty
var ErrInferPromptRequired = &inferError{msg: "prompt is required"}

type inferError struct{ msg string }

func (e *inferError) Error() string { return e.msg }
