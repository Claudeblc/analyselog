#!/bin/bash
# Installation / mise à jour de BLC Family sur le VPS (Ubuntu/Debian, root).
# Usage : sudo bash deploy/install.sh   (depuis le dossier blc-family)
# Pré-requis DNS : enregistrements A de family / galerie / chat / visio .blctv-player.com vers l'IP du VPS.
set -euo pipefail
APP_DIR=/var/www/blc-family
DOMAINS=(family.blctv-player.com galerie.blctv-player.com chat.blctv-player.com visio.blctv-player.com)
SRC="$(cd "$(dirname "$0")/.." && pwd)"

command -v node >/dev/null || { curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; }
command -v pm2 >/dev/null || npm install -g pm2
command -v nginx >/dev/null || apt-get install -y nginx
command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx

mkdir -p "$APP_DIR"
# Le dossier data/ (textes, photos, sessions) n'est jamais écrasé
rsync -a --delete --exclude data --exclude node_modules --exclude .env "$SRC"/ "$APP_DIR"/
cd "$APP_DIR"
npm ci --omit=dev

if [ ! -f .env ]; then
  read -rsp "Code famille (PIN) : " PIN; echo
  cat > .env <<ENV
PORT=3100
FAMILY_PIN=$PIN
COOKIE_DOMAIN=.blctv-player.com
MUSIC_URL=https://blc-music-player.duckdns.org/app
TV_URL=https://blctv-player.com
# Serveur TURN (recommandé pour les appels en 4G) :
# TURN_URL=turn:turn.blctv-player.com:3478
# TURN_USER=blc
# TURN_PASS=motdepasse
ENV
  chmod 600 .env
fi

# Import des Apéro Time (une seule fois ; relançable sans doublon)
if [ -n "${APEROTIME_XLSX:-}" ]; then node --env-file=.env scripts/import-aperotime.js "$APEROTIME_XLSX"; fi

pm2 delete blc-family 2>/dev/null || true
pm2 start server/index.js --name blc-family --node-args="--env-file=$APP_DIR/.env"
pm2 save

cp deploy/nginx-blc-family.conf /etc/nginx/sites-available/blc-family
ln -sf /etc/nginx/sites-available/blc-family /etc/nginx/sites-enabled/blc-family
nginx -t && systemctl reload nginx

ARGS=(); for d in "${DOMAINS[@]}"; do ARGS+=(-d "$d"); done
certbot --nginx --non-interactive --agree-tos --redirect -m "${CERTBOT_EMAIL:-admin@blctv-player.com}" "${ARGS[@]}" || echo "⚠️ certbot : vérifiez les DNS puis relancez certbot --nginx ${ARGS[*]}"
echo "✅ BLC Family : https://${DOMAINS[0]}"
