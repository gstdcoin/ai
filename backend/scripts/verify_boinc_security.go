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
	
	// Test key
	testKey := "test-key"
	
	encrypted, err := security.EncryptAccountKey(testKey)
	if err != nil {
		fmt.Printf("Encryption Error: %v\n", err)
		return
	}
	// Print ONLY the encrypted key so I can copy it
	fmt.Print(encrypted)
}
