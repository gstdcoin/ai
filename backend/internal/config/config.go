package config

import (
	"fmt"
	"os"
)

type Config struct {
	Database DatabaseConfig
	Redis    RedisConfig
	TON      TONConfig
	Server   ServerConfig
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
	Host     string
	Port     string
	Password string
	DB       int
}

type TONConfig struct {
	Network          string
	ContractAddress  string
	GSTDJettonAddress string
	XAUtJettonAddress string // Tether Gold jetton address
	StonFiRouter     string  // STON.fi router address
	APIKey           string
	APIURL           string
	AdminWallet      string // Platform fee wallet (receives 5% commission)
	CommissionWallet string // Wallet for sending commission (needs TON for gas)
	TreasuryWallet   string // Treasury wallet for Golden Reserve (pool address)
	PoolAddress      string // GSTD/XAUt pool address for monitoring
	PlatformFeePercent float64 // Platform commission (e.g., 5%)
	WithdrawalLockThreshold float64 // Threshold for withdrawal lock (GSTD)
	PlatformWalletAddress string // Address of the platform's operational wallet
	PlatformWalletPrivateKey string // Private key for the platform's operational wallet (hex-encoded 64 bytes)
	PlatformWalletSeed string // Seed phrase for the platform's operational wallet (24 words)
}

type ServerConfig struct {
	Port string
}

func Load() *Config {
	return &Config{
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", ""),
			DBName:   getEnv("DB_NAME", "distributed_computing"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Redis: RedisConfig{
			Host:     getEnv("REDIS_HOST", "localhost"),
			Port:     getEnv("REDIS_PORT", "6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
			DB:       0,
		},
		TON: TONConfig{
			Network:          getEnv("TON_NETWORK", "mainnet"),
			ContractAddress:  getEnv("TON_CONTRACT_ADDRESS", ""),
			GSTDJettonAddress: getEnv("GSTD_JETTON_ADDRESS", ""),
			XAUtJettonAddress: getEnv("XAUT_JETTON_MASTER", "EQCyD8v6khUUrce9BCvHOaBC9PrvlV9S7D5v67O80p444XAr"),
			StonFiRouter:     getEnv("STONFI_ROUTER", "EQA98Z99S-9u1As_7p8n7H_H_H_H_H_H_H_H_H_H_H_H_H_H_"),
			APIKey:           getEnv("TON_API_KEY", ""),
			APIURL:           getEnv("TON_API_URL", "https://tonapi.io"),
			AdminWallet:      getEnv("ADMIN_WALLET", ""), // Admin wallet (receives 5% commission)
			CommissionWallet: getEnv("COMMISSION_WALLET", ""), // Wallet for sending commission (needs TON for gas)
			TreasuryWallet:   getEnv("TREASURY_WALLET", ""), // Not used (replaced by AdminWallet)
			PoolAddress:      getEnv("POOL_ADDRESS", "EQA--JXG8VSyBJmLMqb2J2t4Pya0TS9SXHh7vHh8Iez25sLp"), // GSTD/XAUt pool for monitoring
		PlatformFeePercent: getEnvFloat("PLATFORM_FEE_PERCENT", 5.0),
		WithdrawalLockThreshold: getEnvFloat("WITHDRAWAL_LOCK_THRESHOLD", 500.0),
		PlatformWalletAddress: getEnv("PLATFORM_WALLET_ADDRESS", ""), // Optional: only for admin operations
		PlatformWalletPrivateKey: getEnv("PLATFORM_WALLET_PRIVATE_KEY", ""), // Optional: not needed for pull-model
		PlatformWalletSeed: getEnv("PLATFORM_WALLET_SEED", ""), // Optional: not needed for pull-model
		},
		Server: ServerConfig{
			Port: getEnv("PORT", "8080"),
		},
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
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


