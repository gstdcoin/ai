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
// User-friendly format: [tag 1b][workchain 1b][account_id 32b][crc 2b] base64url encoded
func ConvertRawToUserFriendly(rawAddress string) (string, error) {
	rawAddress = strings.TrimSpace(rawAddress)

	// If already in user-friendly format, return as is
	if strings.HasPrefix(rawAddress, "EQ") || strings.HasPrefix(rawAddress, "UQ") ||
		strings.HasPrefix(rawAddress, "kQ") || strings.HasPrefix(rawAddress, "0Q") {
		return rawAddress, nil
	}

	// Check if it's raw format
	if !strings.HasPrefix(rawAddress, "0:") && !strings.HasPrefix(rawAddress, "-1:") {
		// Just return raw if we can't parse it, though likely invalid
		return rawAddress, fmt.Errorf("address is not in raw format")
	}

	// Parse Workchain
	var workchainByte byte = 0x00
	hexPart := ""

	if strings.HasPrefix(rawAddress, "0:") {
		workchainByte = 0x00
		hexPart = rawAddress[2:]
	} else if strings.HasPrefix(rawAddress, "-1:") {
		workchainByte = 0xff
		hexPart = rawAddress[3:]
	}

	// Normalize hex part
	if len(hexPart) < 64 {
		return rawAddress, fmt.Errorf("invalid raw address length: need 64 hex characters, got %d", len(hexPart))
	}
	if len(hexPart) > 64 {
		hexPart = hexPart[:64]
	}

	// Perform Hex Decode
	accountID, err := hex.DecodeString(hexPart)
	if err != nil {
		return rawAddress, fmt.Errorf("invalid hex in raw address: %w", err)
	}

	// Construct the 34-byte data: Tag + Workchain + AccountID
	// Tag: 0x11 for Bounceable (default), 0x51 for Non-bounceable (UQ)
	// We use 0x11 (Bounceable) -> starts with EQ for wc 0
	tag := byte(0x11)

	data := make([]byte, 34)
	data[0] = tag
	data[1] = workchainByte
	copy(data[2:], accountID)

	// Calculate CRC16-CCITT (XMODEM)
	crc := crc16(data)

	// Append CRC (2 bytes, big-endian)
	fullData := make([]byte, 36)
	copy(fullData, data)
	fullData[34] = byte(crc >> 8)
	fullData[35] = byte(crc & 0xFF)

	// Base64 URL Encode
	userFriendly := base64.URLEncoding.EncodeToString(fullData)

	log.Printf("Converted address: %s -> %s", rawAddress, userFriendly)
	return userFriendly, nil
}

// crc16 calculates CRC16-CCITT (XMODEM) for TON address checksum
func crc16(data []byte) uint16 {
	var crc uint16 = 0x0000
	for _, b := range data {
		x := (crc >> 8) ^ uint16(b)
		x ^= x >> 4
		crc = (crc << 8) ^ (x << 12) ^ (x << 5) ^ x
	}
	return crc
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
	return strings.HasPrefix(strings.TrimSpace(address), "0:") || strings.HasPrefix(strings.TrimSpace(address), "-1:")
}

// NormalizeAddressForAPI normalizes address for TON API calls
// Converts raw format to user-friendly if needed. Sanitizes quotes and whitespace.
// Also handles uppercased base64 addresses stored in the DB (e.g. EQPZ0KE... → re-encoded).
func NormalizeAddressForAPI(address string) string {
	// Remove quotes, trim whitespace - fixes "can't decode address" from TON API
	address = strings.TrimSpace(address)
	address = strings.Trim(address, "\"'`")
	address = strings.TrimSpace(address)

	// If already user-friendly (proper case), return as is
	if strings.HasPrefix(address, "EQ") || strings.HasPrefix(address, "UQ") ||
		strings.HasPrefix(address, "kQ") || strings.HasPrefix(address, "0Q") {
		// Validate that it's actually proper base64url by trying to decode
		// Some addresses are stored UPPERCASED in DB (e.g. EQPZ0KEQWQZ...) which breaks TON API
		if len(address) == 48 {
			_, err := base64.URLEncoding.DecodeString(address)
			if err != nil {
				// Address appears user-friendly but has invalid base64 encoding (likely all uppercase)
				// Try to recover: it's not repairable from uppercase alone, so return as-is
				// and let the caller handle the API error gracefully
				log.Printf("Warning: address %s looks user-friendly but has invalid base64, skipping API call", address[:8])
				return ""
			}
		}
		return address
	}

	// If raw format, try to convert
	if IsRawFormat(address) {
		converted := ConvertRawToUserFriendlySafe(address)
		return converted
	}

	// Unknown format — return empty to skip API call (prevents "illegal base32" errors)
	if len(address) > 0 && address == strings.ToUpper(address) && len(address) >= 48 {
		// Likely a corrupted uppercase address, skip
		return ""
	}

	return address
}

// CalculateAddressHash calculates hash for address validation
func CalculateAddressHash(address string) string {
	hash := sha256.Sum256([]byte(address))
	return hex.EncodeToString(hash[:])
}
