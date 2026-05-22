#!/bin/sh
set -e

# Defaults
GARAGE_UPSTREAM_URL="${GARAGE_UPSTREAM_URL:-http://localhost:3903}"
GARAGE_S3_UPSTREAM_URL="${GARAGE_S3_UPSTREAM_URL:-http://localhost:3900}"
GARAGE_ADMIN_TOKEN="${GARAGE_ADMIN_TOKEN:-}"
GARAGE_API_URL="${GARAGE_API_URL:-/api}"
GARAGE_S3_PROXY="${GARAGE_S3_PROXY:-false}"

# Write runtime config for the SPA
cat > /usr/share/nginx/html/config.js <<EOF
window.__GARAGE_CONFIG__ = {
  apiUrl: "${GARAGE_API_URL}",
  adminToken: "${GARAGE_ADMIN_TOKEN}",
  s3Proxy: ${GARAGE_S3_PROXY},
};
EOF

# Optional /s3/ proxy block. SigV4 signs host + path, so this only works for
# anonymous/unsigned S3 traffic. Off by default.
if [ "${GARAGE_S3_PROXY}" = "true" ]; then
  S3_PROXY_BLOCK="location /s3/ {
        proxy_pass ${GARAGE_S3_UPSTREAM_URL}/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
        client_max_body_size 0;
    }"
else
  S3_PROXY_BLOCK=""
fi
export S3_PROXY_BLOCK

# Substitute env vars into the nginx config
envsubst '${GARAGE_UPSTREAM_URL} ${S3_PROXY_BLOCK}' \
  < /etc/nginx/templates/nginx.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
