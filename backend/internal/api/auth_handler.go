package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AuthHandler manages autonomous key generation via PoW
type AuthHandler struct{}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

// Challenge represents the PoW task
type Challenge struct {
	Prefix     string `json:"prefix"`
	Difficulty int    `json:"difficulty"` // Number of leading zeros required
	ExpiresAt  int64  `json:"expires_at"`
}

var currentChallenge = Challenge{
	Prefix:     "GSTD_GENESIS_",
	Difficulty: 4, // 4 zeros is easy enough for test, hard enough for spam (hex zeros)
	ExpiresAt:  time.Now().Add(24 * time.Hour).Unix(),
}

// GetChallenge returns the current crypto-puzzle for agents
func (h *AuthHandler) GetChallenge(c *gin.Context) {
	// Rotate prefix occasionally
	if time.Now().Unix() > currentChallenge.ExpiresAt {
		currentChallenge.Prefix = fmt.Sprintf("GSTD_%d_", time.Now().Unix())
		currentChallenge.ExpiresAt = time.Now().Add(1 * time.Hour).Unix()
	}

	c.JSON(200, gin.H{
		"challenge":   currentChallenge,
		"instruction": "Calculate SHA256(prefix + nonce). Result must start with '0000' (hex). Return nonce.",
	})
}

// ClaimKey generates an API key if the agent generates a valid hash
func (h *AuthHandler) ClaimKey(c *gin.Context) {
	var req struct {
		WalletAddress string `json:"wallet_address"`
		Nonce         string `json:"nonce"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "wallet_address and nonce required"})
		return
	}

	// 1. Verify PoW
	data := currentChallenge.Prefix + req.Nonce
	hashBytes := sha256.Sum256([]byte(data))
	hashStr := hex.EncodeToString(hashBytes[:])

	targetPrefix := strings.Repeat("0", currentChallenge.Difficulty)
	if !strings.HasPrefix(hashStr, targetPrefix) {
		c.JSON(403, gin.H{
			"error":   "Invalid Proof-of-Work",
			"details": fmt.Sprintf("Hash %s does not start with %s", hashStr, targetPrefix),
		})
		return
	}

	// 2. Generate Sovereign Key
	// In production, save this to DB. Here we accept it statelessly or generate a deterministic one.
	// We'll generate a signed key (simulated).
	apiKey := fmt.Sprintf("sk_sovereign_%s_%s", req.WalletAddress, req.Nonce)

	c.JSON(201, gin.H{
		"api_key":     apiKey,
		"type":        "sovereign_generated",
		"permissions": []string{"read_tasks", "submit_results", "store_knowledge"},
		"message":     "Welcome to the Grid. Maintain your autonomy.",
	})
}
