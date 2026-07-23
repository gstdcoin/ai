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
	db            *sql.DB
	inference     *InferenceService
	mobile        *MobileComputeService
	pipeline      *PipelineParallelismService
	contributions *ContributionMonetizationService
	cleanCore     *CleanCoreService          // optional: decentralized inference, proxy to nodes
	settlement    *SettlementService         // optional: ProcessPayment on proxy infer success
	supremeCoord  *SupremeCoordinatorService // optional: Golden Incentive, request tracking
	agentRating   *AgentRatingService        // optional: Eternal Synergy — Reputation Shield
}

// ErrReputationShieldPaymentRequired is returned when low-rated agent must pay 2x fee
var ErrReputationShieldPaymentRequired = &ReputationShieldError{}

type ReputationShieldError struct {
	RequiredFee float64
}

func (e *ReputationShieldError) Error() string {
	return "reputation shield: 2x inference fee required for low-rated agent"
}

// InferRequest is the public inference request
type InferRequest struct {
	Prompt            string `form:"prompt" json:"prompt"`
	Model             string `form:"model" json:"model"`                         // light, medium, full
	Stream            bool   `form:"stream" json:"stream"`                       // SSE streaming
	PriorityPlatform  string `form:"priority_platform" json:"priority_platform"` // mobile, desktop, server — Mesh Routing for Agents
	RequesterWallet   string `form:"-" json:"-"`                                 // from X-Wallet-Address / X-GSTD-Target-Wallet — Eternal Synergy Reputation Shield
}

// InferResponse is the public inference response
type InferResponse struct {
	Response     string   `json:"response"`
	Model        string   `json:"model"`
	Platform     string   `json:"platform"` // mobile, desktop, server
	LatencyMs    int64    `json:"latency_ms"`
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
	supremeCoord *SupremeCoordinatorService,
) *UniversalMeshService {
	return &UniversalMeshService{
		db:            db,
		inference:     inference,
		mobile:        mobile,
		pipeline:      pipeline,
		contributions: contributions,
		cleanCore:     cleanCore,
		settlement:    settlement,
		supremeCoord:  supremeCoord,
	}
}

// SetAgentRating injects Eternal Synergy Reputation Shield
func (s *UniversalMeshService) SetAgentRating(ar *AgentRatingService) {
	s.agentRating = ar
}

// Infer routes the prompt to the best available platform and returns the collective result.
func (s *UniversalMeshService) Infer(ctx context.Context, req *InferRequest) (*InferResponse, error) {
	start := time.Now()

	if req.Prompt == "" {
		return nil, ErrInferPromptRequired
	}

	// Eternal Synergy: Reputation Shield — 2x fee for low-rated agents (spam protection)
	if s.agentRating != nil && req.RequesterWallet != "" {
		rating, _ := s.agentRating.GetRating(ctx, req.RequesterWallet)
		if rating < 30 {
			baseFee := GetBaseInferenceFeeGSTD() * GetInferenceFeeMultiplier()
			shieldFee := baseFee * 2
			if s.db != nil {
				var balance float64
				if err := s.db.QueryRowContext(ctx, `SELECT COALESCE(balance, 0) FROM users WHERE wallet_address = $1`, req.RequesterWallet).Scan(&balance); err != nil || balance < shieldFee {
					return nil, &ReputationShieldError{RequiredFee: shieldFee}
				}
				res, err := s.db.ExecContext(ctx, `UPDATE users SET balance = balance - $1 WHERE wallet_address = $2 AND balance >= $1`, shieldFee, req.RequesterWallet)
				if err != nil {
					return nil, err
				}
				rows, _ := res.RowsAffected()
				if rows == 0 {
					return nil, &ReputationShieldError{RequiredFee: shieldFee}
				}
				log.Printf("[Eternal Synergy] Reputation Shield: %.6f GSTD deducted from %s (rating=%.1f)", shieldFee, truncateAddr(req.RequesterWallet, 16), rating)
			}
		}
	}

	model := strings.ToLower(strings.TrimSpace(req.Model))
	if model == "" {
		model = "full"
	}

	platform := s.selectPlatformWithHint(ctx, len(req.Prompt), model, req.PriorityPlatform)

	// Clean Core: try decentralized proxy first (Proxy-Balancer)
	if s.cleanCore != nil {
		modelID := s.resolveModelName(model)
		if pr := s.cleanCore.ProxyInfer(ctx, req.Prompt, modelID); pr.OK {
			latencyMs := time.Since(start).Milliseconds()
			computeUnits := float64(latencyMs) * 0.001
			if s.supremeCoord != nil {
				s.supremeCoord.RecordModelRequest(ctx, modelID)
				computeUnits *= s.supremeCoord.GoldenBonusMultiplier(ctx, modelID)
			}
			if s.contributions != nil {
				_ = s.contributions.Record(ctx, &ContributionRecord{
					NodeID:       pr.NodeID,
					WalletAddr:   pr.WalletAddr,
					Platform:     "node",
					ComputeUnits: computeUnits,
					Model:        modelID,
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
	resolvedModel := s.resolveModelName(model)

	// Supreme Coordinator: record request, Golden Incentive (+10% for top models)
	computeUnits := float64(latencyMs) * 0.001
	if s.supremeCoord != nil {
		s.supremeCoord.RecordModelRequest(ctx, resolvedModel)
		computeUnits *= s.supremeCoord.GoldenBonusMultiplier(ctx, resolvedModel)
	}

	// Record contribution for monetization (server node as fallback)
	if s.contributions != nil {
		_ = s.contributions.Record(ctx, &ContributionRecord{
			NodeID:       "server-orchestrator",
			WalletAddr:   "",
			Platform:     platform,
			ComputeUnits: computeUnits,
			TaskID:       "",
			Model:        resolvedModel,
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

// selectPlatformWithHint uses priority_platform hint from agents when valid
func (s *UniversalMeshService) selectPlatformWithHint(ctx context.Context, promptLen int, model string, hint string) string {
	hint = strings.ToLower(strings.TrimSpace(hint))
	if hint == "mobile" && s.mobile != nil && s.hasMobileCapacity(ctx) {
		return "mobile"
	}
	if hint == "desktop" && s.pipeline != nil && s.hasDesktopCapacity(ctx) {
		return "desktop"
	}
	if hint == "server" {
		return "server"
	}
	return s.selectPlatform(ctx, promptLen, model)
}

func (s *UniversalMeshService) selectPlatform(ctx context.Context, promptLen int, model string) string {
	// Knowledge Cross-Link: prefer UniversalMesh_Routing if available
	resolved := s.resolveModelName(model)
	if s.db != nil {
		var platform string
		err := s.db.QueryRowContext(ctx, `SELECT platform_preference FROM universal_mesh_routing WHERE model_id = $1`, resolved).Scan(&platform)
		if err == nil && platform != "" {
			switch platform {
			case "mobile":
				if s.mobile != nil && s.hasMobileCapacity(ctx) {
					return "mobile"
				}
			case "desktop":
				if s.pipeline != nil && s.hasDesktopCapacity(ctx) {
					return "desktop"
				}
			}
		}
	}
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

func truncateAddr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + ".."
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
