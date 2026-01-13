.PHONY: swagger swagger-install swagger-serve

# Install swag CLI tool
swagger-install:
	@echo "Installing swag..."
	@go install github.com/swaggo/swag/cmd/swag@latest

# Generate Swagger documentation
swagger:
	@echo "Generating Swagger documentation..."
	@swag init -g main.go -o ./docs --parseDependency --parseInternal
	@echo "✅ Swagger documentation generated in ./docs"

# Serve Swagger UI locally (requires backend to be running)
swagger-serve:
	@echo "Swagger UI will be available at: http://localhost:8080/api/v1/swagger/index.html"
	@echo "Make sure the backend server is running first!"
