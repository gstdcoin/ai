# GSTD Platform Deployment Configuration Discovery

## Discovered Configuration Values

### TON Configuration (Mainnet)
- **TON_API_URL**: `https://tonapi.io`
- **TON_API_KEY**: `6512ff28fd1ffc8e29b7230642e690b410f7c68e15ef74c4e81e17e9f7a65de6` (masked: `6512...5de6`)
- **TON_NETWORK**: `mainnet`
- **GSTD_JETTON_ADDRESS**: `EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO`
- **TON_CONTRACT_ADDRESS**: (empty - needs to be set)

### Database Configuration
- **DB_HOST**: `postgres` (Docker service name)
- **DB_PORT**: `5432`
- **DB_USER**: `postgres`
- **DB_PASSWORD**: `postgres` (default - should be changed in production)
- **DB_NAME**: `distributed_computing`

### Redis Configuration
- **REDIS_HOST**: `redis` (Docker service name)
- **REDIS_PORT**: `6379`
- **REDIS_PASSWORD**: (empty - no password)

### SSL Certificates
- **Domain**: `app.gstdtoken.com`
- **Certificate Location**: `/home/ubuntu/nginx/ssl/live/app.gstdtoken.com/`
- **Expected Files**:
  - `fullchain.pem`
  - `privkey.pem`

### Server Configuration
- **Backend Port**: `8080` (internal)
- **Frontend Port**: `3000` (internal)
- **Nginx Ports**: `80` (HTTP), `443` (HTTPS)

## Notes
- SSL certificates are mounted from host at `/home/ubuntu/nginx/ssl/`
- Domain is `app.gstdtoken.com` (not `app.gstdtoke.com`)
- TON Contract Address needs to be configured after escrow contract deployment

