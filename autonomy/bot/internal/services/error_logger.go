package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// ErrorLogger provides centralized error logging to database
type ErrorLogger struct {
	db *sql.DB
}

// NewErrorLogger creates a new error logger
func NewErrorLogger(db *sql.DB) *ErrorLogger {
	return &ErrorLogger{
		db: db,
	}
}

// ErrorSeverity represents the severity level of an error
type ErrorSeverity string

const (
	SeverityInfo     ErrorSeverity = "info"
	SeverityWarning  ErrorSeverity = "warning"
	SeverityError    ErrorSeverity = "error"
	SeverityCritical ErrorSeverity = "critical"
)

// Log logs an error with a simple signature (alias for LogError for convenience)
func (el *ErrorLogger) Log(ctx context.Context, errorType string, message string, severity ErrorSeverity, extras map[string]interface{}) error {
	var err error
	if message != "" {
		err = fmt.Errorf("%s", message)
	}
	return el.LogError(ctx, errorType, err, severity, extras)
}

// LogError logs an error to the database
func (el *ErrorLogger) LogError(ctx context.Context, errorType string, err error, severity ErrorSeverity, contextData map[string]interface{}) error {
	// Ensure error_logs table exists
	if err := el.ensureTableExists(ctx); err != nil {
		// If table creation fails, log to console as fallback
		log.Printf("ErrorLogger: Failed to ensure error_logs table exists: %v", err)
		return err
	}

	errorMessage := ""
	if err != nil {
		errorMessage = err.Error()
	}

	// Serialize context data to JSON
	contextJSON := "{}"
	if contextData != nil {
		contextBytes, err := json.Marshal(contextData)
		if err == nil {
			contextJSON = string(contextBytes)
		}
	}

	// Insert error into database
	_, dbErr := el.db.ExecContext(ctx, `
		INSERT INTO error_logs (
			error_type, error_message, context, severity, created_at
		) VALUES ($1, $2, $3::jsonb, $4, NOW())
	`, errorType, errorMessage, contextJSON, string(severity))

	if dbErr != nil {
		// Fallback to console logging if DB insert fails
		log.Printf("ErrorLogger: Failed to insert error into database: %v (original error: %v)", dbErr, err)
		return dbErr
	}

	return nil
}

// LogCritical logs a critical error
func (el *ErrorLogger) LogCritical(ctx context.Context, errorType string, err error, contextData map[string]interface{}) error {
	return el.LogError(ctx, errorType, err, SeverityCritical, contextData)
}

// LogErrorLevel logs an error with specified severity
func (el *ErrorLogger) LogErrorLevel(ctx context.Context, errorType string, err error, severity ErrorSeverity, contextData map[string]interface{}) error {
	return el.LogError(ctx, errorType, err, severity, contextData)
}

// LogInternalError logs an internal error to the database
// This is a convenience method that matches the requested signature
func (el *ErrorLogger) LogInternalError(ctx context.Context, errorType string, err error, severity ErrorSeverity) error {
	return el.LogError(ctx, errorType, err, severity, nil)
}

// ensureTableExists creates the error_logs table if it doesn't exist
func (el *ErrorLogger) ensureTableExists(ctx context.Context) error {
	_, err := el.db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS error_logs (
			id SERIAL PRIMARY KEY,
			error_type VARCHAR(50) NOT NULL,
			error_message TEXT NOT NULL,
			stack_trace TEXT,
			context JSONB,
			severity VARCHAR(20) NOT NULL DEFAULT 'error',
			created_at TIMESTAMP NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create error_logs table: %w", err)
	}

	// Create indexes for better query performance
	_, err = el.db.ExecContext(ctx, `
		CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity);
		CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
	`)
	if err != nil {
		// Index creation failure is not critical, log but don't fail
		log.Printf("ErrorLogger: Failed to create indexes: %v", err)
	}

	return nil
}

// GetRecentErrors retrieves recent errors from the database
func (el *ErrorLogger) GetRecentErrors(ctx context.Context, limit int, severity *ErrorSeverity) ([]map[string]interface{}, error) {
	var query string
	var args []interface{}

	if severity != nil {
		query = `
			SELECT id, error_type, error_message, context, severity, created_at
			FROM error_logs
			WHERE severity = $1
			ORDER BY created_at DESC
			LIMIT $2
		`
		args = []interface{}{string(*severity), limit}
	} else {
		query = `
			SELECT id, error_type, error_message, context, severity, created_at
			FROM error_logs
			ORDER BY created_at DESC
			LIMIT $1
		`
		args = []interface{}{limit}
	}

	rows, err := el.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query error logs: %w", err)
	}
	defer rows.Close()

	var errors []map[string]interface{}
	for rows.Next() {
		var id int
		var errorType, errorMessage, contextJSON, severityStr string
		var createdAt time.Time

		if err := rows.Scan(&id, &errorType, &errorMessage, &contextJSON, &severityStr, &createdAt); err != nil {
			continue
		}

		var contextData map[string]interface{}
		if contextJSON != "" {
			json.Unmarshal([]byte(contextJSON), &contextData)
		}

		errors = append(errors, map[string]interface{}{
			"id":            id,
			"error_type":    errorType,
			"error_message": errorMessage,
			"context":       contextData,
			"severity":      severityStr,
			"created_at":    createdAt,
		})
	}

	return errors, nil
}
