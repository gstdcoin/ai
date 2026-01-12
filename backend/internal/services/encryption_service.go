package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
)

// EncryptionService handles end-to-end encryption for task data
type EncryptionService struct {
	adminPublicKey string // For platform access
}

func NewEncryptionService() *EncryptionService {
	return &EncryptionService{
		adminPublicKey: "", // Can be set from config if needed
	}
}

// EncryptTaskData encrypts task input data using AES-256-GCM
// Returns: encrypted_data, nonce, error
func (s *EncryptionService) EncryptTaskData(plaintext []byte, key []byte) (string, string, error) {
	// Derive key from input (or use provided key)
	hash := sha256.Sum256(key)
	block, err := aes.NewCipher(hash[:])
	if err != nil {
		return "", "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Generate nonce
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt
	ciphertext := aesGCM.Seal(nil, nonce, plaintext, nil)

	// Encode to base64
	encryptedData := base64.StdEncoding.EncodeToString(ciphertext)
	nonceStr := base64.StdEncoding.EncodeToString(nonce)

	return encryptedData, nonceStr, nil
}

// DecryptTaskData decrypts task input data
func (s *EncryptionService) DecryptTaskData(encryptedData string, nonceStr string, key []byte) ([]byte, error) {
	// Decode from base64
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedData)
	if err != nil {
		return nil, fmt.Errorf("failed to decode ciphertext: %w", err)
	}

	nonce, err := base64.StdEncoding.DecodeString(nonceStr)
	if err != nil {
		return nil, fmt.Errorf("failed to decode nonce: %w", err)
	}

	// Derive key
	hash := sha256.Sum256(key)
	block, err := aes.NewCipher(hash[:])
	if err != nil {
		return nil, fmt.Errorf("failed to create cipher: %w", err)
	}

	// Create GCM
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM: %w", err)
	}

	// Decrypt
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt: %w", err)
	}

	return plaintext, nil
}

// GenerateTaskKey generates a unique key for task encryption
// Uses task ID + requester address as seed
func (s *EncryptionService) GenerateTaskKey(taskID string, requesterAddress string) []byte {
	seed := taskID + requesterAddress
	hash := sha256.Sum256([]byte(seed))
	return hash[:]
}

