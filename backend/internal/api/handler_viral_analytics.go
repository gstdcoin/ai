package api

import (
	"database/sql"

	"github.com/gin-gonic/gin"
)

// RecordViralShare records a share event (when user clicks Share button)
func RecordViralShare(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		modelID := c.Query("model")
		if modelID == "" {
			modelID = "qwen2.5-coder:7b"
		}
		if db != nil {
			_, _ = db.ExecContext(c.Request.Context(), `
				INSERT INTO viral_shares (model_id, share_count, updated_at)
				VALUES ($1, 1, NOW())
				ON CONFLICT (model_id) DO UPDATE SET
					share_count = viral_shares.share_count + 1,
					updated_at = NOW()
			`, modelID)
		}
		c.JSON(200, gin.H{"status": "recorded", "model": modelID})
	}
}

// RecordViralClick records a click when user lands via share link (?viral=1&model=xxx)
func RecordViralClick(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		modelID := c.Query("model")
		if modelID == "" {
			modelID = "unknown"
		}
		if db != nil {
			_, _ = db.ExecContext(c.Request.Context(), `
				INSERT INTO viral_shares (model_id, click_count, updated_at)
				VALUES ($1, 1, NOW())
				ON CONFLICT (model_id) DO UPDATE SET
					click_count = viral_shares.click_count + 1,
					updated_at = NOW()
			`, modelID)
		}
		c.JSON(200, gin.H{"status": "recorded", "model": modelID})
	}
}

// GetCommunityFavorite returns the model with most shares (Community Favorite)
func GetCommunityFavorite(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		if db == nil {
			c.JSON(200, gin.H{"community_favorite": "", "models": []interface{}{}})
			return
		}
		var favorite string
		_ = db.QueryRowContext(c.Request.Context(), `
			SELECT model_id FROM viral_shares ORDER BY share_count DESC, click_count DESC LIMIT 1
		`).Scan(&favorite)
		rows, _ := db.QueryContext(c.Request.Context(), `
			SELECT model_id, share_count, click_count FROM viral_shares ORDER BY share_count DESC LIMIT 10
		`)
		defer func() { _ = rows.Close() }()
		var models []gin.H
		for rows.Next() {
			var mid string
			var shares, clicks int
			_ = rows.Scan(&mid, &shares, &clicks)
			models = append(models, gin.H{"model_id": mid, "share_count": shares, "click_count": clicks})
		}
		c.JSON(200, gin.H{"community_favorite": favorite, "models": models})
	}
}
