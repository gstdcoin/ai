package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestAPIVersionMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(APIVersionMiddleware())
	
	router.GET("/test", func(c *gin.Context) {
		c.JSON(200, gin.H{"message": "test"})
	})
	
	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, APIVersion, w.Header().Get(APIVersionHeader))
}

func TestGetAPIVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/version", GetAPIVersion())
	
	req := httptest.NewRequest("GET", "/version", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Body.String(), "version")
}
