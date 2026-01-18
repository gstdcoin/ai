package services

import (
    "crypto/sha256"
    "encoding/hex"
    "fmt"
    "math/big"
    "testing"
)

func TestPoWLogic(t *testing.T) {
    // 1. Simulate Challenge
    challenge := "test-challenge-123"
    workerWallet := "UQWorkerWallet"
    // difficulty 16 bits (needs 4 leading zeros in hex roughly? no, leading zero BITS)
    // 16 bits = 2 bytes = 0x0000...
    difficulty := 16 
    
    // 2. Solve it (brute force in test - keep difficulty low)
    nonce := ""
    var solutionHash string
    
    target := new(big.Int).Exp(big.NewInt(2), big.NewInt(256-int64(difficulty)), nil)
    
    // Simplify for test: reduce difficulty to 8 bits (1 byte = 0x00...)
    difficulty = 12 // 1.5 bytes? 12 bits = 0x000...
    
    // Let's us 8 bits for speed
    difficulty = 8
    target = new(big.Int).Exp(big.NewInt(2), big.NewInt(256-int64(difficulty)), nil)
    
    found := false
    for i := 0; i < 100000; i++ {
        nonce = fmt.Sprintf("%d", i)
        data := challenge + workerWallet + nonce
        hashBytes := sha256.Sum256([]byte(data))
        hashInt := new(big.Int).SetBytes(hashBytes[:])
        
        if hashInt.Cmp(target) == -1 {
            found = true
            solutionHash = hex.EncodeToString(hashBytes[:])
            t.Logf("Found nonce: %s, hash: %s", nonce, solutionHash)
            break
        }
    }
    
    if !found {
        t.Fatal("Failed to solve PoW within iteration limit")
    }
    
    // 3. Verify Logic (matches backend implementation)
    // Backend Logic:
    // data := challenge.Challenge + wallet + nonce
	// hash := sha256.Sum256([]byte(data))
	// hashInt := new(big.Int).SetBytes(hash[:])
	// target := new(big.Int).Exp(big.NewInt(2), big.NewInt(256-int64(challenge.Difficulty)), nil)
	// if hashInt.Cmp(target) != -1 { return false }
    
    data := challenge + workerWallet + nonce
    hash := sha256.Sum256([]byte(data))
    hashInt := new(big.Int).SetBytes(hash[:])
    targetCheck := new(big.Int).Exp(big.NewInt(2), big.NewInt(256-int64(difficulty)), nil)
    
    if hashInt.Cmp(targetCheck) != -1 {
        t.Errorf("Validation failed: hash %s not < target", solutionHash)
    } else {
        t.Log("Validation passed")
    }
}
