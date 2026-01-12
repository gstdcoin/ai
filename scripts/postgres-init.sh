#!/bin/bash
set -e

# PostgreSQL initialization script
# This runs on first container start to ensure database is properly initialized

echo "PostgreSQL initialization script started"

# Wait for PostgreSQL to be ready
until pg_isready -U postgres; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 1
done

echo "PostgreSQL is ready"


