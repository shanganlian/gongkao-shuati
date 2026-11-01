#!/usr/bin/env bash
# 回滚到上一个版本；也可指定 releases 下的绝对路径。
# 用法：sudo bash 03-rollback.sh [ /var/www/bideti/releases/YYYYmmdd-HHMMSS ]
set -euo pipefail
umask 022

APP_ROOT="${APP_ROOT:-/var/www/bideti}"
SERVICE_USER="${SERVICE_USER:-bideti}"
DOMAIN="${DOMAIN:-igoiget.com}"
PORT="${PORT:-3002}"
TARGET="${1:-}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0"
command -v pm2 >/dev/null || die "未找到 pm2"
command -v nginx >/dev/null || die "未找到 nginx"

CURRENT="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
if [ -z "$TARGET" ]; then
  TARGET="$(cat "$APP_ROOT/.previous" 2>/dev/null || true)"
  [ -n "$TARGET" ] || die "没有 .previous 记录，请显式传入 releases 路径"
fi
TARGET="$(readlink -f "$TARGET" 2>/dev/null || true)"
[ -n "$TARGET" ] && [ -d "$TARGET/dist" ] || die "回滚目标无效：${1:-$TARGET}"
[ "$TARGET" != "$CURRENT" ] || die "回滚目标就是当前版本"

PM2_BIN="$(command -v pm2)"
run_pm2() { sudo -u "$SERVICE_USER" -H "$PM2_BIN" "$@"; }

log "切换到 $TARGET"
ln -sfn "$TARGET" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
printf '%s\n' "$CURRENT" > "$APP_ROOT/.previous"

run_pm2 delete bideti >/dev/null 2>&1 || true
run_pm2 start "$APP_ROOT/current/ecosystem.config.cjs"
run_pm2 save

nginx -t
systemctl reload nginx

log "健康检查"
http_code() {
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    curl -k -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$1" || true
  else
    curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" "http://127.0.0.1$1" || true
  fi
}
API_CODE="000"
for _ in $(seq 1 20); do
  API_CODE="$(http_code /api/stats/overview)"
  [ "$API_CODE" = "401" ] && break
  sleep 1
done
[ "$API_CODE" = "401" ] || die "回滚后 API 检查失败（HTTP $API_CODE），请查看 pm2 logs"

echo "回滚完成：$TARGET"
echo "如需再切回：sudo bash $0 $CURRENT"
