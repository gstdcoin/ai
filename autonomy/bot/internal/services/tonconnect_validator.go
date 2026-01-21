package services

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

// TonConnectPayload represents the payload structure from TonConnect
type TonConnectPayload struct {
	Nonce     string `json:"nonce"`
	Timestamp int64  `json:"timestamp"`
	Address   string `json:"address,omitempty"` // Optional: wallet address
}

// TonConnectValidator handles TonConnect signature validation
type TonConnectValidator struct {
	tonService  *TONService
	errorLogger *ErrorLogger // For logging errors to database
}

// NewTonConnectValidator creates a new TonConnect validator
func NewTonConnectValidator(tonService *TONService) *TonConnectValidator {
	return &TonConnectValidator{
		tonService: tonService,
	}
}

// SetErrorLogger sets the error logger for logging errors to database
func (v *TonConnectValidator) SetErrorLogger(errorLogger *ErrorLogger) {
	v.errorLogger = errorLogger
}

// ValidateSignature validates a TonConnect signature
// Returns error if signature is invalid, timestamp is too old, or public key doesn't match wallet address
// publicKeyHex is optional - if provided, will be used instead of fetching from TON API
func (v *TonConnectValidator) ValidateSignature(
	ctx context.Context,
	walletAddress string,
	signature string,
	payload string,
	maxAge time.Duration,
	publicKeyHex string, // Optional: public key from frontend
) error {
	// Development mode: skip validation if SKIP_AUTH_VALIDATION=true
	if os.Getenv("SKIP_AUTH_VALIDATION") == "true" {
		log.Printf("⚠️  DEVELOPMENT MODE: Skipping TonConnect signature validation for wallet %s", walletAddress)
		return nil
	}

	// Detailed logging
	log.Printf("🔐 TonConnect validation started for wallet: %s", walletAddress)
	log.Printf("📦 Payload received: %s", payload)
	log.Printf("✍️  Signature received (first 20 chars): %s...", signature[:min(20, len(signature))])
	log.Printf("🔑 Public key provided: %v", publicKeyHex != "")

	// 1. Parse payload to extract nonce and timestamp
	var payloadData TonConnectPayload
	
	// Try JSON format first
	if err := json.Unmarshal([]byte(payload), &payloadData); err != nil {
		log.Printf("⚠️  Failed to parse payload as JSON, trying simple format: %v", err)
		
		// Log JSON decode error to database if errorLogger is available
		if v.errorLogger != nil {
			v.errorLogger.LogError(ctx, "tonconnect_json_decode", err, SeverityError, map[string]interface{}{
				"wallet_address": walletAddress,
				"payload":         payload,
			})
		}
		
		// Try simple format: "nonce:timestamp" or "nonce:timestamp:address"
		parts := strings.Split(payload, ":")
		if len(parts) < 2 {
			log.Printf("❌ Invalid payload format: expected JSON or 'nonce:timestamp', got: %s", payload)
			return fmt.Errorf("invalid payload format: expected JSON or 'nonce:timestamp'")
		}
		
		payloadData.Nonce = parts[0]
		timestamp, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil {
			log.Printf("❌ Invalid timestamp in payload: %v", err)
			return fmt.Errorf("invalid timestamp in payload: %w", err)
		}
		payloadData.Timestamp = timestamp
		
		if len(parts) >= 3 {
			payloadData.Address = parts[2]
		}
	} else {
		log.Printf("✅ Payload parsed successfully: nonce=%s, timestamp=%d, address=%s", 
			payloadData.Nonce, payloadData.Timestamp, payloadData.Address)
	}

	// 2. Validate timestamp (not older than maxAge)
	now := time.Now().Unix()
	age := time.Duration(now-payloadData.Timestamp) * time.Second
	log.Printf("⏰ Timestamp validation: now=%d, payload_timestamp=%d, age=%v, maxAge=%v", 
		now, payloadData.Timestamp, age, maxAge)
	
	if age > maxAge {
		log.Printf("❌ Expired timestamp: age %v exceeds maximum %v", age, maxAge)
		return fmt.Errorf("Expired timestamp: signature is %v old, maximum allowed is %v", age, maxAge)
	}
	
	if payloadData.Timestamp > now+60 { // Allow 1 minute clock skew
		log.Printf("❌ Timestamp in the future: payload_timestamp=%d, now=%d, diff=%d seconds", 
			payloadData.Timestamp, now, payloadData.Timestamp-now)
		return fmt.Errorf("signature timestamp is in the future")
	}

	// 3. Validate nonce is not empty
	if payloadData.Nonce == "" {
		log.Printf("❌ Nonce is empty in payload")
		return fmt.Errorf("nonce is required in payload")
	}

	// 4. If address is provided in payload, verify it matches walletAddress
	if payloadData.Address != "" && payloadData.Address != walletAddress {
		log.Printf("❌ Address mismatch: expected %s, got %s", walletAddress, payloadData.Address)
		return fmt.Errorf("Address mismatch: expected %s, got %s", walletAddress, payloadData.Address)
	}

	// 5. Decode signature (base64 or hex)
	sigBytes, err := base64.StdEncoding.DecodeString(signature)
	sigFormat := "base64"
	if err != nil {
		log.Printf("⚠️  Base64 decode failed, trying hex: %v", err)
		// Try hex decoding
		sigBytes, err = hex.DecodeString(signature)
		sigFormat = "hex"
		if err != nil {
			log.Printf("❌ Invalid signature format: both base64 and hex decoding failed")
			return fmt.Errorf("Invalid signature format: must be base64 or hex")
		}
	}
	log.Printf("✅ Signature decoded (%s): length=%d bytes", sigFormat, len(sigBytes))

	// Ed25519 signatures are 64 bytes
	if len(sigBytes) != 64 {
		log.Printf("❌ Invalid signature length: expected 64 bytes, got %d", len(sigBytes))
		return fmt.Errorf("Invalid signature length: expected 64 bytes, got %d", len(sigBytes))
	}

	var pubKey []byte
	var pubKeySource string
	var verifiedOffline bool
	
	// 6. Get public key 
	// FIRST try to verify the provided public key against the address (Offline)
	// This allows uninitialized wallets to login securely
	if publicKeyHex != "" {
		pkBytes, err := hex.DecodeString(publicKeyHex)
		if err == nil && len(pkBytes) == 32 {
			log.Printf("Keys: Verifying provided public key offline...")
			if v.verifyPublicKeyOffline(pkBytes, walletAddress) {
				pubKey = pkBytes
				pubKeySource = "Frontend (Verified Offline)"
				verifiedOffline = true
				log.Printf("✅ Public key verified offline against address! Skipping API call.")
			} else {
				log.Printf("⚠️  Frontend public key provided but does not match wallet address (tried v3r2, v4r2). Ignoring.")
			}
		} else {
			log.Printf("⚠️  Invalid public key hex format provided")
		}
	} else {
		log.Printf("ℹ️  No public key provided by frontend, will fetch from API")
	}

	if !verifiedOffline {
		if publicKeyHex != "" {
			log.Printf("⚠️  Offline verification failed or key ignored. Fetching from TON API.")
		}
	
		// Always fetch from TON API if not verified offline
		log.Printf("🔑 Fetching public key from TON API for wallet: %s", walletAddress)
		if v.tonService == nil {
			log.Printf("❌ TON service unavailable - cannot verify signature")
			return fmt.Errorf("TON service unavailable - cannot verify signature")
		}

		pubKeyFromAPI, err := v.tonService.GetPublicKey(ctx, walletAddress)
		if err != nil {
			log.Printf("❌ Public key not found: failed to resolve public key for wallet %s: %v", walletAddress, err)
			return fmt.Errorf("Wallet not initialized or public key not found in blockchain. Please perform at least one transaction to initialize your wallet.")
		}

		if len(pubKeyFromAPI) != 32 {
			log.Printf("❌ Invalid public key length from API: expected 32 bytes, got %d", len(pubKeyFromAPI))
			return fmt.Errorf("Invalid public key length: expected 32 bytes, got %d", len(pubKeyFromAPI))
		}
		
		pubKey = pubKeyFromAPI
		pubKeySource = "TON API (Strict)"
		log.Printf("✅ Public key from TON API: %s (first 16 chars)", hex.EncodeToString(pubKey[:16]))
	}

	// 7. Reconstruct message hash: SHA-256(payload)
	// TonConnect v2 signs the SHA-256 hash of the payload
	// The payload is the JSON string that was signed
	hash := sha256.Sum256([]byte(payload))
	log.Printf("🔐 Message hash computed: %s (first 16 chars)", hex.EncodeToString(hash[:16]))

	// 8. Verify Ed25519 signature
	log.Printf("🔍 Verifying Ed25519 signature with public key from %s...", pubKeySource)
	if !ed25519.Verify(pubKey, hash[:], sigBytes) {
		log.Printf("❌ Invalid signature: Ed25519 verify returned false")
		log.Printf("   Public key: %s", hex.EncodeToString(pubKey))
		log.Printf("   Hash: %s", hex.EncodeToString(hash[:]))
		log.Printf("   Signature: %s (first 32 bytes)", hex.EncodeToString(sigBytes[:32]))
		
		// Log invalid signature to database if errorLogger is available
		if v.errorLogger != nil {
			v.errorLogger.LogError(ctx, "tonconnect_invalid_signature", fmt.Errorf("Ed25519 verification failed"), SeverityError, map[string]interface{}{
				"wallet_address": walletAddress,
				"public_key":     hex.EncodeToString(pubKey),
				"pub_key_source": pubKeySource,
			})
		}
		
		return fmt.Errorf("Invalid signature: Ed25519 verification failed")
	}

	log.Printf("✅ TonConnect signature validated successfully for wallet %s", walletAddress)
	log.Printf("   - Nonce: %s", payloadData.Nonce)
	log.Printf("   - Age: %v", age)
	log.Printf("   - Public key source: %s", pubKeySource)
	
	return nil
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// GenerateLoginPayload generates a payload for login signature
// This should be called on the backend to generate a challenge for the frontend
func GenerateLoginPayload(nonce string) string {
	timestamp := time.Now().Unix()
	payload := TonConnectPayload{
		Nonce:     nonce,
		Timestamp: timestamp,
	}
	
	// Return as JSON string
	jsonData, _ := json.Marshal(payload)
	return string(jsonData)
}

// verifyPublicKeyOffline checks if the provided public key corresponds to the wallet address
// It checks standard wallet versions (v3r2, v4r2) with default subwallet ID
func (v *TonConnectValidator) verifyPublicKeyOffline(pubKey []byte, walletAddress string) bool {
	// 1. Check V4R2 (Most common for Tonkeeper)
	addrV4, err := wallet.AddressFromPubKey(pubKey, wallet.V4R2, wallet.DefaultSubwallet)
	if err == nil {
		v4Str := addrV4.String()
		// Normalize both addresses to ensure fair comparison
		// Use services.NormalizeAddressForAPI which handles the logic
		if NormalizeAddressForAPI(v4Str) == NormalizeAddressForAPI(walletAddress) {
			log.Printf("✅ Matches V4R2 wallet address")
			return true
		}
	}

	// 2. Check V3R2 (Legacy/Standard)
	addrV3, err := wallet.AddressFromPubKey(pubKey, wallet.V3R2, wallet.DefaultSubwallet)
	if err == nil {
		v3Str := addrV3.String()
		if NormalizeAddressForAPI(v3Str) == NormalizeAddressForAPI(walletAddress) {
			log.Printf("✅ Matches V3R2 wallet address")
			return true
		}
	}

	return false
}
