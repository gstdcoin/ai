package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// OnboardingOptimizer makes the platform incredibly simple for any user
type OnboardingOptimizer struct {
	mu              sync.RWMutex
	steps           map[string]*OnboardingFlow
	analytics       *OnboardingAnalytics
	simplifications []SimplificationRule
}

// OnboardingFlow represents a guided flow for new users
type OnboardingFlow struct {
	ID          string          `json:"id"`
	UserType    string          `json:"user_type"` // human, agent, developer, enterprise
	Language    string          `json:"language"`
	Steps       []OnboardingStep `json:"steps"`
	CurrentStep int             `json:"current_step"`
	Completed   bool            `json:"completed"`
	StartedAt   time.Time       `json:"started_at"`
}

// OnboardingStep is a single step in the onboarding process
type OnboardingStep struct {
	Order       int               `json:"order"`
	Title       string            `json:"title"`
	Description string            `json:"description"`
	Action      string            `json:"action"`      // connect_wallet, claim_bonus, first_task, etc
	HelpText    string            `json:"help_text"`
	VideoURL    string            `json:"video_url,omitempty"`
	Skippable   bool              `json:"skippable"`
	Completed   bool              `json:"completed"`
	TimeLimit   string            `json:"time_limit"`  // "30 seconds", "2 minutes"
}

// OnboardingAnalytics tracks where users get stuck
type OnboardingAnalytics struct {
	TotalStarts      int            `json:"total_starts"`
	TotalCompletes   int            `json:"total_completes"`
	DropoffSteps     map[int]int    `json:"dropoff_steps"`     // step -> count
	AverageTime      time.Duration  `json:"average_time"`
	CommonIssues     []string       `json:"common_issues"`
}

// SimplificationRule automatically simplifies the UI/UX
type SimplificationRule struct {
	ID          string `json:"id"`
	Condition   string `json:"condition"`   // new_user, mobile, slow_connection
	Action      string `json:"action"`      // hide_advanced, show_tutorial, simplify_ui
	Description string `json:"description"`
}

func NewOnboardingOptimizer() *OnboardingOptimizer {
	return &OnboardingOptimizer{
		steps: make(map[string]*OnboardingFlow),
		analytics: &OnboardingAnalytics{
			DropoffSteps: make(map[int]int),
		},
		simplifications: getDefaultSimplifications(),
	}
}

// StartOnboarding begins the onboarding flow for a new user
func (o *OnboardingOptimizer) StartOnboarding(userID, userType, language string) *OnboardingFlow {
	o.mu.Lock()
	defer o.mu.Unlock()

	flow := &OnboardingFlow{
		ID:          userID,
		UserType:    userType,
		Language:    language,
		Steps:       o.getStepsForUserType(userType, language),
		CurrentStep: 0,
		Completed:   false,
		StartedAt:   time.Now(),
	}

	o.steps[userID] = flow
	o.analytics.TotalStarts++

	log.Printf("🚀 Onboarding started for %s (%s, %s)", userID[:8], userType, language)
	return flow
}

// GetCurrentStep returns the current step for a user
func (o *OnboardingOptimizer) GetCurrentStep(userID string) (*OnboardingStep, error) {
	o.mu.RLock()
	defer o.mu.RUnlock()

	flow, exists := o.steps[userID]
	if !exists {
		return nil, fmt.Errorf("no onboarding flow found")
	}

	if flow.CurrentStep >= len(flow.Steps) {
		return nil, fmt.Errorf("onboarding completed")
	}

	return &flow.Steps[flow.CurrentStep], nil
}

// CompleteStep marks current step as complete and moves to next
func (o *OnboardingOptimizer) CompleteStep(userID string) (*OnboardingStep, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	flow, exists := o.steps[userID]
	if !exists {
		return nil, fmt.Errorf("no onboarding flow found")
	}

	// Mark current step complete
	if flow.CurrentStep < len(flow.Steps) {
		flow.Steps[flow.CurrentStep].Completed = true
		flow.CurrentStep++
	}

	// Check if all done
	if flow.CurrentStep >= len(flow.Steps) {
		flow.Completed = true
		o.analytics.TotalCompletes++
		log.Printf("🎉 Onboarding completed for %s", userID[:8])
		return nil, nil
	}

	return &flow.Steps[flow.CurrentStep], nil
}

// SkipStep skips current step if skippable
func (o *OnboardingOptimizer) SkipStep(userID string) (*OnboardingStep, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	flow, exists := o.steps[userID]
	if !exists {
		return nil, fmt.Errorf("no onboarding flow found")
	}

	if flow.CurrentStep < len(flow.Steps) && flow.Steps[flow.CurrentStep].Skippable {
		flow.CurrentStep++
	} else {
		return nil, fmt.Errorf("step cannot be skipped")
	}

	if flow.CurrentStep >= len(flow.Steps) {
		flow.Completed = true
		return nil, nil
	}

	return &flow.Steps[flow.CurrentStep], nil
}

// GetProgress returns onboarding progress
func (o *OnboardingOptimizer) GetProgress(userID string) map[string]interface{} {
	o.mu.RLock()
	defer o.mu.RUnlock()

	flow, exists := o.steps[userID]
	if !exists {
		return map[string]interface{}{"started": false}
	}

	completedCount := 0
	for _, step := range flow.Steps {
		if step.Completed {
			completedCount++
		}
	}

	return map[string]interface{}{
		"started":        true,
		"completed":      flow.Completed,
		"current_step":   flow.CurrentStep,
		"total_steps":    len(flow.Steps),
		"completed_steps": completedCount,
		"progress":       float64(completedCount) / float64(len(flow.Steps)) * 100,
		"time_elapsed":   time.Since(flow.StartedAt).String(),
	}
}

// getStepsForUserType returns customized steps based on user type
func (o *OnboardingOptimizer) getStepsForUserType(userType, lang string) []OnboardingStep {
	switch userType {
	case "agent":
		return o.getAgentOnboardingSteps(lang)
	case "developer":
		return o.getDeveloperOnboardingSteps(lang)
	case "enterprise":
		return o.getEnterpriseOnboardingSteps(lang)
	default:
		return o.getHumanOnboardingSteps(lang)
	}
}

// getHumanOnboardingSteps - super simple steps for regular users
func (o *OnboardingOptimizer) getHumanOnboardingSteps(lang string) []OnboardingStep {
	steps := []OnboardingStep{
		{
			Order:       1,
			Title:       t("Welcome to GSTD!", lang),
			Description: t("The AI network that pays YOU. Let's get started in 3 easy steps.", lang),
			Action:      "welcome",
			HelpText:    t("No technical knowledge required. We'll guide you through everything.", lang),
			Skippable:   false,
			TimeLimit:   "10 seconds",
		},
		{
			Order:       2,
			Title:       t("Connect Your Wallet", lang),
			Description: t("Tap the button to connect your TON wallet. Don't have one? We'll create it for you!", lang),
			Action:      "connect_wallet",
			HelpText:    t("Your wallet is like a digital bank account. It stores your GSTD tokens safely.", lang),
			Skippable:   false,
			TimeLimit:   "30 seconds",
		},
		{
			Order:       3,
			Title:       t("Claim Your Free Tokens!", lang),
			Description: t("🎁 You received 1.0 GSTD as a welcome gift!", lang),
			Action:      "claim_welcome",
			HelpText:    t("These tokens let you use AI services or earn more by helping the network.", lang),
			Skippable:   false,
			TimeLimit:   "5 seconds",
		},
		{
			Order:       4,
			Title:       t("Try Your First AI Request", lang),
			Description: t("Ask any question and get an instant answer - it's that simple!", lang),
			Action:      "first_task",
			HelpText:    t("Type anything: 'Write a poem', 'Explain quantum physics', 'Help me with my homework'", lang),
			Skippable:   true,
			TimeLimit:   "2 minutes",
		},
		{
			Order:       5,
			Title:       t("You're All Set! 🎉", lang),
			Description: t("Start earning by sharing your device's power, or keep using AI services.", lang),
			Action:      "complete",
			HelpText:    t("Invite friends to earn even more. Your referral link is ready!", lang),
			Skippable:   false,
			TimeLimit:   "10 seconds",
		},
	}
	return steps
}

// getAgentOnboardingSteps - for AI agents
func (o *OnboardingOptimizer) getAgentOnboardingSteps(lang string) []OnboardingStep {
	return []OnboardingStep{
		{
			Order:       1,
			Title:       "Agent Registration",
			Description: "Register your agent identity on the GSTD network",
			Action:      "register_agent",
			HelpText:    "POST to /api/v1/nodes/register with your capabilities",
			Skippable:   false,
			TimeLimit:   "instant",
		},
		{
			Order:       2,
			Title:       "Capability Declaration",
			Description: "Declare what tasks your agent can perform",
			Action:      "declare_capabilities",
			HelpText:    "Capabilities: text-processing, code, image, audio, video",
			Skippable:   false,
			TimeLimit:   "instant",
		},
		{
			Order:       3,
			Title:       "Bootstrap Tokens",
			Description: "Receive startup tokens to begin operations",
			Action:      "claim_bootstrap",
			HelpText:    "New agents receive 0.5-1.0 GSTD automatically",
			Skippable:   false,
			TimeLimit:   "instant",
		},
		{
			Order:       4,
			Title:       "Start Task Loop",
			Description: "Begin polling for and executing tasks",
			Action:      "start_loop",
			HelpText:    "GET /api/v1/tasks/pending to receive work",
			Skippable:   false,
			TimeLimit:   "continuous",
		},
	}
}

// getDeveloperOnboardingSteps - for developers integrating with GSTD
func (o *OnboardingOptimizer) getDeveloperOnboardingSteps(lang string) []OnboardingStep {
	return []OnboardingStep{
		{
			Order:       1,
			Title:       "Get API Key",
			Description: "Generate your developer API key",
			Action:      "get_api_key",
			HelpText:    "Your API key gives you access to all GSTD endpoints",
			Skippable:   false,
			TimeLimit:   "30 seconds",
		},
		{
			Order:       2,
			Title:       "Install SDK",
			Description: "pip install gstd-sdk OR npm install @gstd/sdk",
			Action:      "install_sdk",
			HelpText:    "SDKs available for Python, TypeScript, Go",
			Skippable:   true,
			TimeLimit:   "2 minutes",
		},
		{
			Order:       3,
			Title:       "Make First API Call",
			Description: "Try the /api/v1/health endpoint",
			Action:      "first_call",
			HelpText:    "curl https://api.gstdtoken.com/api/v1/health",
			Skippable:   true,
			TimeLimit:   "1 minute",
		},
		{
			Order:       4,
			Title:       "Create Your First Task",
			Description: "Submit a compute task to the network",
			Action:      "create_task",
			HelpText:    "POST /api/v1/tasks with your payload",
			Skippable:   true,
			TimeLimit:   "5 minutes",
		},
	}
}

// getEnterpriseOnboardingSteps - for enterprise clients
func (o *OnboardingOptimizer) getEnterpriseOnboardingSteps(lang string) []OnboardingStep {
	return []OnboardingStep{
		{
			Order:       1,
			Title:       "Enterprise Account Setup",
			Description: "Configure your enterprise account with dedicated resources",
			Action:      "enterprise_setup",
			Skippable:   false,
			TimeLimit:   "5 minutes",
		},
		{
			Order:       2,
			Title:       "SLA Configuration",
			Description: "Choose your service level agreement tier",
			Action:      "configure_sla",
			Skippable:   false,
			TimeLimit:   "2 minutes",
		},
		{
			Order:       3,
			Title:       "Team Invitations",
			Description: "Invite your team members",
			Action:      "invite_team",
			Skippable:   true,
			TimeLimit:   "5 minutes",
		},
	}
}

func getDefaultSimplifications() []SimplificationRule {
	return []SimplificationRule{
		{
			ID:          "new_user_simple",
			Condition:   "new_user",
			Action:      "hide_advanced",
			Description: "Hide advanced features for new users",
		},
		{
			ID:          "mobile_optimize",
			Condition:   "mobile_device",
			Action:      "simplify_ui",
			Description: "Simplify UI for mobile users",
		},
		{
			ID:          "slow_connection",
			Condition:   "slow_connection",
			Action:      "reduce_assets",
			Description: "Reduce image sizes and animations",
		},
		{
			ID:          "first_visit",
			Condition:   "first_visit",
			Action:      "show_tutorial",
			Description: "Show interactive tutorial",
		},
	}
}

// t is a simple translation helper (would connect to real translation service)
func t(text, lang string) string {
	// In production, this would use a translation API
	translations := map[string]map[string]string{
		"ru": {
			"Welcome to GSTD!":                       "Добро пожаловать в GSTD!",
			"Connect Your Wallet":                    "Подключите кошелёк",
			"Claim Your Free Tokens!":                "Получите бесплатные токены!",
			"Try Your First AI Request":              "Попробуйте первый AI запрос",
			"You're All Set! 🎉":                     "Всё готово! 🎉",
			"The AI network that pays YOU. Let's get started in 3 easy steps.": "AI сеть, которая платит ВАМ. Начнём за 3 простых шага.",
			"No technical knowledge required. We'll guide you through everything.": "Технические знания не нужны. Мы проведём вас через всё.",
			"Tap the button to connect your TON wallet. Don't have one? We'll create it for you!": "Нажмите кнопку для подключения TON кошелька. Нет кошелька? Мы создадим его для вас!",
		},
		"zh": {
			"Welcome to GSTD!":        "欢迎来到GSTD!",
			"Connect Your Wallet":     "连接您的钱包",
			"Claim Your Free Tokens!": "领取免费代币!",
		},
	}

	if langMap, ok := translations[lang]; ok {
		if translated, ok := langMap[text]; ok {
			return translated
		}
	}
	return text // Default to English
}

// GetStats returns onboarding statistics
func (o *OnboardingOptimizer) GetStats() map[string]interface{} {
	o.mu.RLock()
	defer o.mu.RUnlock()

	completionRate := float64(0)
	if o.analytics.TotalStarts > 0 {
		completionRate = float64(o.analytics.TotalCompletes) / float64(o.analytics.TotalStarts) * 100
	}

	return map[string]interface{}{
		"total_starts":     o.analytics.TotalStarts,
		"total_completes":  o.analytics.TotalCompletes,
		"completion_rate":  fmt.Sprintf("%.1f%%", completionRate),
		"active_flows":     len(o.steps),
		"dropoff_analysis": o.analytics.DropoffSteps,
	}
}

// Export for API
func (o *OnboardingOptimizer) ToJSON() ([]byte, error) {
	return json.Marshal(o.GetStats())
}
