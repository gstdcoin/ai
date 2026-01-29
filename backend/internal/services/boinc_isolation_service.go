package services

import (
	"fmt"
	"net"
	"strings"
)

// BoincIsolationService provides security configuration for worker execution
type BoincIsolationService struct {
	// Map of project URLs to their server IPs for whitelisting
	projectWhitelist map[string][]string
}

func NewBoincIsolationService() *BoincIsolationService {
	return &BoincIsolationService{
		projectWhitelist: map[string][]string{
			"https://einstein.phys.uwm.edu": {"129.89.61.0/24"}, // Einstein@Home example
			"https://worldcommunitygrid.org": {"129.33.20.0/24"}, // WCG example
		},
	}
}

// GetIsolationConfig returns the Docker run command template with isolation settings
func (s *BoincIsolationService) GetIsolationConfig(projectURL string) (map[string]interface{}, error) {
	// 1. Resolve Project IPs if not in whitelist
	ips, ok := s.projectWhitelist[projectURL]
	if !ok {
		// Heuristic: try to resolve the domain
		domain := strings.TrimPrefix(projectURL, "https://")
		domain = strings.Split(domain, "/")[0]
		resolvedIPs, err := net.LookupIP(domain)
		if err == nil && len(resolvedIPs) > 0 {
			for _, ip := range resolvedIPs {
				ips = append(ips, ip.String())
			}
		} else {
			// Fail-safe: empty whitelist allows NO network if not specified
			ips = []string{}
		}
	}

	// 2. Define resource limits
	cpuLimit := "0.5" // 50% of one core
	memLimit := "512m"

	// 3. Construct Docker command segments
	networkRules := ""
	for _, ip := range ips {
		networkRules += fmt.Sprintf("--add-host project-server:%s ", ip)
	}

	return map[string]interface{}{
		"isolation_type": "docker",
		"user":           "boinc_worker", // Non-root
		"cpu_limit":      cpuLimit,
		"memory_limit":   memLimit,
		"network_mode":   "none", // Default to none, whitelist implemented via iptables or proxy
		"whitelisted_ips": ips,
		"security_opts": []string{
			"no-new-privileges",
			"seccomp=unconfined", // Or a specific profile
		},
		"docker_cmd": fmt.Sprintf("docker run --rm --user 1000:1000 --cpus %s --memory %s --network none %s boinc/client", cpuLimit, memLimit, networkRules),
	}, nil
}
