package api

import (
	"database/sql"

	"github.com/gin-gonic/gin"
)

// RegisterViralRoutes handles viral analytics and community-driven endpoints.
func RegisterViralRoutes(v1 *gin.RouterGroup, dbConn *sql.DB) {
	// Genesis Launch: Viral Loop Analytics (public)
	v1.POST("/analytics/viral/share", RecordViralShare(dbConn))
	v1.POST("/analytics/viral/click", RecordViralClick(dbConn))
	v1.GET("/analytics/viral/community-favorite", GetCommunityFavorite(dbConn))
}
