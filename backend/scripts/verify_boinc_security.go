package main

import (
	"fmt"
	"os"
	"distributed-computing-platform/internal/services"
)

func main() {
	// Set the master key in env for the test
	os.Setenv("BOINC_MASTER_KEY", "f7e9ae657e4813a736943358446fd448d840b23c74d670e442e86a47a3b3c2d0")
	
	security := services.NewBoincSecurityService()
	
	testKey := "boinc_account_key_123456789"
	fmt.Printf("Original Key: %s\n", testKey)
	
	encrypted, err := security.EncryptAccountKey(testKey)
	if err != nil {
		fmt.Printf("Encryption Error: %v\n", err)
		return
	}
	fmt.Printf("Encrypted Key (Base64): %s\n", encrypted)
	
	decryptedBytes, err := security.DecryptAccountKey(encrypted)
	if err != nil {
		fmt.Printf("Decryption Error: %v\n", err)
		return
	}
	decrypted := string(decryptedBytes)
	fmt.Printf("Decrypted Key: %s\n", decrypted)
	
	if testKey == decrypted {
		fmt.Println("✅ Encryption/Decryption Cycle: SUCCESS")
	} else {
		fmt.Println("❌ Encryption/Decryption Cycle: FAILED")
	}
	
	// Test memory clearing
	security.ClearMemory(decryptedBytes)
	for _, b := range decryptedBytes {
		if b != 0 {
			fmt.Println("❌ Memory Clearing: FAILED")
			return
		}
	}
	fmt.Println("✅ Memory Clearing: SUCCESS")
}
