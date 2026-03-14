package database

import (
	"database/sql"
	"fmt"
	"time"

	"distributed-computing-platform/internal/config"

	_ "github.com/lib/pq"
)

func NewConnection(cfg config.DatabaseConfig) (*sql.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Connection pool: 4 replicas × 20 = 80 max (within PG default 100)
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute) // recycle connections to avoid stale after PG restart
	db.SetConnMaxIdleTime(5 * time.Minute)  // reclaim idle connections

	return db, nil
}
