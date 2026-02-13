package services

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
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

// EncryptWithPublicKey encrypts plaintext using the executor's RSA public key.
// Used for is_encrypted tasks: only the executor (with private key) can decrypt.
// executorPubkey: PEM format ("-----BEGIN PUBLIC KEY-----...") or base64-encoded DER
func (s *EncryptionService) EncryptWithPublicKey(plaintext []byte, executorPubkey string) (string, error) {
	pubKey, err := parsePublicKey(executorPubkey)
	if err != nil {
		return "", fmt.Errorf("invalid executor public key: %w", err)
	}
	encrypted, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, pubKey, plaintext, nil)
	if err != nil {
		return "", fmt.Errorf("encryption failed: %w", err)
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func parsePublicKey(pemOrBase64 string) (*rsa.PublicKey, error) {
	// Try PEM first
	block, _ := pem.Decode([]byte(pemOrBase64))
	if block != nil {
		pub, err := x509.ParsePKIXPublicKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		if pk, ok := pub.(*rsa.PublicKey); ok {
			return pk, nil
		}
		return nil, fmt.Errorf("not an RSA public key")
	}
	// Try base64 DER
	der, err := base64.StdEncoding.DecodeString(pemOrBase64)
	if err != nil {
		return nil, err
	}
	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, err
	}
	if pk, ok := pub.(*rsa.PublicKey); ok {
		return pk, nil
	}
	return nil, fmt.Errorf("not an RSA public key")
}

