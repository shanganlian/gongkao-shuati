#!/usr/bin/env bash
# DNS 切换到 47.106.172.207 之后运行：申请/续期 Let's Encrypt 证书，并配置自动续期。
# 用法：sudo bash 04-certbot.sh
set -euo pipefail

DOMAIN="${DOMAIN:-igoiget.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.igoiget.com}"
EMAIL="${EMAIL:-luoweilw@163.com}"
SERVER_IP="${SERVER_IP:-47.106.172.207}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/igoiget.conf}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0"
[ -f "$NGINX_CONF" ] || die "缺少 $NGINX_CONF；先执行 02-release.sh"
command -v nginx >/dev/null || die "未找到 nginx"

log "检查 DNS（切换完成前不要执行本脚本）"
if [ "${SKIP_DNS_CHECK:-0}" != "1" ]; then
  for d in "$DOMAIN" "$WWW_DOMAIN"; do
    ip="$(getent ahostsv4 "$d" 2>/dev/null | awk 'NR == 1 {print $1}' || true)"
    [ "$ip" = "$SERVER_IP" ] || die "$d 当前解析到「${ip:-空}」，不是 $SERVER_IP；请等 DNS 生效后再跑（或 SKIP_DNS_CHECK=1 强制）"
    echo "$d -> $ip"
  done
fi

log "检查 nginx 与 80 端口"
nginx -t
curl -fsS -m 10 -o /dev/null -H "Host: $DOMAIN" "http://127.0.0.1/" \
  || die "本机 80 端口未正常返回首页；先排查 nginx"

log "安装 certbot"
if ! command -v certbot >/dev/null 2>&1; then
  if dnf install -y certbot python3-certbot-nginx; then
    :
  else
    echo "dnf 源没有 certbot，改用 venv 安装"
    dnf install -y python3 python3-pip
    python3 -m venv --clear /opt/certbot
    /opt/certbot/bin/pip install --upgrade pip
    /opt/certbot/bin/pip install certbot certbot-nginx
    ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
  fi
fi
CERTBOT_BIN="$(command -v certbot)"
"$CERTBOT_BIN" --version

log "申请证书（HTTP-01，自动改 nginx 配置并 301 跳转 HTTPS）"
"$CERTBOT_BIN" --nginx \
  -d "$DOMAIN" -d "$WWW_DOMAIN" \
  --redirect --agree-tos --no-eff-email \
  -m "$EMAIL" --non-interactive --keep-until-expiring

CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
[ -f "$CERT" ] || die "证书文件不存在：$CERT"
log "证书信息"
openssl x509 -in "$CERT" -noout -subject -issuer -dates
openssl x509 -in "$CERT" -noout -ext subjectAltName

log "配置自动续期"
if systemctl list-unit-files 2>/dev/null | grep -q '^certbot-renew.timer'; then
  systemctl enable --now certbot-renew.timer
  systemctl list-timers certbot-renew.timer --no-pager || true
else
  cat > /etc/cron.d/certbot-renew <<EOF
SHELL=/bin/sh
PATH=/usr/local/bin:/usr/bin:/bin
17 3 * * * root $CERTBOT_BIN renew --quiet --deploy-hook "systemctl reload nginx"
EOF
  chmod 644 /etc/cron.d/certbot-renew
  echo "已写入 /etc/cron.d/certbot-renew"
fi

log "续期演练"
if ! "$CERTBOT_BIN" renew --dry-run; then
  echo "WARN: renew --dry-run 失败；首次证书已签发，但请尽快检查 80 端口/防火墙/nginx"
fi

log "完成"
cat <<EOF
证书：$CERT
到期前 30 天会自动续期；验证：
  curl -I https://$DOMAIN/
  curl -I https://$WWW_DOMAIN/
  openssl s_client -connect $DOMAIN:443 -servername $DOMAIN </dev/null 2>/dev/null | openssl x509 -noout -dates
EOF
