-- Migration v6.0: Users Table for Wallet Registration

-- Create users table if it doesn't exist
CREATE TABLE IF NOT EXISTS users (
    wallet_address VARCHAR(48) PRIMARY KEY,
    balance DECIMAL(18, 9) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index on wallet_address for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);

