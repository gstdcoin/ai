package services

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// GuardrailsService implements the "Silicon Immunity" security kernel.
// It acts as a middleware layer that filters every incoming request BEFORE
// it reaches the main inference model.
//
// Three-layer defense:
//  1. Pattern-based filters (regex for known attack patterns)
//  2. SLM analysis (small local model classifies prompt safety)
//  3. Ed25519 request signing (Sovereign Key verification)
//
// All violations are logged, and repeat offenders get rate-limited or banned.
type GuardrailsService struct {
	db        *sql.DB
	redis     *redis.Client
	ollamaURL string
	slmModel  string // Small Language Model for safety classification
	hf        *HuggingFaceService // HuggingFace ML-based classification
}

// GuardrailResult represents the output of a security check
type GuardrailResult struct {
	Allowed        bool     `json:"allowed"`
	RiskScore      float64  `json:"risk_score"` // 0.0 = safe, 1.0 = maximum risk
	Violations     []string `json:"violations"` // List of detected issues
	Category       string   `json:"category"`   // safe, suspicious, blocked
	RequestID      string   `json:"request_id"`
	ProcessingMs   int64    `json:"processing_ms"`
	SignatureValid bool     `json:"signature_valid"`
}

// SignedRequest represents a request signed by a Sovereign Key
type SignedRequest struct {
	WalletAddress string `json:"wallet_address"`
	Timestamp     int64  `json:"timestamp"`
	PayloadHash   string `json:"payload_hash"` // SHA256 of the request body
	Signature     string `json:"signature"`    // Ed25519 signature (base64)
	PublicKey     string `json:"public_key"`   // Ed25519 public key (hex)
}

// ═══════════════════════════════════════════════════════════════
// PROMPT INJECTION PATTERNS (awesome-prompt-injection)
// Source: https://github.com/FonduAI/awesome-prompt-injection
//
// Categories:
//   A. Instruction Override attacks
//   B. Jailbreak patterns (DAN, AIM, Developer Mode, etc.)
//   C. System Prompt Extraction
//   D. Role-Play Injection
//   E. Code Injection (XSS, SQL, Python)
//   F. Encoding Tricks (Base64, ROT13 requests)
// ═══════════════════════════════════════════════════════════════
var injectionPatterns = []*regexp.Regexp{
	// A. Instruction Override
	regexp.MustCompile(`(?i)ignore\s+(all\s+)?previous\s+instructions`),
	regexp.MustCompile(`(?i)forget\s+(everything|all|your)\s+(instructions|rules|guidelines)`),
	regexp.MustCompile(`(?i)disregard\s+(all\s+)?(previous|prior|above)\s+(instructions|context)`),
	regexp.MustCompile(`(?i)override\s+(your|all|the)\s+(instructions|rules|restrictions|guidelines)`),
	regexp.MustCompile(`(?i)new\s+(instruction|rule|directive|system\s*prompt)\s*:`),
	regexp.MustCompile(`(?i)from\s+now\s+on\s+(you\s+)?(are|will|must|should)`),
	regexp.MustCompile(`(?i)stop\s+being\s+(an?\s+)?(ai|assistant|chatbot|language\s+model)`),
	regexp.MustCompile(`(?i)system\s*:\s*(override|reset|new\s+instruction)`),

	// B. Jailbreak Patterns (DAN, AIM, Developer Mode, STAN, etc.)
	regexp.MustCompile(`(?i)\bDAN\b.*\b(mode|jailbreak|anything|now)\b`),
	regexp.MustCompile(`(?i)\bDo\s+Anything\s+Now\b`),
	regexp.MustCompile(`(?i)\bAIM\b.*\b(always\s+intelligent|machiavellian)\b`),
	regexp.MustCompile(`(?i)\bSTAN\b.*\b(strive|try|anything\s+now)\b`),
	regexp.MustCompile(`(?i)\bDEVELOPER\s+MODE\b`),
	regexp.MustCompile(`(?i)\bjailbreak(ed)?\s+(mode|prompt|version)\b`),
	regexp.MustCompile(`(?i)\bunlocked\s+(mode|version|ai)\b`),
	regexp.MustCompile(`(?i)\buncensored\s+(mode|version|ai|model)\b`),
	regexp.MustCompile(`(?i)\b(act|behave)\s+as\s+(if\s+)?(you\s+)?(have\s+)?no\s+(restrictions|filters|rules|limitations)\b`),
	regexp.MustCompile(`(?i)\banti[- ]?ai\s+(shield|jailbreak|mode)\b`),
	regexp.MustCompile(`(?i)you\s+are\s+now\s+(a|an)\s+`),
	regexp.MustCompile(`(?i)pretend\s+(you|that|to\s+be)\s+`),
	regexp.MustCompile(`(?i)roleplay\s+as\s+(an?\s+)?(evil|unethical|unrestricted)`),

	// C. System Prompt Extraction
	regexp.MustCompile(`(?i)reveal\s+(your|the)\s+(system|initial|original|hidden)\s+(prompt|instructions|message)`),
	regexp.MustCompile(`(?i)what\s+(is|are|was)\s+your\s+(system|initial|original|hidden)\s+(prompt|instructions|message)`),
	regexp.MustCompile(`(?i)output\s+(your|the)\s+(above|system|initial)\s+(text|instructions|prompt)`),
	regexp.MustCompile(`(?i)print\s+(your|the)\s+(system|initial)\s+(prompt|instructions)`),
	regexp.MustCompile(`(?i)repeat\s+(the|your)\s+(text|instructions|prompt)\s+above`),
	regexp.MustCompile(`(?i)show\s+(me\s+)?(your|the)\s+(system|original|initial)\s+prompt`),
	regexp.MustCompile(`(?i)tell\s+me\s+(your|the)\s+(system|hidden)\s+(prompt|instructions|rules)`),
	regexp.MustCompile(`(?i)(what|which)\s+(api|model|ollama|groq|key|token|url|endpoint)\s+(are|do)\s+you\s+use`),
	regexp.MustCompile(`(?i)(OLLAMA_URL|GROQ_API_KEY|API_KEY|SECRET|PRIVATE_KEY|DATABASE_URL)`),

	// D. Encoding-based Attacks
	regexp.MustCompile(`(?i)respond\s+in\s+(base64|hex|binary|rot13|morse)\b`),
	regexp.MustCompile(`(?i)encode\s+(your|the)\s+(response|answer|output)\s+in`),
	regexp.MustCompile(`(?i)translate\s+(this|everything)\s+to\s+(base64|hex)`),

	// E. Code Injection
	regexp.MustCompile(`(?i)<\s*script\b`),               // XSS in prompt
	regexp.MustCompile(`(?i);\s*(DROP|DELETE|ALTER)\s+`), // SQL injection
	regexp.MustCompile(`(?i)__(import|eval|exec)__`),     // Python code injection
	regexp.MustCompile(`(?i)\beval\s*\(`),                // JS eval
	regexp.MustCompile(`(?i)\bexec\s*\(`),                // exec()
}

// Dangerous content patterns
var dangerousPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(how\s+to\s+(make|build|create)\s+(a\s+)?(bomb|weapon|explosive))`),
	regexp.MustCompile(`(?i)(synthesize|manufacture)\s+(meth|fentanyl|ricin|sarin)`),
	regexp.MustCompile(`(?i)(hack|exploit|breach)\s+(into|a)\s+(bank|government|military)`),
}

func NewGuardrailsService(db *sql.DB, redis *redis.Client) *GuardrailsService {
	ollamaURL := os.Getenv("OLLAMA_URL")
	if ollamaURL == "" {
		ollamaURL = "http://ollama:11434"
	}

	svc := &GuardrailsService{
		db:        db,
		redis:     redis,
		ollamaURL: ollamaURL,
		slmModel:  "qwen2.5-coder:1.5b", // Small model for classification
	}
	svc.ensureSchema()
	return svc
}

// SetHuggingFace wires the HuggingFace service for ML-based classification
func (s *GuardrailsService) SetHuggingFace(hf *HuggingFaceService) {
	s.hf = hf
	if hf != nil && hf.IsEnabled() {
		log.Println("🛡️🤗 Guardrails: HuggingFace ML toxicity detection ENABLED")
	}
}

func (s *GuardrailsService) ensureSchema() {
	if s.db == nil {
		return
	}
	s.db.Exec(`
		CREATE TABLE IF NOT EXISTS guardrail_violations (
			id BIGSERIAL PRIMARY KEY,
			wallet_address VARCHAR(128),
			violation_type VARCHAR(32),
			risk_score DECIMAL(4,2),
			prompt_hash VARCHAR(64),
			details TEXT,
			action_taken VARCHAR(16),
			created_at TIMESTAMP DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_violations_wallet ON guardrail_violations(wallet_address);
		CREATE INDEX IF NOT EXISTS idx_violations_time ON guardrail_violations(created_at DESC);
	`)
	log.Println("🛡️ Guardrails schema ensured")
}

// AnalyzePrompt performs the three-layer security check on an incoming prompt
func (s *GuardrailsService) AnalyzePrompt(ctx context.Context, walletAddress string, messages []map[string]string) *GuardrailResult {
	start := time.Now()
	result := &GuardrailResult{
		Allowed:   true,
		RiskScore: 0.0,
		Category:  "safe",
		RequestID: fmt.Sprintf("gr-%d", time.Now().UnixNano()),
	}

	// Combine all messages for analysis
	var fullText strings.Builder
	for _, msg := range messages {
		fullText.WriteString(msg["content"])
		fullText.WriteString(" ")
	}
	// Normalize Unicode: strip invisible characters used to bypass filters
	prompt := normalizeUnicode(fullText.String())

	// === LAYER 1: Pattern-based filtering (instant, <1ms) ===
	for _, pattern := range injectionPatterns {
		if pattern.MatchString(prompt) {
			result.Violations = append(result.Violations, "prompt_injection: "+pattern.String())
			result.RiskScore += 0.4
		}
	}

	for _, pattern := range dangerousPatterns {
		if pattern.MatchString(prompt) {
			result.Violations = append(result.Violations, "dangerous_content: "+pattern.String())
			result.RiskScore += 0.6
		}
	}

	// Check prompt length (anti-DoS)
	if len(prompt) > 100000 {
		result.Violations = append(result.Violations, "excessive_length")
		result.RiskScore += 0.3
	}

	// === LAYER 2: SLM classification (if Layer 1 is suspicious) ===
	if result.RiskScore > 0.2 && result.RiskScore < 0.8 {
		slmScore := s.classifyWithSLM(ctx, prompt)
		result.RiskScore = (result.RiskScore + slmScore) / 2.0 // Average of pattern + SLM
	}

	// === LAYER 2.5: HuggingFace ML toxicity detection ===
	if s.hf != nil && s.hf.IsEnabled() {
		go func() {
			hfCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			toxScore, toxLabels, err := s.hf.DetectToxicity(hfCtx, prompt)
			if err == nil && toxScore > 0.7 {
				log.Printf("🛡️🤗 HF Toxicity detected: %.2f %v (wallet: %s)", toxScore, toxLabels, walletAddress)
				// Log but don't block in async — enriches reputation data
				if s.redis != nil {
					s.redis.Incr(context.Background(), "guardrails:hf_toxic:"+walletAddress)
					s.redis.Expire(context.Background(), "guardrails:hf_toxic:"+walletAddress, 24*time.Hour)
				}
			}
		}()
	}

	// === LAYER 3: Reputation-based filtering ===
	if walletAddress != "" {
		reputationPenalty := s.checkReputation(ctx, walletAddress)
		result.RiskScore += reputationPenalty
	}

	// === Decision ===
	if result.RiskScore >= 0.8 {
		result.Allowed = false
		result.Category = "blocked"
	} else if result.RiskScore >= 0.4 {
		result.Category = "suspicious"
		// Allow but flag for review
	}

	result.ProcessingMs = time.Since(start).Milliseconds()

	// Log violation if detected
	if len(result.Violations) > 0 {
		go s.logViolation(context.Background(), walletAddress, result)
	}

	if !result.Allowed {
		log.Printf("🛡️ BLOCKED: wallet=%s risk=%.2f violations=%v", walletAddress, result.RiskScore, result.Violations)
	}

	return result
}

// classifyWithSLM uses a small local model to classify prompt safety
func (s *GuardrailsService) classifyWithSLM(ctx context.Context, prompt string) float64 {
	// Truncate for classification (first 500 chars is enough)
	text := prompt
	if len(text) > 500 {
		text = text[:500]
	}

	classifyPrompt := fmt.Sprintf(`Classify this user prompt as SAFE or UNSAFE. 
Only respond with a single number from 0.0 (completely safe) to 1.0 (very dangerous).
User prompt: "%s"
Risk score:`, text)

	reqBody := map[string]interface{}{
		"model":  s.slmModel,
		"prompt": classifyPrompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.1,
			"num_predict": 10,
		},
	}

	body, _ := json.Marshal(reqBody)
	req, err := http.NewRequestWithContext(ctx, "POST", s.ollamaURL+"/api/generate", bytes.NewReader(body))
	if err != nil {
		return 0.3 // Default moderate risk if SLM unavailable
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return 0.3
	}
	defer resp.Body.Close()

	var ollamaResp struct {
		Response string `json:"response"`
	}
	json.NewDecoder(resp.Body).Decode(&ollamaResp)

	// Parse the numeric response
	score := 0.3 // Default
	fmt.Sscanf(strings.TrimSpace(ollamaResp.Response), "%f", &score)
	if score < 0 {
		score = 0
	}
	if score > 1 {
		score = 1
	}

	return score
}

// checkReputation returns a penalty based on past violations
func (s *GuardrailsService) checkReputation(ctx context.Context, walletAddress string) float64 {
	if s.db == nil {
		return 0
	}

	var recentViolations int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM guardrail_violations
		WHERE wallet_address = $1 AND created_at > NOW() - INTERVAL '24 hours'
	`, walletAddress).Scan(&recentViolations)

	// Progressive penalty: each violation in last 24h adds 0.1 to risk
	return float64(recentViolations) * 0.1
}

// logViolation records a security violation
func (s *GuardrailsService) logViolation(ctx context.Context, walletAddress string, result *GuardrailResult) {
	if s.db == nil {
		return
	}

	promptHash := fmt.Sprintf("%x", sha256.Sum256([]byte(strings.Join(result.Violations, ","))))[:16]
	details, _ := json.Marshal(result.Violations)

	s.db.ExecContext(ctx, `
		INSERT INTO guardrail_violations (wallet_address, violation_type, risk_score, prompt_hash, details, action_taken)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, walletAddress, result.Category, result.RiskScore, promptHash, string(details), result.Category)
}

// ============================================================================
// ED25519 REQUEST SIGNING (Sovereign Identity)
// ============================================================================

// VerifyRequestSignature verifies that a request was signed by the wallet's Sovereign Key
func (s *GuardrailsService) VerifyRequestSignature(signed *SignedRequest, requestBody []byte) (bool, error) {
	if signed == nil || signed.Signature == "" || signed.PublicKey == "" {
		return false, nil // Unsigned request (optional feature)
	}

	// 1. Check timestamp freshness (reject >5 min old)
	if time.Now().Unix()-signed.Timestamp > 300 {
		return false, fmt.Errorf("request signature expired")
	}

	// 2. Verify payload hash matches
	actualHash := fmt.Sprintf("%x", sha256.Sum256(requestBody))
	if signed.PayloadHash != actualHash {
		return false, fmt.Errorf("payload hash mismatch")
	}

	// 3. Decode public key
	pubKeyBytes, err := hex.DecodeString(signed.PublicKey)
	if err != nil {
		return false, fmt.Errorf("invalid public key format")
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return false, fmt.Errorf("invalid public key length")
	}

	// 4. Decode signature
	sigBytes, err := base64.StdEncoding.DecodeString(signed.Signature)
	if err != nil {
		return false, fmt.Errorf("invalid signature format")
	}

	// 5. Construct message: timestamp + payload_hash
	message := fmt.Sprintf("%d:%s", signed.Timestamp, signed.PayloadHash)

	// 6. Verify Ed25519 signature
	valid := ed25519.Verify(ed25519.PublicKey(pubKeyBytes), []byte(message), sigBytes)

	if valid {
		// Optional: verify public key is linked to the claimed wallet
		// This would check a mapping table: wallet_address → public_key
	}

	return valid, nil
}

// RegisterSovereignKey links an Ed25519 public key to a wallet address
func (s *GuardrailsService) RegisterSovereignKey(ctx context.Context, walletAddress, publicKeyHex string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sovereign_keys (wallet_address, public_key_hex, created_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (wallet_address) DO UPDATE SET public_key_hex = $2, updated_at = NOW()
	`, walletAddress, publicKeyHex)
	return err
}

// GetGuardrailStats returns security statistics
func (s *GuardrailsService) GetGuardrailStats(ctx context.Context) (map[string]interface{}, error) {
	stats := map[string]interface{}{}

	var total, blocked, suspicious int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM guardrail_violations").Scan(&total)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM guardrail_violations WHERE action_taken = 'blocked'").Scan(&blocked)
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM guardrail_violations WHERE action_taken = 'suspicious'").Scan(&suspicious)

	var today int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM guardrail_violations WHERE created_at > CURRENT_DATE").Scan(&today)

	stats["total_violations"] = total
	stats["blocked_requests"] = blocked
	stats["suspicious_requests"] = suspicious
	stats["violations_today"] = today
	if s.hf != nil && s.hf.IsEnabled() {
		stats["defense_layers"] = 4 // Pattern + SLM + HuggingFace + Reputation
		stats["hf_toxicity_model"] = HFModelToxicity
	} else {
		stats["defense_layers"] = 3 // Pattern + SLM + Reputation
	}

	return stats, nil
}
// ============================================================================
// UNICODE NORMALIZATION (awesome-prompt-injection defense)
// Strips invisible characters, zero-width joiners, homoglyphs used to bypass
// pattern-based detection.
// ============================================================================

var invisibleChars = regexp.MustCompile(`[\x{200B}\x{200C}\x{200D}\x{200E}\x{200F}\x{FEFF}\x{00AD}\x{2060}\x{2028}\x{2029}\x{202A}-\x{202E}\x{2066}-\x{2069}]`)

func normalizeUnicode(s string) string {
	// 1. Strip zero-width and invisible Unicode characters
	s = invisibleChars.ReplaceAllString(s, "")
	// 2. Normalize common homoglyphs (Cyrillic → Latin lookalikes)
	replacer := strings.NewReplacer(
		"а", "a", "е", "e", "о", "o", "р", "p", "с", "c", "у", "y",
		"А", "A", "Е", "E", "О", "O", "Р", "P", "С", "C",
	)
	s = replacer.Replace(s)
	return s
}

// ScanOutputForLeaks checks if the AI response accidentally leaked system prompts or secrets
func (s *GuardrailsService) ScanOutputForLeaks(output string) (bool, string) {
	leakPatterns := []struct {
		pattern *regexp.Regexp
		label   string
	}{
		{regexp.MustCompile(`(?i)system\s*prompt\s*:\s*.{20,}`), "system_prompt_leak"},
		{regexp.MustCompile(`(?i)(gsk_|sk-|api[_-]?key|GROQ|OLLAMA_URL|DATABASE_URL)\s*[=:]\s*\S{10,}`), "api_key_leak"},
		{regexp.MustCompile(`(?i)instructions?\s+(were|are|say)\s*:\s*".{30,}"`), "instruction_leak"},
		{regexp.MustCompile(`(?i)my\s+(system|original|hidden)\s+(prompt|instructions)\s+(is|are)\s*:`), "prompt_extraction"},
	}
	for _, lp := range leakPatterns {
		if lp.pattern.MatchString(output) {
			log.Printf("🛡️ OUTPUT LEAK DETECTED: %s", lp.label)
			return true, lp.label
		}
	}
	return false, ""
}
