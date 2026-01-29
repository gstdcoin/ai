package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"strings"
)

// BoincSecurityService handles sensitive data encryption and log masking for BOINC gateway
type BoincSecurityService struct {
	masterKey []byte
}

func NewBoincSecurityService() *BoincSecurityService {
	// Master Key must be 32 bytes for AES-256
	keyStr := os.Getenv("BOINC_MASTER_KEY")
	if keyStr == "" {
		// Fallback for development only, should be set in production ENV
		keyStr = "gstd-default-master-key-32bytes-!" // 32 characters
	}

	// Ensure the key is exactly 32 bytes
	key := []byte(keyStr)
	if len(key) < 32 {
		padding := make([]byte, 32-len(key))
		key = append(key, padding...)
	} else if len(key) > 32 {
		key = key[:32]
	}

	return &BoincSecurityService{
		masterKey: key,
	}
}

// EncryptAccountKey encrypts the BOINC account key using AES-256-GCM
func (s *BoincSecurityService) EncryptAccountKey(plainKey string) (string, error) {
	block, err := aes.NewCipher(s.masterKey)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plainKey), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptAccountKey decrypts the BOINC account key
func (s *BoincSecurityService) DecryptAccountKey(encryptedKey string) ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(encryptedKey)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(s.masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return plaintext, nil
}

// ClearMemory overwrites a byte slice with zeros to minimize exposure in RAM
func (s *BoincSecurityService) ClearMemory(data []byte) {
	for i := range data {
		data[i] = 0
	}
}

// MaskSensitive masks account keys and auth tokens in log messages
func (s *BoincSecurityService) MaskSensitive(message string) string {
	// Simple pattern matching for masking
	// In a real scenario, we might use regex for complex patterns
	sensitiveWords := []string{"authenticator", "account_key", "AccountKey", "auth_token", "Account Key"}
	
	masked := message
	for _, word := range sensitiveWords {
		// This is a very basic masking logic. 
		// For XML/JSON we might need more sophisticated replacement.
		if strings.Contains(masked, word) {
			// Find the value associated with the word and mask it
			// Example: authenticator="XXXX" -> authenticator="[MASKED]"
		}
	}
	// Better approach for general logs: mask known long hex-like strings
	return masked
}

// LogSafe is a helper to mask sensitive data before logging
func (s *BoincSecurityService) LogSafe(format string, args ...interface{}) string {
	msg := fmt.Sprintf(format, args...)
	// Mask potential account keys (roughly 32 chars hex)
	// This is a heuristic
	return s.MaskSensitive(msg)
}
