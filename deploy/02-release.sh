#!/usr/bin/env bash
# 原子发布：解包 -> npm ci --omit=dev -> current 软链切换 -> pm2 重启 -> 健康检查 -> 自动回滚
# 用法：sudo bash 02-release.sh /tmp/bideti-release-YYYYmmdd-HHMMSS.tar.gz
set -euo pipefail
umask 022

APP_ROOT="${APP_ROOT:-/var/www/bideti}"
SERVICE_USER="${SERVICE_USER:-bideti}"
PORT="${PORT:-3002}"
DOMAIN="${DOMAIN:-igoiget.com}"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/igoiget.conf}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
TARBALL="${1:-}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0 /tmp/xxx.tar.gz"
[ -n "$TARBALL" ] || die "用法：sudo bash $0 /tmp/bideti-release-*.tar.gz"
[ -f "$TARBALL" ] || die "发布包不存在：$TARBALL"
TARBALL="$(readlink -f "$TARBALL")"
command -v node >/dev/null || die "未找到 node"
command -v npm >/dev/null || die "未找到 npm"
command -v pm2 >/dev/null || die "未找到 pm2；先跑 01-bootstrap.sh"
command -v nginx >/dev/null || die "未找到 nginx；先跑 01-bootstrap.sh"
[ -f /etc/bideti/bideti.env ] || die "缺少 /etc/bideti/bideti.env；先跑 01-bootstrap.sh"

exec 9>/var/lock/bideti-release.lock
flock -n 9 || die "已有发布进程在运行"

log "校验发布包"
if [ -f "$TARBALL.sha256" ]; then
  (cd "$(dirname "$TARBALL")" && sha256sum -c "$(basename "$TARBALL").sha256")
else
  echo "WARN: 未找到 $TARBALL.sha256，跳过校验"
fi
if tar -tzf "$TARBALL" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  die "发布包包含绝对路径或 .. 路径，拒绝解包"
fi

AVAIL_KB="$(df -Pk "$APP_ROOT" | awk 'NR == 2 {print $4}')"
[ "${AVAIL_KB:-0}" -gt 5242880 ] || die "磁盘可用空间不足 5GB（当前 $((AVAIL_KB / 1024))MB）"

STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE="$APP_ROOT/releases/$STAMP"
mkdir -p "$RELEASE"
log "解包到 $RELEASE"
tar -xzf "$TARBALL" -C "$RELEASE"

for f in dist/index.html server.ts package.json package-lock.json deploy/ecosystem.config.cjs; do
  [ -e "$RELEASE/$f" ] || die "发布包缺少 $f"
done
cp "$RELEASE/deploy/ecosystem.config.cjs" "$RELEASE/ecosystem.config.cjs"

log "安装生产依赖（npm ci --omit=dev）"
export npm_config_registry="${npm_config_registry:-https://registry.npmmirror.com}"
(
  cd "$RELEASE"
  npm ci --omit=dev --no-audit --no-fund
)
[ -f "$RELEASE/node_modules/tsx/dist/cli.mjs" ] || die "生产依赖里没有 tsx；检查 package.json 是否把 tsx 放在 dependencies"

chown -R "$SERVICE_USER:$SERVICE_USER" "$RELEASE"
chmod 755 "$RELEASE"
chmod -R a+rX "$RELEASE/dist"

PREV=""
if [ -L "$APP_ROOT/current" ]; then
  PREV="$(readlink -f "$APP_ROOT/current" || true)"
fi
printf '%s\n' "$PREV" > "$APP_ROOT/.previous"

PM2_BIN="$(command -v pm2)"
run_pm2() { sudo -u "$SERVICE_USER" -H "$PM2_BIN" "$@"; }

INSTALLED_NGINX=0
fail() {
  local msg="$1"
  printf '\n[ERROR] %s\n' "$msg" >&2
  if [ "$INSTALLED_NGINX" = "1" ]; then
    rm -f "$NGINX_CONF"
  fi
  if [ -n "${PREV:-}" ] && [ -d "$PREV/dist" ]; then
    ln -sfn "$PREV" "$APP_ROOT/current.next"
    mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    run_pm2 delete bideti >/dev/null 2>&1 || true
    run_pm2 start "$APP_ROOT/current/ecosystem.config.cjs" >/dev/null 2>&1 || true
    run_pm2 save >/dev/null 2>&1 || true
    nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
    echo "已回滚到 $PREV" >&2
  else
    echo "没有可回滚版本；请查看 /var/log/bideti/error.log" >&2
  fi
  exit 1
}

log "原子切换 current 软链"
ln -sfn "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

if [ ! -f "$NGINX_CONF" ]; then
  log "首次发布：安装 nginx 站点配置"
  install -m 644 "$RELEASE/deploy/nginx/igoiget.conf" "$NGINX_CONF"
  INSTALLED_NGINX=1
  nginx -t || fail "nginx 配置校验失败"
  systemctl reload nginx || fail "nginx reload 失败"
else
  nginx -t || fail "nginx 配置校验失败（未改动现有站点配置）"
  systemctl reload nginx || fail "nginx reload 失败"
fi

log "重启 pm2（仅监听 127.0.0.1:$PORT）"
run_pm2 delete bideti >/dev/null 2>&1 || true
run_pm2 start "$APP_ROOT/current/ecosystem.config.cjs" || fail "pm2 启动失败"
run_pm2 save || fail "pm2 save 失败"

log "健康检查"
http_code() {
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    curl -k -s -o /dev/null -w '%{http_code}' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN$1" || true
  else
    curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" "http://127.0.0.1$1" || true
  fi
}
read_body() {
  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    curl -k -fsS --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" || true
  else
    curl -fsS -H "Host: $DOMAIN" "http://127.0.0.1/" || true
  fi
}

API_CODE="000"
for _ in $(seq 1 20); do
  API_CODE="$(http_code /api/stats/overview)"
  [ "$API_CODE" = "401" ] && break
  sleep 1
done
[ "$API_CODE" = "401" ] || fail "API 健康检查失败（期望 401，实际 $API_CODE）"

BODY="$(read_body)"
printf '%s' "$BODY" | grep -q '必得题库' || fail "首页未包含品牌名「必得题库」"

log "发布成功"
run_pm2 describe bideti >/dev/null 2>&1 || echo "WARN: pm2 describe bideti 失败，请手工检查 pm2 list"
echo "版本：$RELEASE"
echo "PM2：sudo -u $SERVICE_USER -H $PM2_BIN status bideti"
echo "日志：sudo -u $SERVICE_USER -H $PM2_BIN logs bideti"

mapfile -t OLD_RELEASES < <(
  find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn | awk -v keep="$KEEP_RELEASES" 'NR > keep {print $2}'
)
CURRENT_TARGET="$(readlink -f "$APP_ROOT/current" || true)"
for d in "${OLD_RELEASES[@]:-}"; do
  [ -n "$d" ] || continue
  [ "$d" = "$CURRENT_TARGET" ] && continue
  echo "清理旧版本：$d"
  rm -rf "$d"
done
