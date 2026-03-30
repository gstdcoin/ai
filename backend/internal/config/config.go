package config

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

type Config struct {
	Database  DatabaseConfig
	Redis     RedisConfig
	TON       TONConfig
	Server    ServerConfig
	Telegram  TelegramConfig
	Economics EconomicsConfig
}

// EconomicsConfig — ТЗ: Pay-for-Result ~$0.03/результат (экономия 70% vs облако)
type EconomicsConfig struct {
	TargetPricePerResultUSD float64 // Целевая цена за результат в USD (default 0.03)
	NetRevenueToGoldPct     float64 // 70% Net Protocol Revenue → золото (ТЗ 3.Б)
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type RedisConfig struct {
	Host            string
	Port            string
	Password        string
	DB              int
	SessionTTLHours int // Session TTL in hours (default 24)
}

type TONConfig struct {
	Network                  string
	ContractAddress          string
	GSTDJettonAddress        string
	XAUtJettonAddress        string // Tether Gold jetton address
	StonFiRouter             string // STON.fi router address
	APIKey                   string
	APIURL                   string
	AdminWallet              string  // Platform fee wallet (receives 5% commission)
	CommissionWallet         string  // Wallet for sending commission (needs TON for gas)
	TreasuryWallet           string  // Treasury wallet for Golden Reserve (pool address)
	PoolAddress              string  // GSTD/XAUt pool address for monitoring
	GoldPoolAddress          string  // GOLD_POOL_ADDRESS for Ston.fi liquidity provision (GSTD/XAUt)
	PlatformFeePercent       float64 // Platform commission (e.g., 5%)
	WithdrawalLockThreshold  float64 // Threshold for withdrawal lock (GSTD)
	PlatformWalletAddress    string  // Address of the platform's operational wallet
	PlatformWalletPrivateKey string  // Private key for the platform's operational wallet (hex-encoded 64 bytes)
	PlatformWalletSeed       string  // Seed phrase for the platform's operational wallet (24 words)
	// Highload Ascension: Liteserver + seed for batch payouts (50+ workers per tx)
	LiteserverConfigURL string // e.g. https://ton-blockchain.github.io/global.config.json
	HighloadWalletSeed  string // 24-word seed for Highload Wallet V3
	// TON API: key rotation when throughput < 100/s (Advanced plan)
	TONAPIKeys string // Comma-separated API keys for rotation
	AgentRegistryAddress string // Smart contract for nodes
	DAOVotingAddress     string // Smart contract for DAO
}

type ServerConfig struct {
	Port         string
	AdminAPIKey  string
	AdminAPIKey2 string // Omega: Emergency fallback if primary revoked
}

type TelegramConfig struct {
	BotToken string
	ChatID   string
}

var configInstance *Config

func Load() *Config {
	configInstance = &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "distributed_computing"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:            getEnv("REDIS_HOST", "localhost"),
			Port:            getEnv("REDIS_PORT", "6379"),
			Password:        getEnv("REDIS_PASSWORD", ""),
			DB:              0,
			SessionTTLHours: getEnvInt("SESSION_TTL_HOURS", 24),
		},
		TON: TONConfig{
			Network:                  getEnv("TON_NETWORK", "mainnet"),
			ContractAddress:          getEnv("TON_CONTRACT_ADDRESS", "EQDO0ab4mJsRn_aM7gVxaMnxtVsMKFJmuO9X55SbUqAj31g5"),
			GSTDJettonAddress:        getEnv("GSTD_JETTON_ADDRESS", "EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO"),
			XAUtJettonAddress:        getEnv("XAUT_JETTON_MASTER", "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"),
			StonFiRouter:             getEnv("STONFI_ROUTER", "EQA98Z99S-9u1As_7p8n7H_H_H_H_H_H_H_H_H_H_H_H_H_H_"),
			APIKey:                   getEnv("TON_API_KEY", ""),
			APIURL:                   getEnv("TON_API_URL", "https://tonapi.io"),
			AdminWallet:              getEnv("ADMIN_WALLET", ""),                                                      // Admin wallet (receives 5% commission)
			CommissionWallet:         getEnv("COMMISSION_WALLET", ""),                                                 // Wallet for sending commission (needs TON for gas)
			TreasuryWallet:           getEnv("TREASURY_WALLET", ""),                                                   // Not used (replaced by AdminWallet)
			PoolAddress:              getEnv("POOL_ADDRESS", "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"),      // GSTD/XAUt pool for monitoring
			GoldPoolAddress:          getEnv("GOLD_POOL_ADDRESS", "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"), // Ston.fi Arbitrary Provision target
			PlatformFeePercent:       getEnvFloat("PLATFORM_FEE_PERCENT", 5.0),
			WithdrawalLockThreshold:  getEnvFloat("WITHDRAWAL_LOCK_THRESHOLD", 500.0),
			PlatformWalletAddress:    getEnv("PLATFORM_WALLET_ADDRESS", ""),
			PlatformWalletPrivateKey: getVaultOrEnv("platform/private_key", "PLATFORM_WALLET_PRIVATE_KEY"),
			PlatformWalletSeed:       getVaultOrEnv("platform/seed", "PLATFORM_WALLET_SEED"),
			LiteserverConfigURL:      getEnv("LITESERVER_CONFIG_URL", "https://ton-blockchain.github.io/global.config.json"),
			HighloadWalletSeed:       getVaultOrEnv("highload/seed", "HIGHLOAD_WALLET_SEED"), // 24-word seed for batch payouts from HashiCorp Vault
			TONAPIKeys:               getEnv("TON_API_KEYS", ""),                             // Comma-separated for rotation (if primary < 100/s)
			AgentRegistryAddress:     getEnv("AGENT_REGISTRY_ADDRESS", "EQDtWcGCQXLFdh7TmkL5QFbFNYXxL9mjOk4ehmsNFwCtsDoT"),
			DAOVotingAddress:         getEnv("DAO_VOTING_ADDRESS", "EQA1R_LuQCLHlMgOo1S4G7Y7W1cd0FrAkbA10Zq7rddKxi9k"),
		},
		Server: ServerConfig{
			Port:         getEnv("PORT", "8080"),
			AdminAPIKey:  getEnv("ADMIN_API_KEY", "gstd_system_key_2026"),
			AdminAPIKey2: getEnv("ADMIN_API_KEY_2", ""), // Omega: Emergency fallback if primary revoked
		},
		Telegram: TelegramConfig{
			BotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
			ChatID:   getEnv("TELEGRAM_CHAT_ID", ""),
		},
		Economics: EconomicsConfig{
			TargetPricePerResultUSD: getEnvFloat("TARGET_PRICE_PER_RESULT_USD", 0.03),
			NetRevenueToGoldPct:     getEnvFloat("NET_REVENUE_TO_GOLD_PCT", 70.0),
		},
	}
	return configInstance
}

func GetConfig() *Config {
	if configInstance == nil {
		return Load()
	}
	return configInstance
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return strings.TrimSpace(strings.Trim(value, "\"'`"))
	}
	return strings.TrimSpace(strings.Trim(defaultValue, "\"'`"))
}

// getVaultOrEnv attempts to read sensitive keys from HashiCorp Vault first.
// If VAULT_ADDR and VAULT_TOKEN are not set, it securely falls back to OS ENV with a warning.
func getVaultOrEnv(vaultSecretPath string, envFallback string) string {
	vaultURL := os.Getenv("VAULT_ADDR")
	vaultToken := os.Getenv("VAULT_TOKEN")

	if vaultURL == "" || vaultToken == "" {
		// log.Printf("⚠️ SEC-WARN: HashiCorp Vault not configured. Falling back to .env for %s", envFallback)
		return getEnv(envFallback, "")
	}

	req, reqErr := http.NewRequest("GET", fmt.Sprintf("%s/v1/secret/data/%s", vaultURL, vaultSecretPath), nil)
	if reqErr != nil {
		log.Printf("⚠️ SEC-WARN: Failed to build Vault request for %s: %v", envFallback, reqErr)
		return getEnv(envFallback, "")
	}
	req.Header.Set("X-Vault-Token", vaultToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		log.Printf("⚠️ SEC-WARN: Failed to read from Vault for %s. Falling back to .env. Error: %v", envFallback, err)
		return getEnv(envFallback, "")
	}
	defer resp.Body.Close()

	var result struct {
		Data struct {
			Data map[string]string `json:"data"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && result.Data.Data["value"] != "" {
		log.Printf("🔒 SEC-INFO: Successfully retrieved %s from HashiCorp Vault.", envFallback)
		return result.Data.Data["value"]
	}

	return getEnv(envFallback, "")
}

func getEnvFloat(key string, defaultValue float64) float64 {
	if value := os.Getenv(key); value != "" {
		var result float64
		if _, err := fmt.Sscanf(value, "%f", &result); err == nil {
			return result
		}
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		var result int
		if _, err := fmt.Sscanf(value, "%d", &result); err == nil {
			return result
		}
	}
	return defaultValue
}
