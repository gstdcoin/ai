#!/bin/bash
# CI/CD Diagnostic Script

set -e

echo "=========================================="
echo "🔍 CI/CD Diagnostic Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅${NC} $1"
        return 0
    else
        echo -e "${RED}❌${NC} $1"
        return 1
    fi
}

warn() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ️${NC} $1"
}

# 1. Check workflow file
echo "1. Checking workflow file..."
if [ -f ".github/workflows/ci-cd.yml" ]; then
    check "Workflow file exists"
    python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-cd.yml'))" 2>/dev/null
    check "Workflow YAML syntax is valid"
else
    warn "Workflow file not found"
fi
echo ""

# 2. Check SSH keys
echo "2. Checking SSH keys..."
if [ -f "$HOME/.ssh/github_actions_deploy" ]; then
    check "SSH private key exists"
    if [ -f "$HOME/.ssh/github_actions_deploy.pub" ]; then
        check "SSH public key exists"
        PUB_KEY=$(cat "$HOME/.ssh/github_actions_deploy.pub")
        if grep -q "$PUB_KEY" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
            check "Public key is in authorized_keys"
        else
            warn "Public key NOT in authorized_keys"
            info "Run: cat ~/.ssh/github_actions_deploy.pub >> ~/.ssh/authorized_keys"
        fi
    fi
else
    warn "SSH keys not found"
    info "Run: ./scripts/show-ci-cd-keys.sh to see keys"
fi
echo ""

# 3. Check Docker
echo "3. Checking Docker..."
if command -v docker &> /dev/null; then
    check "Docker is installed"
    docker ps &> /dev/null
    check "Docker is running"
    if [ -f "docker-compose.prod.yml" ]; then
        check "docker-compose.prod.yml exists"
    fi
else
    warn "Docker not found"
fi
echo ""

# 4. Check Git
echo "4. Checking Git..."
if [ -d ".git" ]; then
    check "Git repository initialized"
    git remote -v &> /dev/null
    check "Git remotes configured"
    CURRENT_BRANCH=$(git branch --show-current)
    info "Current branch: $CURRENT_BRANCH"
else
    warn "Not a git repository"
fi
echo ""

# 5. Check scripts
echo "5. Checking deployment scripts..."
SCRIPTS=("scripts/deploy.sh" "scripts/blue-green-deploy.sh" "scripts/show-ci-cd-keys.sh")
for script in "${SCRIPTS[@]}"; do
    if [ -f "$script" ]; then
        check "$script exists"
        if [ -x "$script" ]; then
            check "$script is executable"
        else
            warn "$script is not executable"
            info "Run: chmod +x $script"
        fi
    else
        warn "$script not found"
    fi
done
echo ""

# 6. Check environment
echo "6. Checking environment..."
if [ -f ".env" ] || [ -f "docker-compose.prod.yml" ]; then
    check "Configuration files exist"
else
    warn "Configuration files not found"
fi
echo ""

# 7. Check GitHub secrets (informational)
echo "7. GitHub Secrets Checklist:"
echo "   Required secrets in GitHub:"
echo "   - SSH_KEY"
echo "   - SSH_HOST (should be: 82.115.48.228)"
echo "   - SSH_USER (should be: ubuntu)"
echo "   - SSH_PORT (optional, default: 22)"
echo "   - SSH_KNOWN_HOSTS"
echo ""
info "To check keys: ./scripts/show-ci-cd-keys.sh"
echo ""

# 8. Summary
echo "=========================================="
echo "📋 Summary"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure all GitHub secrets are configured"
echo "2. Test SSH connection manually"
echo "3. Check GitHub Actions logs for errors"
echo "4. Run: ./scripts/deploy.sh (manual test)"
echo ""
echo "For troubleshooting, see: CI_CD_TROUBLESHOOTING.md"
echo ""
