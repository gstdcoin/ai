# Multi-stage Dockerfile for GSTD Backend
# Stage 1: Build (h3-go requires CGO)
FROM golang:1.24-alpine AS builder

# Install build deps for CGO (h3-go uses C bindings)
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy go mod files first for better caching
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build with CGO for h3-go (geo indexing) — limit parallelism to avoid OOM
RUN CGO_ENABLED=1 GOOS=linux GOGC=50 go build -a -p 2 \
    -ldflags '-w -s' \
    -o server ./main.go

# Stage 2: Runtime
FROM alpine:3.19
# FROM gstd-backend:latest

USER root


# Install CA certificates for HTTPS requests, plus Docker CLI, Git, and Curl for Autonomous Operator
RUN apk --no-cache add ca-certificates docker-cli git tzdata curl && \
    addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations
COPY .env .env

# Change ownership
RUN chown -R appuser:appuser /app

# Run as root to allow PlatformOperator access to /var/run/docker.sock
USER root

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/v1/health || exit 1

# Run the server
CMD ["./server"]
