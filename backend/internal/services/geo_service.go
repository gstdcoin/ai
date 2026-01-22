package services

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)
// GeoService handles IP geolocation and GPS validation
type GeoService struct {
	httpClient *http.Client
	redisClient *redis.Client
}

// CalculateDistance calculates the distance between two points in km using Haversine formula
func (s *GeoService) CalculateDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const EarthRadiusKm = 6371.0
	dLat := (lat2 - lat1) * (math.Pi / 180.0)
	dLon := (lon2 - lon1) * (math.Pi / 180.0)

	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*(math.Pi/180.0))*math.Cos(lat2*(math.Pi/180.0))*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return EarthRadiusKm * c
}

// CheckSpoofing verifies if the movement speed is realistic (< 1000 km/h)
func (s *GeoService) CheckSpoofing(lat1, lon1, lat2, lon2 float64, timeDiff time.Duration) (bool, float64) {
	if timeDiff <= 0 {
		// If no time passed but distance > 1km, it's suspicious
		dist := s.CalculateDistance(lat1, lon1, lat2, lon2)
		if dist > 1.0 {
			return true, 10000.0 // Arbitrary high speed
		}
		return false, 0
	}

	dist := s.CalculateDistance(lat1, lon1, lat2, lon2)
	speed := dist / timeDiff.Hours()

	if speed > 1000.0 {
		return true, speed
	}

	return false, speed
}

func NewGeoService(redisClient *redis.Client) *GeoService {
	log.Println("🌍 GeoService initialized (using ip-api.com with Redis cache)")
	return &GeoService{
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		redisClient: redisClient,
	}
}

// GetCountryByIP determines country code from IP address using free API
// Uses ip-api.com (free tier: 45 requests/minute)
// Caches results in Redis for 24 hours
func (s *GeoService) GetCountryByIP(ctx context.Context, ipAddress string) (string, error) {
	if ipAddress == "" {
		return "", fmt.Errorf("IP address is required")
	}

	// Skip localhost and private IPs
	if ipAddress == "127.0.0.1" || ipAddress == "::1" || ipAddress == "localhost" {
		return "", nil // Return empty for localhost
	}

	// Check cache first
	cacheKey := fmt.Sprintf("geo:ip:%s", ipAddress)
	if s.redisClient != nil {
		country, err := s.redisClient.Get(ctx, cacheKey).Result()
		if err == nil && country != "" {
			return country, nil
		}
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

	// Cache result for 24 hours
	if s.redisClient != nil {
		if err := s.redisClient.Set(ctx, cacheKey, result.CountryCode, 24*time.Hour).Err(); err != nil {
			log.Printf("⚠️ Failed to cache geoip result: %v", err)
		}
	}

	log.Printf("🌍 Geolocation success: %s -> %s", ipAddress, result.CountryCode)
	return result.CountryCode, nil
}
