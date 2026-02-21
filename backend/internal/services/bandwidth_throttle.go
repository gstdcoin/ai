package services

import (
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

// Bandwidth Throttling: Limit external download speed to 30% of server channel
// so it doesn't interfere with main inference. Internal node-to-node transfers are unrestricted.

const (
	defaultServerBandwidthBps = 100 * 1024 * 1024 // 100 Mbps
	externalBandwidthPct      = 0.30               // 30%
)

var (
	externalBandwidthBps int64 = int64(float64(defaultServerBandwidthBps) * externalBandwidthPct)
	throttleOnce         sync.Once
)

// SetExternalBandwidthLimit sets the max bytes/sec for external downloads (from env or config)
func SetExternalBandwidthLimit(bps int64) {
	if bps > 0 {
		externalBandwidthBps = bps
		log.Printf("[Bandwidth Throttle] External limit: %d bytes/s (30%% of channel)", externalBandwidthBps)
	}
}

// throttledTransport wraps HTTP responses with rate-limited reads
type throttledTransport struct {
	base    http.RoundTripper
	limiter *rateLimiter
}

type rateLimiter struct {
	bytesPerSec int64
	mu          sync.Mutex
	lastTime    time.Time
	bytesLeft   int64
}

func newRateLimiter(bps int64) *rateLimiter {
	if bps <= 0 {
		bps = externalBandwidthBps
	}
	return &rateLimiter{
		bytesPerSec: bps,
		lastTime:    time.Now(),
		bytesLeft:   bps,
	}
}

func (r *rateLimiter) wait(n int) {
	if n <= 0 {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	elapsed := now.Sub(r.lastTime).Seconds()
	r.bytesLeft += int64(elapsed * float64(r.bytesPerSec))
	if r.bytesLeft > r.bytesPerSec {
		r.bytesLeft = r.bytesPerSec
	}
	r.lastTime = now
	if r.bytesLeft >= int64(n) {
		r.bytesLeft -= int64(n)
		return
	}
	need := int64(n) - r.bytesLeft
	sleepSec := float64(need) / float64(r.bytesPerSec)
	r.bytesLeft = 0
	if sleepSec > 0 {
		r.mu.Unlock()
		time.Sleep(time.Duration(sleepSec * float64(time.Second)))
		r.mu.Lock()
	}
	r.lastTime = time.Now()
}

type throttledReader struct {
	r       io.Reader
	limiter *rateLimiter
}

func (t *throttledReader) Read(p []byte) (n int, err error) {
	n, err = t.r.Read(p)
	if n > 0 {
		t.limiter.wait(n)
	}
	return n, err
}

// NewThrottledTransport returns an http.RoundTripper that limits response body read speed
func NewThrottledTransport(base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &throttledTransport{
		base:    base,
		limiter: newRateLimiter(externalBandwidthBps),
	}
}

func (t *throttledTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	resp, err := t.base.RoundTrip(req)
	if err != nil || resp == nil || resp.Body == nil {
		return resp, err
	}
	orig := resp.Body
	resp.Body = &throttledReadCloser{
		ReadCloser: orig,
		tr: throttledReader{r: orig, limiter: t.limiter},
	}
	return resp, nil
}

type throttledReadCloser struct {
	io.ReadCloser
	tr throttledReader
}

func (t *throttledReadCloser) Read(p []byte) (n int, err error) {
	return t.tr.Read(p)
}

// ThrottledHTTPClient returns an http.Client for external sources (HF, etc.) with 30% bandwidth cap
func ThrottledHTTPClient(timeout time.Duration) *http.Client {
	initBandwidthFromEnv()
	return &http.Client{
		Timeout:   timeout,
		Transport: NewThrottledTransport(http.DefaultTransport),
	}
}

func initBandwidthFromEnv() {
	throttleOnce.Do(func() {
		if s := getEnv("EXTERNAL_BANDWIDTH_MBPS", ""); s != "" {
			if v, err := strconv.ParseInt(s, 10, 64); err == nil && v > 0 {
				SetExternalBandwidthLimit(v * 1024 * 1024)
			}
		}
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
