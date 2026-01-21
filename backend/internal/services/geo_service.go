package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

// GeoService handles IP geolocation
type GeoService struct {
	httpClient *http.Client
}

func NewGeoService() *GeoService {
	log.Println("🌍 GeoService initialized (using ip-api.com)")
	return &GeoService{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// GetCountryByIP determines country code from IP address using free API
// Uses ip-api.com (free tier: 45 requests/minute)
func (s *GeoService) GetCountryByIP(ctx context.Context, ipAddress string) (string, error) {
	if ipAddress == "" {
		return "", fmt.Errorf("IP address is required")
	}

	// Skip localhost and private IPs
	if ipAddress == "127.0.0.1" || ipAddress == "::1" || ipAddress == "localhost" {
		return "", nil // Return empty for localhost
	}

	// Use ip-api.com free API (no API key required)
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=status,countryCode", ipAddress)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch geolocation: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("geolocation API returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var result struct {
		Status      string `json:"status"`
		CountryCode string `json:"countryCode"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse response: %w", err)
	}

	if result.Status != "success" {
		return "", fmt.Errorf("geolocation API returned status: %s", result.Status)
	}

	log.Printf("🌍 Geolocation success: %s -> %s", ipAddress, result.CountryCode)
	return result.CountryCode, nil
}
