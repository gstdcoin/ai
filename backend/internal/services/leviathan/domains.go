package leviathan

import "strings"

// Omni-Source Validation & Hyper-Learning: Domain taxonomy for Cross-Domain Check.
// Domains: Code, Science, Finance, Crypto, Social. Knowledge is absorbed only when 2+ domains confirm.

const (
	DomainCode    = "code"    // GitHub, HuggingFace, Stack Overflow
	DomainScience = "science" // ArXiv, PubMed, CORE
	DomainFinance = "finance" // Pyth, Yahoo Finance, FRED
	DomainCrypto  = "crypto"  // DEX, TON Center, Whale Alert
	DomainMarket  = "market"  // Polymarket (historical, price)
	DomainSocial  = "social"  // RSS, GNews, Google Trends, CryptoPanic
)

// SourceToDomain maps source name to domain. Hard Data (Code/Science/Finance/Crypto) > Social.
func SourceToDomain(source string) string {
	s := strings.ToLower(source)
	switch {
	case strings.Contains(s, "github") || strings.Contains(s, "huggingface") || strings.Contains(s, "stackoverflow"):
		return DomainCode
	case strings.Contains(s, "arxiv") || strings.Contains(s, "pubmed") || strings.Contains(s, "core"):
		return DomainScience
	case strings.Contains(s, "pyth") || strings.Contains(s, "yahoo") || strings.Contains(s, "fred"):
		return DomainFinance
	case strings.Contains(s, "dedust") || strings.Contains(s, "uniswap") || strings.Contains(s, "ton") || strings.Contains(s, "whale"):
		return DomainCrypto
	case strings.Contains(s, "polymarket") || strings.Contains(s, "gamma"):
		return DomainMarket
	default:
		return DomainSocial // GNews, RSS, CryptoPanic (aggregated), etc.
	}
}

// IsHardData returns true for Code, Science, Finance, Crypto (not Social/Media).
func IsHardData(domain string) bool {
	return domain == DomainCode || domain == DomainScience || domain == DomainFinance || domain == DomainCrypto
}
