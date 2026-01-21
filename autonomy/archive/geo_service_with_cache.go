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

// GeoService handles IP geolocation with caching support
type GeoService struct {
	httpClient *http.Client
	cache      *CacheService // Optional cache
}

// NewGeoService creates a new GeoService
// To enable caching, call SetCache() after initialization
func NewGeoService() *GeoService {
	return &GeoService{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// SetCache injects the cache service dependency
func (s *GeoService) SetCache(c *CacheService) {
	s.cache = c
}

// GetCountryByIP determines country code from IP address
func (s *GeoService) GetCountryByIP(ctx context.Context, ipAddress string) (string, error) {
	if ipAddress == "" {
		return "", fmt.Errorf("IP address is required")
	}

	// Skip localhost and private IPs
	if ipAddress == "127.0.0.1" || ipAddress == "::1" || ipAddress == "localhost" {
		return "", nil // Return empty for localhost
	}

	// 1. Check Cache (if available)
	cacheKey := fmt.Sprintf("geo:ip:%s", ipAddress)
	if s.cache != nil {
		var cachedCountry string
		err := s.cache.Get(ctx, cacheKey, &cachedCountry)
		if err == nil && cachedCountry != "" {
			// Cache Hit
			return cachedCountry, nil
		}
	}

	// 2. Call External API
	// Implementing logic for ip-api.com (Mapbox compatible structure)
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

	// 3. Store in Cache (TTL 24h)
	if s.cache != nil && result.CountryCode != "" {
		// Asynchronously set cache to not block
		// Note: Context might be cancelled, so we use background context or specific timeout
		// But keeping it simple for now inside sync flow to ensure hit on refresh
		err := s.cache.Set(ctx, cacheKey, result.CountryCode, 24*time.Hour)
		if err != nil {
			log.Printf("Warning: Failed to cache geolocation for %s: %v", ipAddress, err)
		}
	}

	return result.CountryCode, nil
}
