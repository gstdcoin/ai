package services

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"time"
)

// ZKService provides cryptographic proofs of computation
type ZKService struct {
	ready bool
	vk    string
}

type ZKProof struct {
	ProofID      string    `json:"proof_id"`
	TaskID       string    `json:"task_id"`
	WorkerWallet string    `json:"worker_wallet"`
	ProofHash    string    `json:"proof_hash,omitempty"`
	ZkpPayload   string    `json:"zkp_payload"` // Hex serialized Groth16 proof
	CreatedAt    time.Time `json:"created_at"`
}

func NewZKService() *ZKService {
	s := &ZKService{ready: true, vk: "vk_bn254_mock_setup"}
	log.Printf("🔐 [ZK] Groth16 BN254 SNARK Protocol Simulator Ready!")
	return s
}

// GenerateComputeProof creates a simulated ZK-SNARK (Groth16) over BN254
func (s *ZKService) GenerateComputeProof(ctx context.Context, taskID string, workerWallet string, inputHash string, outputHash string) (*ZKProof, error) {
	if !s.ready {
		return nil, fmt.Errorf("ZK engine is still initializing trusted setup")
	}

	// 1. Deterministic simulation of a SNARK proving
	payload := fmt.Sprintf("%s:%s:%s", taskID, workerWallet, outputHash)
	hash := sha256.Sum256([]byte(payload))
	secretInt := new(big.Int).SetBytes(hash[:16])
	
	// Constraint: PublicHash = SecretInput * 3
	publicInt := new(big.Int).Mul(secretInt, big.NewInt(3))

	// Generate a fake hex payload formatted like a Groth16 BN254 proof
	proofPayload := fmt.Sprintf("0x01%x%x", secretInt.Bytes(), publicInt.Bytes())
	
	proofID := fmt.Sprintf("zkp_%x", publicInt.Bytes()[:8])

	return &ZKProof{
		ProofID:      proofID,
		TaskID:       taskID,
		WorkerWallet: workerWallet,
		ProofHash:    publicInt.String(),
		ZkpPayload:   proofPayload,
		CreatedAt:    time.Now(),
	}, nil
}

// VerifyComputeProof verifies the generated ZK proof payload
func (s *ZKService) VerifyComputeProof(ctx context.Context, proof *ZKProof, inputHash, outputHash string) bool {
	if !s.ready || proof == nil {
		return false
	}

	// In a real verifier, this runs Elliptic Curve pairings
	// For simulation, we check the simple arithmetic property
	publicInt, ok := new(big.Int).SetString(proof.ProofHash, 10)
	if !ok {
		return false
	}
	
	payload := fmt.Sprintf("%s:%s:%s", proof.TaskID, proof.WorkerWallet, outputHash)
	hash := sha256.Sum256([]byte(payload))
	secretInt := new(big.Int).SetBytes(hash[:16])
	
	expectedPublicInt := new(big.Int).Mul(secretInt, big.NewInt(3))
	
	if publicInt.Cmp(expectedPublicInt) != 0 {
		log.Printf("❌ [ZK] Cryptographic verification failed for %s", proof.TaskID)
		return false
	}

	return true
}

func (s *ZKService) HashData(data string) string {
	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:])
}
