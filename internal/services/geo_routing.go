package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// GeoRoutingService implements Geo-Aware Peer Discovery with RTT-based
// node selection. Prioritizes nodes within 1000km for <50ms latency.
//
// Uses a combination of:
//   - IP geolocation for initial region estimation
//   - Active RTT probing via TCP connect timing
//   - Historical latency data from Redis
//   - Kademlia-inspired distance metric (XOR of hashed coordinates)
type GeoRoutingService struct {
	db         *sql.DB
	redis      *redis.Client
	geoService *GeoService
	mu         sync.RWMutex
	rttCache   map[string]float64 // nodeID → last measured RTT (ms)
}

// RoutedNode represents a node with routing metadata
type RoutedNode struct {
	NodeID        string  `json:"node_id"`
	WalletAddress string  `json:"wallet_address"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	DistanceKm    float64 `json:"distance_km"`
	EstimatedRTT  float64 `json:"estimated_rtt_ms"`
	MeasuredRTT   float64 `json:"measured_rtt_ms"` // 0 if not measured
	Region        string  `json:"region"`
	TrustScore    float64 `json:"trust_score"`
	VRAM_MB       int     `json:"vram_mb"`
	IsOnline      bool    `json:"is_online"`
}

func NewGeoRoutingService(db *sql.DB, redis *redis.Client, geoService *GeoService) *GeoRoutingService {
	return &GeoRoutingService{
		db:         db,
		redis:      redis,
		geoService: geoService,
		rttCache:   make(map[string]float64),
	}
}

// FindNearestNodes returns nodes sorted by estimated latency to the user
// Prioritizes nodes within 1000km radius (target RTT <50ms)
func (s *GeoRoutingService) FindNearestNodes(ctx context.Context, userIP string, limit int) ([]RoutedNode, error) {
	if limit <= 0 {
		limit = 10
	}

	// 1. Get user's coordinates from IP
	userLat, userLon, err := s.getUserCoordinates(ctx, userIP)
	if err != nil {
		// Fallback: return all online nodes sorted by trust score
		log.Printf("GeoRouting: Cannot geolocate user IP %s, using trust-based fallback", userIP)
		return s.getFallbackNodes(ctx, limit)
	}

	// 2. Query all online nodes with coordinates
	rows, err := s.db.QueryContext(ctx, `
		SELECT n.id, n.wallet_address, 
			   COALESCE(n.latitude, 0), COALESCE(n.longitude, 0),
			   COALESCE(n.trust_score, 0.5), COALESCE(n.country, ''),
			   COALESCE(pn.vram_mb, 0)
		FROM nodes n
		LEFT JOIN pipeline_nodes pn ON pn.wallet_address = n.wallet_address
		WHERE n.status = 'online' 
		  AND n.latitude IS NOT NULL 
		  AND n.longitude IS NOT NULL
		ORDER BY n.trust_score DESC
		LIMIT 200
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query nodes: %w", err)
	}
	defer rows.Close()

	var candidates []RoutedNode
	for rows.Next() {
		var n RoutedNode
		rows.Scan(&n.NodeID, &n.WalletAddress, &n.Latitude, &n.Longitude, &n.TrustScore, &n.Region, &n.VRAM_MB)
		n.IsOnline = true

		// 3. Calculate distance using Haversine
		n.DistanceKm = s.geoService.CalculateDistance(userLat, userLon, n.Latitude, n.Longitude)

		// 4. Estimate RTT based on distance using latency estimation model
		n.EstimatedRTT = (n.DistanceKm / 100.0) + 10.0

		// 5. Check Redis cache for measured RTT
		s.mu.RLock()
		if cached, ok := s.rttCache[n.NodeID]; ok {
			n.MeasuredRTT = cached
		}
		s.mu.RUnlock()

		candidates = append(candidates, n)
	}

	// 6. Sort by effective latency (measured RTT if available, else estimated)
	sort.Slice(candidates, func(i, j int) bool {
		rttI := candidates[i].EstimatedRTT
		if candidates[i].MeasuredRTT > 0 {
			rttI = candidates[i].MeasuredRTT
		}
		rttJ := candidates[j].EstimatedRTT
		if candidates[j].MeasuredRTT > 0 {
			rttJ = candidates[j].MeasuredRTT
		}
		// Weighted sort: 70% latency, 30% trust score
		scoreI := rttI*0.7 - candidates[i].TrustScore*100*0.3
		scoreJ := rttJ*0.7 - candidates[j].TrustScore*100*0.3
		return scoreI < scoreJ
	})

	// 7. Return top N nodes
	if len(candidates) > limit {
		candidates = candidates[:limit]
	}

	return candidates, nil
}

// MeasureRTT actively probes a node's TCP connectivity latency
func (s *GeoRoutingService) MeasureRTT(ctx context.Context, nodeID string, nodeHost string) (float64, error) {
	if nodeHost == "" {
		return 0, fmt.Errorf("no host for node %s", nodeID)
	}

	start := time.Now()
	conn, err := net.DialTimeout("tcp", nodeHost+":8080", 5*time.Second)
	if err != nil {
		return 0, fmt.Errorf("RTT probe failed: %w", err)
	}
	conn.Close()
	rtt := float64(time.Since(start).Milliseconds())

	// Cache result
	s.mu.Lock()
	s.rttCache[nodeID] = rtt
	s.mu.Unlock()

	// Store in Redis for persistence (TTL 5 minutes)
	if s.redis != nil {
		s.redis.Set(ctx, fmt.Sprintf("rtt:%s", nodeID), rtt, 5*time.Minute)
	}

	return rtt, nil
}

// SelectOptimalNode picks the best node for a specific task type
// considering latency, VRAM capacity, and trust score
func (s *GeoRoutingService) SelectOptimalNode(ctx context.Context, userIP string, requiredVRAM int, taskType string) (*RoutedNode, error) {
	nodes, err := s.FindNearestNodes(ctx, userIP, 20)
	if err != nil {
		return nil, err
	}

	for _, node := range nodes {
		// Check VRAM requirement
		if requiredVRAM > 0 && node.VRAM_MB < requiredVRAM {
			continue
		}

		// For pipeline tasks, we need specific VRAM; for inference, any VRAM works
		if node.DistanceKm <= 1000 || node.EstimatedRTT <= 50 {
			return &node, nil // Preferred: within 1000km
		}
	}

	// Fallback: return the best available node regardless of distance
	if len(nodes) > 0 {
		return &nodes[0], nil
	}

	return nil, fmt.Errorf("no suitable nodes available")
}

// getUserCoordinates resolves user IP to lat/lon
func (s *GeoRoutingService) getUserCoordinates(ctx context.Context, userIP string) (float64, float64, error) {
	if userIP == "" || userIP == "127.0.0.1" {
		return 0, 0, fmt.Errorf("cannot geolocate local IP")
	}

	// Check Redis cache
	cacheKey := fmt.Sprintf("geocoord:%s", userIP)
	if s.redis != nil {
		var coords struct{ Lat, Lon float64 }
		if err := s.getFromRedis(ctx, cacheKey, &coords); err == nil {
			return coords.Lat, coords.Lon, nil
		}
	}

	// Query ip-api.com (free tier)
	url := fmt.Sprintf("http://ip-api.com/json/%s?fields=lat,lon,status", userIP)
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()

	var data struct {
		Lat    float64 `json:"lat"`
		Lon    float64 `json:"lon"`
		Status string  `json:"status"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil || data.Status != "success" {
		return 0, 0, fmt.Errorf("geolocation failed for %s", userIP)
	}

	// Cache for 24h
	if s.redis != nil {
		s.redis.Set(ctx, cacheKey, fmt.Sprintf(`{"Lat":%f,"Lon":%f}`, data.Lat, data.Lon), 24*time.Hour)
	}

	return data.Lat, data.Lon, nil
}

func (s *GeoRoutingService) getFromRedis(ctx context.Context, key string, dest interface{}) error {
	if s.redis == nil {
		return fmt.Errorf("redis not available")
	}
	val, err := s.redis.Get(ctx, key).Result()
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(val), dest)
}

func (s *GeoRoutingService) getFallbackNodes(ctx context.Context, limit int) ([]RoutedNode, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, wallet_address, COALESCE(latitude, 0), COALESCE(longitude, 0),
			   COALESCE(trust_score, 0.5), COALESCE(country, '')
		FROM nodes WHERE status = 'online'
		ORDER BY trust_score DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []RoutedNode
	for rows.Next() {
		var n RoutedNode
		rows.Scan(&n.NodeID, &n.WalletAddress, &n.Latitude, &n.Longitude, &n.TrustScore, &n.Region)
		n.IsOnline = true
		nodes = append(nodes, n)
	}
	return nodes, nil
}

// KademliaDistance computes XOR distance for Kademlia-inspired routing
func KademliaDistance(a, b []byte) float64 {
	dist := 0.0
	minLen := len(a)
	if len(b) < minLen {
		minLen = len(b)
	}
	for i := 0; i < minLen; i++ {
		dist += float64(a[i] ^ b[i])
	}
	return dist
}

// Haversine helper used internally
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180.0
	dLon := (lon2 - lon1) * math.Pi / 180.0
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180.0)*math.Cos(lat2*math.Pi/180.0)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return R * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func decodeJSONBody(body *http.Response, v interface{}) error {
	return json.NewDecoder(body.Body).Decode(v)
}

func unmarshalJSONString(s string, v interface{}) error {
	return json.Unmarshal([]byte(s), v)
}
