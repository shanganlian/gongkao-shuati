#!/usr/bin/env bash
# 必得题库迁移预检：只读检查，不安装、不修改配置。
# 建议在 01-bootstrap.sh 前后各跑一次；bootstrap 前缺软件属于预期。
set -uo pipefail

APP_ROOT="${APP_ROOT:-/var/www/bideti}"
ENV_FILE="${ENV_FILE:-/etc/bideti/bideti.env}"
PORT="${PORT:-3002}"
DOMAIN="${DOMAIN:-igoiget.com}"
WWW_DOMAIN="${WWW_DOMAIN:-www.igoiget.com}"

PASS=0
WARN=0
FAIL=0
ok() { printf '  [OK]   %s\n' "$*"; PASS=$((PASS + 1)); }
warn() { printf '  [WARN] %s\n' "$*"; WARN=$((WARN + 1)); }
bad() { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL + 1)); }

echo "== 必得题库迁移预检 $(date '+%F %T') =="

if [ "$(id -u)" -eq 0 ]; then
  ok "以 root 运行"
else
  warn "非 root 运行；部分检查可能不完整"
fi

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "  系统: ${PRETTY_NAME:-unknown}"
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|aarch64|arm64) ok "CPU 架构 $ARCH（Node 二进制可用）" ;;
  *) bad "CPU 架构 $ARCH；deploy/01-bootstrap.sh 仅支持 x86_64 / aarch64" ;;
esac

MEM_MB="$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "${MEM_MB:-0}" -ge 2048 ]; then
  ok "内存 ${MEM_MB}MB"
elif [ "${MEM_MB:-0}" -ge 1024 ]; then
  warn "内存 ${MEM_MB}MB，建议 2GB 以上；bootstrap 会补 swap"
else
  bad "内存仅 ${MEM_MB}MB，构建/运行可能 OOM"
fi

mkdir -p "$APP_ROOT" 2>/dev/null || true
AVAIL_MB="$(df -Pm "$APP_ROOT" 2>/dev/null | awk 'NR == 2 {print $4}' || true)"
AVAIL_MB="${AVAIL_MB:-0}"
if [ "$AVAIL_MB" -ge 5120 ]; then
  ok "应用目录可用空间 ${AVAIL_MB}MB"
else
  bad "应用目录可用空间仅 ${AVAIL_MB}MB；发布包约 220MB，npm 依赖另占空间，建议至少 5GB"
fi

echo "  端口占用："
for p in 80 443 "$PORT"; do
  if command -v ss >/dev/null 2>&1 && ss -H -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${p}$"; then
    warn "端口 $p 已被监听（80/443 是 nginx 则正常；$PORT 应是 bideti）"
  else
    ok "端口 $p 当前未监听"
  fi
done

echo "  软件："
for cmd in node npm nginx pm2 certbot; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd -> $(command -v "$cmd")"
  else
    warn "$cmd 未安装（01-bootstrap.sh / 04-certbot.sh 会处理）"
  fi
done

if command -v node >/dev/null 2>&1; then
  NODE_V="$(node -v)"
  NODE_MAJOR="${NODE_V#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  if [ "${NODE_MAJOR:-0}" -ge 24 ]; then
    ok "Node $NODE_V"
  else
    warn "Node $NODE_V 低于 24；bootstrap 会安装 24 LTS"
  fi
fi

echo "  DNS（现在还没切是正常的，切换后再核对）："
for d in "$DOMAIN" "$WWW_DOMAIN"; do
  ip="$(getent ahostsv4 "$d" 2>/dev/null | awk 'NR == 1 {print $1}' || true)"
  if [ -n "$ip" ]; then
    warn "$d -> $ip（切 DNS 后应为 47.106.172.207）"
  else
    warn "$d 暂无 A 记录"
  fi
done

echo "  配置文件："
if [ -f "$ENV_FILE" ]; then
  PERMS="$(stat -c '%a %U:%G' "$ENV_FILE" 2>/dev/null || echo '?')"
  ok "$ENV_FILE 存在（$PERMS）"
  if grep -Eq '^DEEPSEEK_API_KEY=.+' "$ENV_FILE"; then
    ok "DEEPSEEK_API_KEY 已填写（不显示内容）"
  else
    warn "DEEPSEEK_API_KEY 为空；首次 bootstrap 后必须填写"
  fi
  if grep -Eq '^GEMINI_API_KEY=.+' "$ENV_FILE"; then
    warn "检测到 GEMINI_API_KEY；大陆服务器通常不可达，建议删除并走内置降级"
  fi
else
  warn "$ENV_FILE 尚未创建（01-bootstrap.sh 会创建模板）"
fi

echo "  出站连通性："
check_url() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
  if [ "$code" != "000" ]; then
    ok "$name 可达（HTTP $code）"
  else
    bad "$name 不可达；请检查安全组/网络"
  fi
}
check_url "DeepSeek API" "https://api.deepseek.com"
check_url "Supabase" "https://axcezfmqjotwcgqnaqro.supabase.co/auth/v1/health"

echo
echo "汇总：通过 $PASS，警告 $WARN，失败 $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "存在失败项，请先处理（软件缺失只会记为 WARN，可由 bootstrap 安装）。"
  exit 1
fi
echo "预检通过。"
