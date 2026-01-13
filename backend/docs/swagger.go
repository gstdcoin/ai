package docs

import "github.com/swaggo/swag"

const docTemplate = `{
    "swagger": "2.0",
    "info": {
        "description": "API documentation for GSTD Decentralized Physical Infrastructure Network Platform. This API enables distributed computing tasks, worker management, and TON blockchain integration.",
        "title": "GSTD DePIN Platform API",
        "contact": {
            "name": "GSTD Platform Support",
            "url": "https://app.gstdtoken.com",
            "email": "support@gstdtoken.com"
        },
        "license": {
            "name": "MIT",
            "url": "https://opensource.org/licenses/MIT"
        },
        "version": "1.0"
    },
    "host": "app.gstdtoken.com",
    "basePath": "/api/v1",
    "schemes": ["https", "http"],
    "securityDefinitions": {
        "SessionToken": {
            "type": "apiKey",
            "name": "X-Session-Token",
            "in": "header",
            "description": "Session token obtained from /users/login endpoint"
        }
    }
}`

// SwaggerInfo holds exported Swagger Info so clients can modify it
var SwaggerInfo = &swag.Spec{
	Version:          "1.0",
	Host:             "app.gstdtoken.com",
	BasePath:         "/api/v1",
	Schemes:          []string{"https", "http"},
	Title:            "GSTD DePIN Platform API",
	Description:      "API documentation for GSTD Decentralized Physical Infrastructure Network Platform. This API enables distributed computing tasks, worker management, and TON blockchain integration.",
	InfoInstanceName: "swagger",
	SwaggerTemplate:  docTemplate,
	LeftDelim:        "{{",
	RightDelim:       "}}",
}

func init() {
	swag.Register(SwaggerInfo.InstanceName(), SwaggerInfo)
}
