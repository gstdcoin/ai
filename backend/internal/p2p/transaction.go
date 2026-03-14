package p2p

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

// TransactionType defines the intent of the swarm transaction.
type TransactionType string

const (
	TxTransfer      TransactionType = "transfer"       // Standard GSTD transfer
	TxComputeTask   TransactionType = "compute_task"   // Request for AI compute
	TxSmartDeploy   TransactionType = "smart_deploy"   // Deploy a Swarm Contract
	TxNodeHeartbeat TransactionType = "node_heartbeat" // Mobile node reporting active status
)

// Transaction represents a primitive unit of work or value transfer in the Swarm.
// It is fully compatible with TON Wallet signatures.
type Transaction struct {
	ID        string          `json:"id"`
	Type      TransactionType `json:"type"`
	Sender    string          `json:"sender"`    // TON Wallet Address (e.g. UQ...)
	Receiver  string          `json:"receiver"`  // Destination address (optional for some types)
	Amount    float64         `json:"amount"`    // GSTD amount
	Payload   string          `json:"payload"`   // Action payload, AI prompt, or contract code
	Timestamp int64           `json:"timestamp"` // Unix epoch
	PubKey    string          `json:"pub_key"`   // Hex-encoded Ed25519 Public Key
	Signature string          `json:"signature"` // Base64-encoded signature of the transaction hash
}

// Hash payload structure matches what the client signs.
type TxHashEnvelope struct {
	Type      TransactionType `json:"type"`
	Sender    string          `json:"sender"`
	Receiver  string          `json:"receiver"`
	Amount    float64         `json:"amount"`
	Payload   string          `json:"payload"`
	Timestamp int64           `json:"timestamp"`
}

// Hash returns the SHA-256 hash of the transaction data (without signature).
func (tx *Transaction) Hash() []byte {
	env := TxHashEnvelope{
		Type:      tx.Type,
		Sender:    tx.Sender,
		Receiver:  tx.Receiver,
		Amount:    tx.Amount,
		Payload:   tx.Payload,
		Timestamp: tx.Timestamp,
	}
	data, _ := json.Marshal(env)
	h := sha256.Sum256(data)
	return h[:]
}

// Verify checks the cryptographic integrity of the transaction using the TON user's public key.
func (tx *Transaction) Verify() error {
	if tx.Sender == "" {
		return fmt.Errorf("missing sender")
	}
	if tx.Timestamp > time.Now().Unix()+300 {
		return fmt.Errorf("transaction is from the future")
	}
	if tx.Timestamp < time.Now().Unix()-86400 {
		return fmt.Errorf("transaction is too old (expired)")
	}

	pubKeyBytes, err := hex.DecodeString(tx.PubKey)
	if err != nil {
		return fmt.Errorf("invalid public key hex: %v", err)
	}
	if len(pubKeyBytes) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid public key size: expected %d, got %d", ed25519.PublicKeySize, len(pubKeyBytes))
	}

	sigBytes, err := base64.StdEncoding.DecodeString(tx.Signature)
	if err != nil {
		return fmt.Errorf("invalid signature base64: %v", err)
	}

	hash := tx.Hash()

	// In TON, sign(message) is effectively ed25519.Verify(pubkey, message, signature)
	// Some TON clients sign the raw hash or a prefixed hash. For this Swarm protocol,
	// we strictly sign the SHA-256 hash of the JSON envelope.
	valid := ed25519.Verify(pubKeyBytes, hash, sigBytes)
	if !valid {
		return fmt.Errorf("invalid signature")
	}

	return nil
}

// BuildTransaction creates and signs a new transaction (used by the Swarm Node itself for rewards)
func BuildTransaction(txType TransactionType, sender, receiver string, amount float64, payload string, privKey ed25519.PrivateKey) (*Transaction, error) {
	pubKey := privKey.Public().(ed25519.PublicKey)
	
	tx := &Transaction{
		Type:      txType,
		Sender:    sender,
		Receiver:  receiver,
		Amount:    amount,
		Payload:   payload,
		Timestamp: time.Now().Unix(),
		PubKey:    hex.EncodeToString(pubKey),
	}

	hash := tx.Hash()
	sig := ed25519.Sign(privKey, hash)
	
	tx.Signature = base64.StdEncoding.EncodeToString(sig)
	tx.ID = hex.EncodeToString(hash[:16]) // First 16 bytes snippet for ID
	
	return tx, nil
}
