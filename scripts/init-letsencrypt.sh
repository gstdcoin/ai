#!/bin/bash

if ! [ -x "$(command -v docker-compose)" ]; then
  echo 'Error: docker-compose is not installed.' >&2
  exit 1
fi

domains=(app.gstdtoken.com)
rsa_key_size=4096
email="goldenbit.kz@yandex.kz"
staging=0 # Set to 1 if you're testing your setup to avoid hitting request limits

if [ -d "nginx/ssl" ]; then
  read -p "Existing data found for $domains. Continue and replace existing certificate? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    exit
  fi
fi

if [ ! -e "nginx/ssl/options-ssl-nginx.conf" ] || [ ! -e "nginx/ssl/ssl-dhparams.pem" ]; then
  echo "### Downloading recommended TLS parameters ..."
  mkdir -p "nginx/ssl"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "nginx/ssl/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "nginx/ssl/ssl-dhparams.pem"
  echo
fi

echo "### Creating dummy certificate for $domains ..."
path="/etc/letsencrypt/live/$domains"
mkdir -p "nginx/ssl/live/$domains"
docker-compose run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:$rsa_key_size -days 1\
    -keyout '/etc/letsencrypt/live/$domains/privkey.pem' \
    -out '/etc/letsencrypt/live/$domains/fullchain.pem' \
    -subj '/CN=localhost'" certbot
echo

echo "### Starting nginx (without backend/frontend for initial cert) ..."
# Temporarily use simplified config for SSL generation
if [ -f "nginx/conf.d/app.gstdtoken.com.conf" ]; then
    mv nginx/conf.d/app.gstdtoken.com.conf nginx/conf.d/app.gstdtoken.com.conf.backup
fi
if [ -f "nginx/conf.d/app.gstdtoken.com.ssl.conf" ]; then
    cp nginx/conf.d/app.gstdtoken.com.ssl.conf nginx/conf.d/app.gstdtoken.com.conf
fi

# Start only nginx first for certificate generation
docker-compose up -d --no-deps nginx
sleep 5

# Verify nginx is running
if ! docker-compose ps nginx | grep -q "Up"; then
    echo "ERROR: Nginx failed to start"
    docker-compose logs nginx
    # Restore original config
    if [ -f "nginx/conf.d/app.gstdtoken.com.conf.backup" ]; then
        mv nginx/conf.d/app.gstdtoken.com.conf.backup nginx/conf.d/app.gstdtoken.com.conf
    fi
    exit 1
fi
echo

echo "### Deleting dummy certificate for $domains ..."
docker-compose run --rm --entrypoint "\
  rm -Rf /etc/letsencrypt/live/$domains && \
  rm -Rf /etc/letsencrypt/archive/$domains && \
  rm -Rf /etc/letsencrypt/renewal/$domains.conf" certbot
echo

echo "### Requesting Let's Encrypt certificate for $domains ..."
#Join $domains to -d args
domain_args=""
for domain in "${domains[@]}"; do
  domain_args="$domain_args -d $domain"
done

# Select appropriate email arg
case "$email" in
  "") email_arg="--register-unsafely-without-email" ;;
  *) email_arg="--email $email" ;;
esac

# Enable staging mode if needed
if [ $staging != "0" ]; then staging_arg="--staging"; fi

# Ensure certbot directory exists and is writable
mkdir -p ./nginx/certbot
chmod 755 ./nginx/certbot

docker-compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $staging_arg \
    $email_arg \
    $domain_args \
    --rsa-key-size $rsa_key_size \
    --agree-tos \
    --force-renewal \
    --non-interactive" certbot
echo

echo "### Restoring full nginx configuration ..."
# Restore full configuration
if [ -f "nginx/conf.d/app.gstdtoken.com.conf.backup" ]; then
    mv nginx/conf.d/app.gstdtoken.com.conf.backup nginx/conf.d/app.gstdtoken.com.conf
    docker-compose exec nginx nginx -s reload
else
    echo "Warning: Backup config not found, keeping SSL-only config"
fi
echo

