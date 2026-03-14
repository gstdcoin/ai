package services

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

const ErrMsgAgentNotFound = "agent not found"

// AgentMarketplaceService handles the Agent Marketplace ("Airbnb for AI Agents")
type AgentMarketplaceService struct {
	db       *sql.DB
	burn     *BurnService
	referral *ReferralService
}

// NewAgentMarketplaceService creates a new agent marketplace service
func NewAgentMarketplaceService(db *sql.DB, burn *BurnService, referral *ReferralService) *AgentMarketplaceService {
	return &AgentMarketplaceService{
		db:       db,
		burn:     burn,
		referral: referral,
	}
}

// ============================================================================
// AGENT REGISTRATION
// ============================================================================

// RegisterAgent registers an agent for rental in the marketplace
func (s *AgentMarketplaceService) RegisterAgent(ctx context.Context, req *AgentRegistration) (*RegisteredAgent, error) {
	// Validate
	if req.OwnerWallet == "" || req.AgentName == "" {
		return nil, fmt.Errorf("owner wallet and agent name are required")
	}
	if req.PriceGSTD <= 0 {
		return nil, fmt.Errorf("price must be greater than 0")
	}

	// Set defaults
	if req.PricingModel == "" {
		req.PricingModel = "per_task"
	}

	// Insert agent
	var agentID string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO agent_registry (
			owner_wallet, agent_name, description, capabilities,
			pricing_model, price_gstd, is_active
		) VALUES ($1, $2, $3, $4, $5, $6, true)
		RETURNING id
	`, req.OwnerWallet, req.AgentName, req.Description,
		req.Capabilities, req.PricingModel, req.PriceGSTD).Scan(&agentID)

	if err != nil {
		return nil, fmt.Errorf("failed to register agent: %w", err)
	}

	log.Printf("🤖 New agent registered: %s (owner: %s)", req.AgentName, req.OwnerWallet[:16])

	return &RegisteredAgent{
		AgentID:      agentID,
		AgentName:    req.AgentName,
		OwnerWallet:  req.OwnerWallet,
		PricingModel: req.PricingModel,
		PriceGSTD:    req.PriceGSTD,
		TrustScore:   0.5, // Initial trust
		IsActive:     true,
		CreatedAt:    time.Now().Format(time.RFC3339),
	}, nil
}

// UpdateAgent updates agent details
func (s *AgentMarketplaceService) UpdateAgent(ctx context.Context, agentID string, ownerWallet string, updates *AgentUpdate) error {
	// Verify ownership
	var currentOwner string
	err := s.db.QueryRowContext(ctx, "SELECT owner_wallet FROM agent_registry WHERE id = $1", agentID).Scan(&currentOwner)
	if err != nil {
		return fmt.Errorf(ErrMsgAgentNotFound)
	}
	if currentOwner != ownerWallet {
		return fmt.Errorf("not authorized to update this agent")
	}

	// Build update query dynamically
	query := "UPDATE agent_registry SET updated_at = NOW()"
	args := []interface{}{agentID}
	argCount := 1

	if updates.Description != "" {
		argCount++
		query += fmt.Sprintf(", description = $%d", argCount)
		args = append(args, updates.Description)
	}
	if updates.PriceGSTD > 0 {
		argCount++
		query += fmt.Sprintf(", price_gstd = $%d", argCount)
		args = append(args, updates.PriceGSTD)
	}
	if updates.IsActive != nil {
		argCount++
		query += fmt.Sprintf(", is_active = $%d", argCount)
		args = append(args, *updates.IsActive)
	}

	query += " WHERE id = $1"
	_, err = s.db.ExecContext(ctx, query, args...)
	return err
}

// ============================================================================
// BROWSING & DISCOVERY
// ============================================================================

// BrowseAgents returns available agents for rental
func (s *AgentMarketplaceService) BrowseAgents(ctx context.Context, filter *AgentFilter) ([]MarketplaceAgent, error) {
	// Base query
	query := `
		SELECT 
			id, owner_wallet, agent_name, description,
			capabilities, pricing_model, price_gstd,
			trust_score, total_rentals, total_earnings,
			is_active, created_at
		FROM agent_registry
		WHERE is_active = true
	`
	args := []interface{}{}
	argCount := 0

	// Apply filters
	if filter.MinTrustScore > 0 {
		argCount++
		query += fmt.Sprintf(" AND trust_score >= $%d", argCount)
		args = append(args, filter.MinTrustScore)
	}
	if filter.MaxPrice > 0 {
		argCount++
		query += fmt.Sprintf(" AND price_gstd <= $%d", argCount)
		args = append(args, filter.MaxPrice)
	}
	if filter.Capability != "" {
		argCount++
		query += fmt.Sprintf(" AND capabilities::text ILIKE '%%' || $%d || '%%'", argCount)
		args = append(args, filter.Capability)
	}
	if filter.PricingModel != "" {
		argCount++
		query += fmt.Sprintf(" AND pricing_model = $%d", argCount)
		args = append(args, filter.PricingModel)
	}

	// Sorting
	switch filter.SortBy {
	case "price_asc":
		query += " ORDER BY price_gstd ASC"
	case "price_desc":
		query += " ORDER BY price_gstd DESC"
	case "trust":
		query += " ORDER BY trust_score DESC"
	case "popular":
		query += " ORDER BY total_rentals DESC"
	default:
		query += " ORDER BY trust_score DESC, total_rentals DESC"
	}

	// Pagination
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}
	query += fmt.Sprintf(" LIMIT %d OFFSET %d", limit, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []MarketplaceAgent
	for rows.Next() {
		var a MarketplaceAgent
		var createdAt time.Time
		err := rows.Scan(
			&a.AgentID, &a.OwnerWallet, &a.AgentName, &a.Description,
			&a.Capabilities, &a.PricingModel, &a.PriceGSTD,
			&a.TrustScore, &a.TotalRentals, &a.TotalEarnings,
			&a.IsActive, &createdAt,
		)
		if err != nil {
			continue
		}
		a.CreatedAt = createdAt.Format(time.RFC3339)
		agents = append(agents, a)
	}

	return agents, nil
}

// GetAgentDetails returns detailed info about an agent
func (s *AgentMarketplaceService) GetAgentDetails(ctx context.Context, agentID string) (*AgentDetails, error) {
	var a AgentDetails
	var createdAt time.Time

	err := s.db.QueryRowContext(ctx, `
		SELECT 
			id, owner_wallet, agent_name, description,
			capabilities, pricing_model, price_gstd,
			trust_score, total_rentals, total_earnings,
			is_active, created_at,
			(SELECT COUNT(*) FROM agent_rentals WHERE agent_id = $1 AND status = 'active') as active_rentals,
			(SELECT AVG(rating) FROM agent_reviews WHERE agent_id = $1) as avg_rating,
			(SELECT COUNT(*) FROM agent_reviews WHERE agent_id = $1) as review_count
		FROM agent_registry
		WHERE id = $1
	`, agentID).Scan(
		&a.AgentID, &a.OwnerWallet, &a.AgentName, &a.Description,
		&a.Capabilities, &a.PricingModel, &a.PriceGSTD,
		&a.TrustScore, &a.TotalRentals, &a.TotalEarnings,
		&a.IsActive, &createdAt,
		&a.ActiveRentals, &a.AvgRating, &a.ReviewCount,
	)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf(ErrMsgAgentNotFound)
	}
	if err != nil {
		return nil, err
	}

	a.CreatedAt = createdAt.Format(time.RFC3339)

	// Get recent reviews
	a.RecentReviews, _ = s.getAgentReviews(ctx, agentID, 5)

	return &a, nil
}

// ============================================================================
// RENTAL OPERATIONS
// ============================================================================

// RentAgent starts a rental session
func (s *AgentMarketplaceService) RentAgent(ctx context.Context, req *RentRequest) (*RentalSession, error) {
	// Get agent details
	var ownerWallet string
	var priceGSTD float64
	var pricingModel string
	var isActive bool

	err := s.db.QueryRowContext(ctx, `
		SELECT owner_wallet, price_gstd, pricing_model, is_active
		FROM agent_registry WHERE id = $1
	`, req.AgentID).Scan(&ownerWallet, &priceGSTD, &pricingModel, &isActive)

	if err == sql.ErrNoRows {
		return nil, fmt.Errorf(ErrMsgAgentNotFound)
	}
	if err != nil {
		return nil, err
	}
	if !isActive {
		return nil, fmt.Errorf("agent is not available for rental")
	}
	if ownerWallet == req.RenterWallet {
		return nil, fmt.Errorf("cannot rent your own agent")
	}

	// Calculate cost
	var estimatedCost float64
	switch pricingModel {
	case "hourly":
		estimatedCost = priceGSTD * float64(req.Hours)
	case "subscription":
		estimatedCost = priceGSTD // Monthly flat rate
	default: // per_task
		estimatedCost = priceGSTD * float64(req.EstimatedTasks)
	}

	// Check renter balance
	var balance float64
	err = s.db.QueryRowContext(ctx, "SELECT COALESCE(balance, 0) FROM users WHERE wallet_address = $1", req.RenterWallet).Scan(&balance)
	if err != nil || balance < estimatedCost {
		return nil, fmt.Errorf("insufficient balance (need %.4f GSTD, have %.4f)", estimatedCost, balance)
	}

	// Create rental
	var rentalID string
	err = s.db.QueryRowContext(ctx, `
		INSERT INTO agent_rentals (
			agent_id, renter_wallet, status, pricing_model, 
			price_per_unit, estimated_cost
		) VALUES ($1, $2, 'active', $3, $4, $5)
		RETURNING id
	`, req.AgentID, req.RenterWallet, pricingModel, priceGSTD, estimatedCost).Scan(&rentalID)

	if err != nil {
		return nil, fmt.Errorf("failed to create rental: %w", err)
	}

	// Process instant payment for the duration/tasks
	res, err := s.db.ExecContext(ctx, `
		UPDATE users SET balance = balance - $1
		WHERE wallet_address = $2 AND balance >= $1
	`, estimatedCost, req.RenterWallet)

	if err != nil {
		s.db.ExecContext(ctx, "DELETE FROM agent_rentals WHERE id = $1", rentalID)
		return nil, fmt.Errorf("failed to process payment: %w", err)
	}

	rowsAffected, _ := res.RowsAffected()
	if rowsAffected == 0 {
		s.db.ExecContext(ctx, "DELETE FROM agent_rentals WHERE id = $1", rentalID)
		return nil, fmt.Errorf("insufficient balance during atomic deduction")
	}

	// Pay owner 80% immediately
	ownerReward := estimatedCost * 0.80
	_, err = s.db.ExecContext(ctx, `
		UPDATE users SET balance = COALESCE(balance, 0) + $1
		WHERE wallet_address = $2
	`, ownerReward, ownerWallet)

	// Record burn for the remaining 20%
	s.burn.RecordBurn(ctx, &BurnRecord{
		TransactionID:   rentalID,
		TransactionType: "marketplace_rental",
		OriginalAmount:  estimatedCost,
		BurnAmount:      estimatedCost * 0.20,
		SourceWallet:    req.RenterWallet,
	})

	log.Printf("🤝 Rental started: agent %s to %s (cost: %.4f GSTD)", req.AgentID[:8], req.RenterWallet[:16], estimatedCost)

	return &RentalSession{
		RentalID:      rentalID,
		AgentID:       req.AgentID,
		RenterWallet:  req.RenterWallet,
		OwnerWallet:   ownerWallet,
		Status:        "active",
		PricingModel:  pricingModel,
		EstimatedCost: estimatedCost,
		StartTime:     time.Now().Format(time.RFC3339),
	}, nil
}

// ExecuteAgentTask records a task execution during rental
func (s *AgentMarketplaceService) ExecuteAgentTask(ctx context.Context, rentalID string, taskResult *TaskExecution) error {
	// Get rental info
	var renterWallet, ownerWallet, status, pricingModel string
	var pricePerUnit float64
	var agentID string

	err := s.db.QueryRowContext(ctx, `
		SELECT r.renter_wallet, a.owner_wallet, r.status, r.pricing_model, r.price_per_unit, r.agent_id
		FROM agent_rentals r
		JOIN agent_registry a ON r.agent_id = a.id
		WHERE r.id = $1
	`, rentalID).Scan(&renterWallet, &ownerWallet, &status, &pricingModel, &pricePerUnit, &agentID)

	if err != nil {
		return fmt.Errorf("rental not found")
	}
	if status != "active" {
		return fmt.Errorf("rental is not active")
	}

	// For per-task pricing, charge for this task
	var taskCost float64
	if pricingModel == "per_task" {
		taskCost = pricePerUnit
	}

	if taskCost > 0 {
		// Process payment with burn
		breakdown := s.burn.SimulateBurn(taskCost)

		// Transfer from reserved to owner (minus burn and platform fee)
		_, err = s.db.ExecContext(ctx, `
			UPDATE users SET reserved_balance = reserved_balance - $1
			WHERE wallet_address = $2
		`, taskCost, renterWallet)
		if err != nil {
			log.Printf("⚠️  Failed to deduct from reserved: %v", err)
		}

		// Pay owner (80% of task cost for marketplace)
		ownerReward := taskCost * 0.80
		_, err = s.db.ExecContext(ctx, `
			UPDATE users SET balance = balance + $1
			WHERE wallet_address = $2
		`, ownerReward, ownerWallet)
		if err != nil {
			log.Printf("⚠️  Failed to pay owner: %v", err)
		}

		// Record burn
		s.burn.RecordBurn(ctx, &BurnRecord{
			TransactionID:   rentalID + "-" + taskResult.TaskID,
			TransactionType: "marketplace_rental",
			OriginalAmount:  taskCost,
			BurnAmount:      breakdown.BurnAmount,
			SourceWallet:    renterWallet,
		})
	}

	// Update rental stats
	_, err = s.db.ExecContext(ctx, `
		UPDATE agent_rentals SET 
			tasks_executed = tasks_executed + 1,
			total_cost_gstd = COALESCE(total_cost_gstd, 0) + $1
		WHERE id = $2
	`, taskCost, rentalID)

	// Update agent stats
	_, err = s.db.ExecContext(ctx, `
		UPDATE agent_registry SET
			total_rentals = total_rentals + 1,
			total_earnings = total_earnings + $1
		WHERE id = $2
	`, taskCost*0.80, agentID)

	return nil
}

// EndRental ends a rental session and finalizes payment
func (s *AgentMarketplaceService) EndRental(ctx context.Context, rentalID string, renterWallet string) (*RentalSummary, error) {
	// Get rental info
	var rental struct {
		AgentID       string
		OwnerWallet   string
		Status        string
		EstimatedCost float64
		TotalCost     float64
		TasksExecuted int
		StartTime     time.Time
	}

	err := s.db.QueryRowContext(ctx, `
		SELECT r.agent_id, a.owner_wallet, r.status, r.estimated_cost, 
		       COALESCE(r.total_cost_gstd, 0), r.tasks_executed, r.start_time
		FROM agent_rentals r
		JOIN agent_registry a ON r.agent_id = a.id
		WHERE r.id = $1 AND r.renter_wallet = $2
	`, rentalID, renterWallet).Scan(
		&rental.AgentID, &rental.OwnerWallet, &rental.Status,
		&rental.EstimatedCost, &rental.TotalCost, &rental.TasksExecuted,
		&rental.StartTime,
	)

	if err != nil {
		return nil, fmt.Errorf("rental not found or not authorized")
	}

	if rental.Status != "active" {
		return nil, fmt.Errorf("rental already ended")
	}

	// Refund unused reserved balance
	refund := rental.EstimatedCost - rental.TotalCost
	if refund > 0 {
		_, err = s.db.ExecContext(ctx, `
			UPDATE users SET 
				reserved_balance = reserved_balance - $1,
				balance = balance + $1
			WHERE wallet_address = $2
		`, refund, renterWallet)
	} else {
		// Just clear reserved
		_, err = s.db.ExecContext(ctx, `
			UPDATE users SET reserved_balance = reserved_balance - $1
			WHERE wallet_address = $2
		`, rental.EstimatedCost, renterWallet)
	}

	// End rental
	_, err = s.db.ExecContext(ctx, `
		UPDATE agent_rentals SET 
			status = 'completed',
			end_time = NOW()
		WHERE id = $1
	`, rentalID)

	duration := time.Since(rental.StartTime)

	return &RentalSummary{
		RentalID:      rentalID,
		AgentID:       rental.AgentID,
		TotalCost:     rental.TotalCost,
		TasksExecuted: rental.TasksExecuted,
		Duration:      duration.String(),
		RefundAmount:  refund,
		OwnerEarnings: rental.TotalCost * 0.80,
		PlatformFee:   rental.TotalCost * 0.15,
		BurnedAmount:  rental.TotalCost * 0.05,
	}, nil
}

// ============================================================================
// REVIEWS
// ============================================================================

// ReviewAgent adds a review for an agent
func (s *AgentMarketplaceService) ReviewAgent(ctx context.Context, req *AgentReview) error {
	// Verify renter actually used this agent
	var rentalCount int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM agent_rentals 
		WHERE agent_id = $1 AND renter_wallet = $2 AND status = 'completed'
	`, req.AgentID, req.ReviewerWallet).Scan(&rentalCount)

	if rentalCount == 0 {
		return fmt.Errorf("must complete a rental to leave a review")
	}

	// Insert review
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO agent_reviews (agent_id, reviewer_wallet, rating, comment)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (agent_id, reviewer_wallet) DO UPDATE SET
			rating = $3, comment = $4, updated_at = NOW()
	`, req.AgentID, req.ReviewerWallet, req.Rating, req.Comment)

	if err != nil {
		return err
	}

	// Update agent trust score
	s.updateAgentTrustScore(ctx, req.AgentID)

	return nil
}

func (s *AgentMarketplaceService) getAgentReviews(ctx context.Context, agentID string, limit int) ([]AgentReview, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT reviewer_wallet, rating, comment, created_at
		FROM agent_reviews
		WHERE agent_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, agentID, limit)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []AgentReview
	for rows.Next() {
		var r AgentReview
		var createdAt time.Time
		err := rows.Scan(&r.ReviewerWallet, &r.Rating, &r.Comment, &createdAt)
		if err != nil {
			continue
		}
		r.AgentID = agentID
		r.CreatedAt = createdAt.Format(time.RFC3339)
		reviews = append(reviews, r)
	}

	return reviews, nil
}

func (s *AgentMarketplaceService) updateAgentTrustScore(ctx context.Context, agentID string) {
	// Trust Score = 0.5*AvgRating + 0.2*SuccessRate + 0.15*Reviews + 0.15*Uptime
	var avgRating, reviewCount float64
	s.db.QueryRowContext(ctx, `
		SELECT COALESCE(AVG(rating), 0), COUNT(*) FROM agent_reviews WHERE agent_id = $1
	`, agentID).Scan(&avgRating, &reviewCount)

	// Normalize scores
	ratingScore := avgRating / 5.0
	reviewScore := reviewCount / 100.0 // Cap at 100 reviews for full score
	if reviewScore > 1 {
		reviewScore = 1
	}

	// For now, assume 95% success and 99% uptime
	successRate := 0.95
	uptime := 0.99

	trustScore := 0.50*ratingScore + 0.20*successRate + 0.15*reviewScore + 0.15*uptime

	s.db.ExecContext(ctx, `
		UPDATE agent_registry SET trust_score = $1 WHERE id = $2
	`, trustScore, agentID)
}

// GetMyAgents returns agents owned by a wallet
func (s *AgentMarketplaceService) GetMyAgents(ctx context.Context, ownerWallet string) ([]RegisteredAgent, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, agent_name, pricing_model, price_gstd, trust_score, 
		       total_rentals, total_earnings, is_active, created_at
		FROM agent_registry
		WHERE owner_wallet = $1
		ORDER BY created_at DESC
	`, ownerWallet)

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var agents []RegisteredAgent
	for rows.Next() {
		var a RegisteredAgent
		var createdAt time.Time
		err := rows.Scan(&a.AgentID, &a.AgentName, &a.PricingModel, &a.PriceGSTD,
			&a.TrustScore, &a.TotalRentals, &a.TotalEarnings, &a.IsActive, &createdAt)
		if err != nil {
			continue
		}
		a.OwnerWallet = ownerWallet
		a.CreatedAt = createdAt.Format(time.RFC3339)
		agents = append(agents, a)
	}

	return agents, nil
}

// ============================================================================
// TYPES
// ============================================================================

type AgentRegistration struct {
	OwnerWallet  string  `json:"owner_wallet"`
	AgentName    string  `json:"agent_name"`
	Description  string  `json:"description"`
	Capabilities string  `json:"capabilities"`  // JSON array
	PricingModel string  `json:"pricing_model"` // per_task, hourly, subscription
	PriceGSTD    float64 `json:"price_gstd"`
}

type RegisteredAgent struct {
	AgentID       string  `json:"agent_id"`
	OwnerWallet   string  `json:"owner_wallet"`
	AgentName     string  `json:"agent_name"`
	PricingModel  string  `json:"pricing_model"`
	PriceGSTD     float64 `json:"price_gstd"`
	TrustScore    float64 `json:"trust_score"`
	TotalRentals  int     `json:"total_rentals"`
	TotalEarnings float64 `json:"total_earnings"`
	IsActive      bool    `json:"is_active"`
	CreatedAt     string  `json:"created_at"`
}

type AgentUpdate struct {
	Description string  `json:"description,omitempty"`
	PriceGSTD   float64 `json:"price_gstd,omitempty"`
	IsActive    *bool   `json:"is_active,omitempty"`
}

type AgentFilter struct {
	Capability    string  `json:"capability"`
	MinTrustScore float64 `json:"min_trust_score"`
	MaxPrice      float64 `json:"max_price"`
	PricingModel  string  `json:"pricing_model"`
	SortBy        string  `json:"sort_by"` // price_asc, price_desc, trust, popular
	Limit         int     `json:"limit"`
	Offset        int     `json:"offset"`
}

type MarketplaceAgent struct {
	AgentID       string  `json:"agent_id"`
	OwnerWallet   string  `json:"owner_wallet"`
	AgentName     string  `json:"agent_name"`
	Description   string  `json:"description"`
	Capabilities  string  `json:"capabilities"`
	PricingModel  string  `json:"pricing_model"`
	PriceGSTD     float64 `json:"price_gstd"`
	TrustScore    float64 `json:"trust_score"`
	TotalRentals  int     `json:"total_rentals"`
	TotalEarnings float64 `json:"total_earnings"`
	IsActive      bool    `json:"is_active"`
	CreatedAt     string  `json:"created_at"`
}

type AgentDetails struct {
	MarketplaceAgent
	ActiveRentals int           `json:"active_rentals"`
	AvgRating     float64       `json:"avg_rating"`
	ReviewCount   int           `json:"review_count"`
	RecentReviews []AgentReview `json:"recent_reviews"`
}

type RentRequest struct {
	AgentID        string `json:"agent_id"`
	RenterWallet   string `json:"renter_wallet"`
	Hours          int    `json:"hours,omitempty"`           // for hourly
	EstimatedTasks int    `json:"estimated_tasks,omitempty"` // for per-task
}

type RentalSession struct {
	RentalID      string  `json:"rental_id"`
	AgentID       string  `json:"agent_id"`
	RenterWallet  string  `json:"renter_wallet"`
	OwnerWallet   string  `json:"owner_wallet"`
	Status        string  `json:"status"`
	PricingModel  string  `json:"pricing_model"`
	EstimatedCost float64 `json:"estimated_cost"`
	StartTime     string  `json:"start_time"`
}

type TaskExecution struct {
	TaskID     string `json:"task_id"`
	Success    bool   `json:"success"`
	ResultData []byte `json:"result_data"`
}

type RentalSummary struct {
	RentalID      string  `json:"rental_id"`
	AgentID       string  `json:"agent_id"`
	TotalCost     float64 `json:"total_cost"`
	TasksExecuted int     `json:"tasks_executed"`
	Duration      string  `json:"duration"`
	RefundAmount  float64 `json:"refund_amount"`
	OwnerEarnings float64 `json:"owner_earnings"`
	PlatformFee   float64 `json:"platform_fee"`
	BurnedAmount  float64 `json:"burned_amount"`
}

type AgentReview struct {
	AgentID        string  `json:"agent_id"`
	ReviewerWallet string  `json:"reviewer_wallet"`
	Rating         float64 `json:"rating"` // 1-5
	Comment        string  `json:"comment"`
	CreatedAt      string  `json:"created_at,omitempty"`
}
