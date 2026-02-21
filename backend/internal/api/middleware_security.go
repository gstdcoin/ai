package api

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// SanitizeError sanitizes error messages to prevent information leakage
func SanitizeError(err error) string {
	if err == nil {
		return "An error occurred"
	}

	errMsg := err.Error()
	
	// Remove file paths
	errMsg = strings.ReplaceAll(errMsg, "/home/", "***/")
	errMsg = strings.ReplaceAll(errMsg, "/app/", "***/")
	errMsg = strings.ReplaceAll(errMsg, "/var/", "***/")
	errMsg = strings.ReplaceAll(errMsg, "/tmp/", "***/")
	
	// Remove database connection strings
	if strings.Contains(errMsg, "postgresql://") || strings.Contains(errMsg, "redis://") {
		return "Connection error"
	}
	
	// Remove stack traces
	if idx := strings.Index(errMsg, "\n"); idx > 0 {
		errMsg = errMsg[:idx]
	}
	
	// Ascension: Ghost Admin — never leak secrets via errors
	sensitivePatterns := []string{
		"sql:", "database", "connection", "credentials", "secret", "key", "token",
		"telegram", "chat_id", "api_key", "admin_api", "bearer", "authorization",
		"password", "mnemonic", "private_key", "env.",
	}
	lower := strings.ToLower(errMsg)
	for _, pattern := range sensitivePatterns {
		if strings.Contains(lower, pattern) {
			return "Internal server error"
		}
	}
	
	return errMsg
}

// ErrorHandler middleware to sanitize all error responses
func ErrorHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		
		// Check for errors in response
		if len(c.Errors) > 0 {
			for _, err := range c.Errors {
				err.Meta = SanitizeError(err.Err)
			}
		}
	}
}

