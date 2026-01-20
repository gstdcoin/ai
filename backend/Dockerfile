# Multi-stage Dockerfile for GSTD Backend
# Stage 1: Build
# Stage 1: Build
FROM golang:1.24 AS builder

# Install build dependencies
# RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app

# Copy go mod files first for better caching
# COPY go.mod go.sum ./

# Download dependencies
# RUN go mod download

# Copy source code (including vendor directory)
COPY . .

# Ensure go.sum is up to date
# RUN go mod tidy

# Build the application
# CGO_ENABLED=0 for static binary, -ldflags for smaller binary
RUN CGO_ENABLED=0 GOOS=linux go build -mod=vendor -a -installsuffix cgo \
    -ldflags '-extldflags "-static" -w -s' \
    -o server ./main.go

# Stage 2: Runtime
FROM alpine:latest
# FROM gstd-backend:latest

USER root


# Install CA certificates for HTTPS requests
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations

# Change ownership
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/health || exit 1

# Run the server
CMD ["./server"]
