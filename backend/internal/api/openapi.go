package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// GetOpenAPISpec returns OpenAPI 3.0 specification
func GetOpenAPISpec() gin.HandlerFunc {
	return func(c *gin.Context) {
		spec := `{
  "openapi": "3.0.0",
  "info": {
    "title": "GSTD Platform API",
    "version": "1.0.0",
    "description": "API for GSTD (Global System for Trusted Distributed Computing) Platform",
    "contact": {
      "name": "GSTD Support",
      "url": "https://app.gstdtoken.com"
    }
  },
  "servers": [
    {
      "url": "https://app.gstdtoken.com/api/v1",
      "description": "Production server"
    },
    {
      "url": "http://localhost:8080/api/v1",
      "description": "Development server"
    }
  ],
  "tags": [
    {
      "name": "tasks",
      "description": "Task management endpoints"
    },
    {
      "name": "devices",
      "description": "Device management endpoints"
    },
    {
      "name": "payments",
      "description": "Payment and payout endpoints"
    },
    {
      "name": "stats",
      "description": "Statistics endpoints"
    },
    {
      "name": "health",
      "description": "Health check endpoints"
    }
  ],
  "paths": {
    "/health": {
      "get": {
        "tags": ["health"],
        "summary": "Health check",
        "description": "Returns the health status of the platform",
        "responses": {
          "200": {
            "description": "Health status",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/HealthResponse"
                }
              }
            }
          }
        }
      }
    },
    "/metrics": {
      "get": {
        "tags": ["health"],
        "summary": "Prometheus metrics",
        "description": "Returns Prometheus-compatible metrics",
        "responses": {
          "200": {
            "description": "Metrics in Prometheus format",
            "content": {
              "text/plain": {
                "schema": {
                  "type": "string"
                }
              }
            }
          }
        }
      }
    },
    "/tasks": {
      "get": {
        "tags": ["tasks"],
        "summary": "Get tasks",
        "description": "Retrieve list of tasks",
        "parameters": [
          {
            "name": "requester_address",
            "in": "query",
            "schema": {
              "type": "string"
            },
            "description": "Filter by requester address"
          }
        ],
        "responses": {
          "200": {
            "description": "List of tasks",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "tasks": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Task"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "post": {
        "tags": ["tasks"],
        "summary": "Create task",
        "description": "Create a new computational task",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/CreateTaskRequest"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Task created",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Task"
                }
              }
            }
          },
          "400": {
            "description": "Bad request",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Error"
                }
              }
            }
          }
        }
      }
    },
    "/tasks/{id}": {
      "get": {
        "tags": ["tasks"],
        "summary": "Get task by ID",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "format": "uuid"
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Task details",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Task"
                }
              }
            }
          },
          "404": {
            "description": "Task not found"
          }
        }
      }
    },
    "/stats": {
      "get": {
        "tags": ["stats"],
        "summary": "Get platform statistics",
        "responses": {
          "200": {
            "description": "Platform statistics",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/Stats"
                }
              }
            }
          }
        }
      }
    },
    "/stats/public": {
      "get": {
        "tags": ["stats"],
        "summary": "Get public statistics",
        "responses": {
          "200": {
            "description": "Public platform statistics",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/PublicStats"
                }
              }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "HealthResponse": {
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": ["healthy", "unhealthy"]
          },
          "database": {
            "type": "object",
            "properties": {
              "status": {
                "type": "string"
              }
            }
          },
          "contract": {
            "type": "object",
            "properties": {
              "address": {
                "type": "string"
              },
              "balance_gstd": {
                "type": "number"
              },
              "status": {
                "type": "string"
              }
            }
          },
          "timestamp": {
            "type": "integer"
          }
        }
      },
      "Task": {
        "type": "object",
        "properties": {
          "task_id": {
            "type": "string",
            "format": "uuid"
          },
          "task_type": {
            "type": "string"
          },
          "status": {
            "type": "string",
            "enum": ["pending", "assigned", "executing", "validating", "completed", "failed"]
          },
          "labor_compensation_gstd": {
            "type": "number"
          },
          "created_at": {
            "type": "string",
            "format": "date-time"
          }
        }
      },
      "CreateTaskRequest": {
        "type": "object",
        "required": ["task_type", "operation", "labor_compensation_gstd"],
        "properties": {
          "task_type": {
            "type": "string"
          },
          "operation": {
            "type": "string"
          },
          "model": {
            "type": "string"
          },
          "input_source": {
            "type": "string"
          },
          "labor_compensation_gstd": {
            "type": "number",
            "minimum": 0.001
          },
          "validation_method": {
            "type": "string"
          },
          "payload": {
            "type": "string"
          }
        }
      },
      "Stats": {
        "type": "object",
        "properties": {
          "total_tasks": {
            "type": "integer"
          },
          "completed_tasks": {
            "type": "integer"
          },
          "active_devices": {
            "type": "integer"
          }
        }
      },
      "PublicStats": {
        "type": "object",
        "properties": {
          "total_tasks_completed": {
            "type": "integer"
          },
          "total_workers_paid": {
            "type": "integer"
          },
          "system_status": {
            "type": "string"
          }
        }
      },
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          }
        }
      }
    },
    "securitySchemes": {
      "WalletAuth": {
        "type": "apiKey",
        "in": "header",
        "name": "X-Wallet-Address",
        "description": "TON wallet address for authentication"
      }
    }
  },
  "security": [
    {
      "WalletAuth": []
    }
  ]
}`
		c.Data(http.StatusOK, "application/json", []byte(spec))
	}
}
