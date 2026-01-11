#!/bin/bash
# Script to verify GitHub Secrets are properly configured

echo "=========================================="
echo "🔐 GitHub Secrets Verification"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "Required GitHub Secrets for CI/CD:"
echo ""

SECRETS=(
  "SSH_KEY:SSH private key for deployment"
  "SSH_HOST:Server IP address (82.115.48.228)"
  "SSH_USER:SSH username (ubuntu)"
  "SSH_PORT:SSH port (22 or empty)"
  "SSH_KNOWN_HOSTS:SSH known hosts fingerprint"
)

echo "📋 Checklist:"
echo ""
for secret_info in "${SECRETS[@]}"; do
  IFS=':' read -r secret_name secret_desc <<< "$secret_info"
  echo "  ☐ $secret_name - $secret_desc"
done

echo ""
echo "=========================================="
echo "📝 How to check secrets in GitHub:"
echo "=========================================="
echo ""
echo "1. Go to: https://github.com/gstdcoin/ai/settings/secrets/actions"
echo "2. Verify each secret exists and has correct value"
echo ""
echo "=========================================="
echo "🔑 To get SSH keys values:"
echo "=========================================="
echo ""
echo "Run on server:"
echo "  ./scripts/show-ci-cd-keys.sh"
echo ""
echo "This will display:"
echo "  - SSH_KEY (private key)"
echo "  - SSH_KNOWN_HOSTS (fingerprint)"
echo "  - SSH_HOST, SSH_USER, SSH_PORT"
echo ""
echo "=========================================="
echo "⚠️  Common Issues:"
echo "=========================================="
echo ""
echo "1. Secret not set:"
echo "   - Go to GitHub Settings → Secrets → Actions"
echo "   - Add missing secret"
echo ""
echo "2. Wrong format:"
echo "   - SSH_KEY must include BEGIN and END lines"
echo "   - SSH_KNOWN_HOSTS must include all host keys"
echo ""
echo "3. Secret not accessible:"
echo "   - Check repository settings"
echo "   - Ensure secrets are in correct environment"
echo ""
echo "=========================================="
