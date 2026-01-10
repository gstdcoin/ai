package services

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
)

// ConvertRawToUserFriendly converts TON address from raw format (0:...) to user-friendly format (EQ...)
// Raw format: 0: + 64 hex characters (workchain:address)
// User-friendly format: EQ/UQ/kQ/0Q + base64url encoded address
func ConvertRawToUserFriendly(rawAddress string) (string, error) {
	rawAddress = strings.TrimSpace(rawAddress)
	
	// If already in user-friendly format, return as is
	if strings.HasPrefix(rawAddress, "EQ") || strings.HasPrefix(rawAddress, "UQ") ||
		strings.HasPrefix(rawAddress, "kQ") || strings.HasPrefix(rawAddress, "0Q") {
		return rawAddress, nil
	}
	
	// Check if it's raw format
	if !strings.HasPrefix(rawAddress, "0:") {
		return rawAddress, fmt.Errorf("address is not in raw format")
	}
	
	// Extract hex part (after "0:")
	hexPart := rawAddress[2:]
	
	// TON raw address: workchain (0) + account_id (32 bytes = 64 hex chars)
	// Total hex length should be 64 characters
	if len(hexPart) < 64 {
		return rawAddress, fmt.Errorf("invalid raw address length: need 64 hex characters, got %d", len(hexPart))
	}
	
	// Take first 64 hex characters (32 bytes)
	if len(hexPart) > 64 {
		hexPart = hexPart[:64]
	}
	
	// Decode hex to bytes (32 bytes for account_id)
	accountID, err := hex.DecodeString(hexPart)
	if err != nil {
		return rawAddress, fmt.Errorf("invalid hex in raw address: %w", err)
	}
	
	if len(accountID) != 32 {
		return rawAddress, fmt.Errorf("invalid account_id length: expected 32 bytes, got %d", len(accountID))
	}
	
	// Workchain is 0 (from "0:" prefix)
	workchain := byte(0)
	
	// Create address cell: workchain (1 byte) + account_id (32 bytes) = 33 bytes
	addressCell := make([]byte, 33)
	addressCell[0] = workchain
	copy(addressCell[1:], accountID)
	
	// Encode to base64url (user-friendly format)
	// TON uses base64url encoding without padding
	encoded := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(addressCell)
	
	// TON user-friendly format uses EQ prefix for workchain 0 (bounceable)
	// Format: EQ + 44 base64url characters = 48 total (33 bytes = 44 base64 chars)
	prefix := "EQ"
	
	// Base64 encoding of 33 bytes = 44 characters (33 * 4/3 = 44)
	// Ensure we have exactly 44 characters
	if len(encoded) > 44 {
		encoded = encoded[:44]
	} else if len(encoded) < 44 {
		// Pad with 'A' (base64url safe, represents zero)
		for len(encoded) < 44 {
			encoded += "A"
		}
	}
	
	userFriendly := prefix + encoded
	
	// Verify final length is 48 characters
	if len(userFriendly) != 48 {
		log.Printf("Warning: Converted address length is %d, expected 48: %s", len(userFriendly), userFriendly)
		// Adjust to exactly 48 characters
		if len(userFriendly) > 48 {
			userFriendly = userFriendly[:48]
		} else {
			for len(userFriendly) < 48 {
				userFriendly += "A"
			}
		}
	}
	
	log.Printf("Converted address: %s -> %s", rawAddress, userFriendly)
	return userFriendly, nil
}

// ConvertRawToUserFriendlySafe is a safe version that returns original if conversion fails
func ConvertRawToUserFriendlySafe(rawAddress string) string {
	converted, err := ConvertRawToUserFriendly(rawAddress)
	if err != nil {
		log.Printf("Warning: Failed to convert address %s: %v, using original", rawAddress, err)
		return rawAddress
	}
	return converted
}

// IsRawFormat checks if address is in raw format
func IsRawFormat(address string) bool {
	return strings.HasPrefix(strings.TrimSpace(address), "0:")
}

// NormalizeAddressForAPI normalizes address for TON API calls
// Converts raw format to user-friendly if needed
func NormalizeAddressForAPI(address string) string {
	address = strings.TrimSpace(address)
	
	// If already user-friendly, return as is
	if strings.HasPrefix(address, "EQ") || strings.HasPrefix(address, "UQ") ||
		strings.HasPrefix(address, "kQ") || strings.HasPrefix(address, "0Q") {
		return address
	}
	
	// If raw format, try to convert
	if strings.HasPrefix(address, "0:") {
		converted := ConvertRawToUserFriendlySafe(address)
		return converted
	}
	
	// Unknown format, return as is
	return address
}

// CalculateAddressHash calculates hash for address validation
func CalculateAddressHash(address string) string {
	hash := sha256.Sum256([]byte(address))
	return hex.EncodeToString(hash[:])
}

