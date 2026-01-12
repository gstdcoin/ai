package services

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// MigrationService handles database migrations
type MigrationService struct {
	db *sql.DB
}

func NewMigrationService(db *sql.DB) *MigrationService {
	return &MigrationService{db: db}
}

// RunMigrations executes all pending migrations
func (m *MigrationService) RunMigrations(ctx context.Context, migrationsDir string) error {
	// Create migrations table if it doesn't exist
	if err := m.createMigrationsTable(ctx); err != nil {
		return fmt.Errorf("failed to create migrations table: %w", err)
	}

	// Get list of migration files
	migrations, err := m.getMigrationFiles(migrationsDir)
	if err != nil {
		return fmt.Errorf("failed to get migration files: %w", err)
	}

	// Get applied migrations
	applied, err := m.getAppliedMigrations(ctx)
	if err != nil {
		return fmt.Errorf("failed to get applied migrations: %w", err)
	}

	// Execute pending migrations
	for _, migration := range migrations {
		if applied[migration.Name] {
			log.Printf("Migration %s already applied, skipping", migration.Name)
			continue
		}

		log.Printf("Running migration: %s", migration.Name)
		if err := m.executeMigration(ctx, migration); err != nil {
			return fmt.Errorf("failed to execute migration %s: %w", migration.Name, err)
		}

		// Mark as applied
		if err := m.markMigrationApplied(ctx, migration.Name); err != nil {
			return fmt.Errorf("failed to mark migration %s as applied: %w", migration.Name, err)
		}

		log.Printf("✅ Migration %s completed", migration.Name)
	}

	return nil
}

type MigrationFile struct {
	Name string
	Path string
	SQL  string
}

func (m *MigrationService) getMigrationFiles(dir string) ([]MigrationFile, error) {
	var migrations []MigrationFile

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if d.IsDir() || !strings.HasSuffix(path, ".sql") {
			return nil
		}

		content, err := os.ReadFile(path)
		if err != nil {
			return err
		}

		migrations = append(migrations, MigrationFile{
			Name: filepath.Base(path),
			Path: path,
			SQL:  string(content),
		})

		return nil
	})

	if err != nil {
		return nil, err
	}

	// Sort by filename
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].Name < migrations[j].Name
	})

	return migrations, nil
}

func (m *MigrationService) createMigrationsTable(ctx context.Context) error {
	_, err := m.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			id SERIAL PRIMARY KEY,
			name VARCHAR(255) NOT NULL UNIQUE,
			applied_at TIMESTAMP NOT NULL DEFAULT NOW()
		)
	`)
	return err
}

func (m *MigrationService) getAppliedMigrations(ctx context.Context) (map[string]bool, error) {
	rows, err := m.db.QueryContext(ctx, "SELECT name FROM schema_migrations")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		applied[name] = true
	}

	return applied, nil
}

func (m *MigrationService) executeMigration(ctx context.Context, migration MigrationFile) error {
	// Execute migration in a transaction
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Execute SQL
	if _, err := tx.ExecContext(ctx, migration.SQL); err != nil {
		return fmt.Errorf("migration SQL error: %w", err)
	}

	return tx.Commit()
}

func (m *MigrationService) markMigrationApplied(ctx context.Context, name string) error {
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO schema_migrations (name, applied_at)
		VALUES ($1, NOW())
		ON CONFLICT (name) DO NOTHING
	`, name)
	return err
}

