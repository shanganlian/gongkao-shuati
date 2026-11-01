#!/usr/bin/env bash
# 阿里云 Alibaba Cloud Linux 4 初始化：nginx / firewalld / Node 24（npmmirror 二进制直装） / pm2 / 目录 / swap / SELinux
# 幂等；可重复执行。只负责主机，不发布代码。
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/bideti}"
ENV_DIR="${ENV_DIR:-/etc/bideti}"
ENV_FILE="${ENV_FILE:-$ENV_DIR/bideti.env}"
SERVICE_USER="${SERVICE_USER:-bideti}"
LOG_DIR="${LOG_DIR:-/var/log/bideti}"
PORT="${PORT:-3002}"
NODE_MAJOR="${NODE_MAJOR:-24}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"

log() { printf '\n==> %s\n' "$*"; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash $0"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) die "不支持的 CPU 架构：$ARCH（Node 官方二进制仅提供 x86_64 / aarch64）" ;;
esac

log "系统信息"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "${PRETTY_NAME:-unknown}"
fi
uname -r

log "安装系统软件"
dnf install -y nginx firewalld tar xz curl ca-certificates openssl rsync
dnf install -y policycoreutils-python-utils || true

log "设置时区"
timedatectl set-timezone Asia/Shanghai || true

log "配置 firewalld（只放行 80/443；3002 不对外）"
systemctl enable --now firewalld
firewall-cmd --permanent --add-service=http >/dev/null
firewall-cmd --permanent --add-service=https >/dev/null
firewall-cmd --reload
firewall-cmd --list-services

log "启动 nginx"
systemctl enable --now nginx
nginx -t

log "安装 Node ${NODE_MAJOR}（npmmirror 二进制包直装）"
NODE_VERSION="${NODE_VERSION:-}"
NODE_VERSION="${NODE_VERSION#v}"
NODE_MIRROR="${NODE_MIRROR:-https://npmmirror.com/mirrors/node}"
NODE_SKIP_VERIFY="${NODE_SKIP_VERIFY:-0}"
# 按顺序尝试：npmmirror -> registry.npmmirror -> 阿里云 -> 官方
NODE_MIRRORS=(
  "${NODE_MIRROR%/}"
  "https://registry.npmmirror.com/-/binary/node"
  "https://mirrors.aliyun.com/nodejs-release"
  "https://nodejs.org/dist"
)
TMP_DIR="$(mktemp -d /tmp/bideti-node.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT
NODE_INSTALLED=0
NODE_DIR=""

current_node_version() {
  if command -v node >/dev/null 2>&1; then
    node -v 2>/dev/null || true
  fi
}

# 汇总各镜像 index.json 里的 v${NODE_MAJOR}.x.y 版本号。
# 不用 latest-vXX.x 目录：阿里云没有该软链，npmmirror 的软链也可能滞后。
list_node_versions() {
  local base json version found=0
  for base in "${NODE_MIRRORS[@]}"; do
    # 国内镜像已给出结果时不再请求官方源，避免被墙拖慢 bootstrap
    case "${base%/}" in
      https://nodejs.org/*) [ "$found" -eq 1 ] && continue ;;
    esac
    json="$(curl -fsSL --connect-timeout 15 --max-time 60 "${base%/}/index.json" 2>/dev/null || true)"
    [ -n "$json" ] || continue
    version="$(printf '%s\n' "$json" \
      | grep -oE "\"version\"[[:space:]]*:[[:space:]]*\"v${NODE_MAJOR}\.[0-9]+\.[0-9]+\"" \
      | sed -E 's/.*"v([0-9]+\.[0-9]+\.[0-9]+)".*/\1/' || true)"
    [ -n "$version" ] || continue
    printf '%s\n' "$version"
    found=1
  done
}

INSTALLED_V="$(current_node_version)"
INSTALLED_MAJOR="${INSTALLED_V#v}"
INSTALLED_MAJOR="${INSTALLED_MAJOR%%.*}"
if [ "${INSTALLED_MAJOR:-0}" -ge "$NODE_MAJOR" ] && command -v npm >/dev/null 2>&1 \
  && { [ -z "$NODE_VERSION" ] || [ "$INSTALLED_V" = "v$NODE_VERSION" ]; }; then
  log "已安装 Node $INSTALLED_V，跳过下载"
else
  if [ -z "$NODE_VERSION" ]; then
    NODE_VERSION="$(list_node_versions | sort -uV | tail -n 1)"
  fi
  [ -n "$NODE_VERSION" ] || die "无法从镜像解析 Node ${NODE_MAJOR} 版本；可显式指定 NODE_VERSION=24.x.y"
  case "$NODE_VERSION" in
    "${NODE_MAJOR}."[0-9]*.[0-9]*) ;;
    *) die "NODE_VERSION=$NODE_VERSION 与 NODE_MAJOR=$NODE_MAJOR 不匹配" ;;
  esac
  NODE_TAR="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  log "目标版本 v${NODE_VERSION}（linux-${NODE_ARCH}）"

  FETCHED=0
  for base in "${NODE_MIRRORS[@]}"; do
    base="${base%/}"
    echo "  尝试 $base/v$NODE_VERSION"
    if ! curl -fsSL --connect-timeout 15 --max-time 90 \
      "$base/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP_DIR/SHASUMS256.txt"; then
      echo "    SHASUMS256.txt 不可用，换下一个源"
      continue
    fi
    if ! grep -qF "$NODE_TAR" "$TMP_DIR/SHASUMS256.txt"; then
      echo "    校验文件里没有 $NODE_TAR，换下一个源"
      continue
    fi
    if ! curl -fL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 900 \
      "$base/v$NODE_VERSION/$NODE_TAR" -o "$TMP_DIR/$NODE_TAR"; then
      echo "    下载失败，换下一个源"
      continue
    fi
    if [ "$NODE_SKIP_VERIFY" = "1" ]; then
      echo "    已跳过 SHA256 校验（NODE_SKIP_VERIFY=1）"
    elif ! (cd "$TMP_DIR" && grep -F "$NODE_TAR" SHASUMS256.txt | sha256sum -c -); then
      echo "    SHA256 校验失败，换下一个源"
      rm -f "$TMP_DIR/$NODE_TAR"
      continue
    fi
    FETCHED=1
    break
  done
  [ "$FETCHED" = "1" ] || die "Node 安装包下载失败；已尝试：${NODE_MIRRORS[*]}"

  install -d -m 755 /usr/local/lib/nodejs
  NODE_DIR="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
  case "$NODE_DIR" in
    /usr/local/lib/nodejs/node-v*) rm -rf "$NODE_DIR" ;;
    *) die "拒绝删除异常路径：$NODE_DIR" ;;
  esac
  tar -xJf "$TMP_DIR/$NODE_TAR" -C /usr/local/lib/nodejs
  [ -x "$NODE_DIR/bin/node" ] || die "解压后未找到 $NODE_DIR/bin/node"
  ln -sfn "$NODE_DIR" /usr/local/lib/nodejs/current
  for bin in node npm npx corepack; do
    if [ -x "$NODE_DIR/bin/$bin" ]; then
      ln -sfn "$NODE_DIR/bin/$bin" "/usr/local/bin/$bin"
    fi
  done
  NODE_INSTALLED=1
  export PATH="/usr/local/bin:$PATH"
  hash -r
fi
if [ "$NODE_INSTALLED" = "1" ]; then
  NODE_BIN="$NODE_DIR/bin/node"
  NPM_BIN="$NODE_DIR/bin/npm"
else
  NODE_BIN="$(command -v node 2>/dev/null || true)"
  NPM_BIN="$(command -v npm 2>/dev/null || true)"
fi
[ -n "$NODE_BIN" ] && [ -x "$NODE_BIN" ] || die "未找到可执行的 node"
[ -n "$NPM_BIN" ] && [ -x "$NPM_BIN" ] || die "未找到可执行的 npm"

NODE_V="$("$NODE_BIN" -v)"
NODE_MAJOR_ACTUAL="${NODE_V#v}"
NODE_MAJOR_ACTUAL="${NODE_MAJOR_ACTUAL%%.*}"
[ "${NODE_MAJOR_ACTUAL:-0}" -ge "$NODE_MAJOR" ] || die "Node 版本为 $NODE_V，期望 ${NODE_MAJOR}+"
echo "node: $NODE_V（$NODE_BIN）"
echo "npm:  $("$NPM_BIN" -v)"

log "配置 npm 镜像并安装 pm2"
"$NPM_BIN" config set registry "$NPM_REGISTRY" --global
"$NPM_BIN" install -g pm2@latest --no-audit --no-fund
# tarball 安装时 npm 全局 bin 在 Node 目录内，软链到 /usr/local/bin 才能直接调用
NPM_PREFIX="$("$NPM_BIN" prefix -g 2>/dev/null || true)"
if [ -n "$NPM_PREFIX" ] && [ -x "$NPM_PREFIX/bin/pm2" ]; then
  ln -sfn "$NPM_PREFIX/bin/pm2" /usr/local/bin/pm2
fi
hash -r
PM2_BIN="$(command -v pm2 2>/dev/null || true)"
[ -n "$PM2_BIN" ] || PM2_BIN="${NPM_PREFIX%/}/bin/pm2"
[ -n "$PM2_BIN" ] && [ -x "$PM2_BIN" ] || die "pm2 安装失败"
"$PM2_BIN" -v

log "创建运行用户与目录"
if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --create-home --home-dir "/home/$SERVICE_USER" --shell /bin/bash "$SERVICE_USER"
fi
if ! getent group "$SERVICE_USER" >/dev/null 2>&1; then
  groupadd "$SERVICE_USER"
fi
install -d -m 755 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_ROOT" "$APP_ROOT/releases" "$LOG_DIR"
install -d -m 750 -o root -g "$SERVICE_USER" "$ENV_DIR"

log "配置 pm2 开机自启（systemd）"
PM2_BIN="$(command -v pm2)"
cat > "/etc/systemd/system/pm2-$SERVICE_USER.service" <<EOF
[Unit]
Description=PM2 process manager for $SERVICE_USER
After=network.target

[Service]
Type=forking
User=$SERVICE_USER
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=PM2_HOME=/home/$SERVICE_USER/.pm2
PIDFile=/home/$SERVICE_USER/.pm2/pm2.pid
LimitNOFILE=infinity
LimitNPROC=infinity
LimitCORE=infinity
KillMode=process
Restart=on-failure
ExecStart=$PM2_BIN resurrect
ExecReload=$PM2_BIN reload all
ExecStop=$PM2_BIN kill

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "pm2-$SERVICE_USER" >/dev/null
echo "已启用 pm2-$SERVICE_USER.service（首次发布执行 pm2 save 后才会 resurrect）"

log "创建环境变量模板（不覆盖已有文件）"
if [ ! -f "$ENV_FILE" ]; then
  install -m 640 -o root -g "$SERVICE_USER" /dev/null "$ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
NODE_ENV=production
PORT=3002
DEEPSEEK_API_KEY=
# 大陆服务器通常无法访问 Google，不要配置 GEMINI_API_KEY；
# 相关接口会自动走内置降级，浏览器朗读仍由 SpeechSynthesis 本地完成。
# GEMINI_API_KEY=
# Supabase 未配置时会使用代码内置的公开配置；如需切换项目再取消注释。
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
EOF
fi
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"
if ! grep -Eq '^DEEPSEEK_API_KEY=.+' "$ENV_FILE"; then
  log "注意：$ENV_FILE 里的 DEEPSEEK_API_KEY 还是空的，发布前必须填写"
fi

log "检查 swap"
MEM_MB="$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)"
if [ "$MEM_MB" -lt 2048 ] && ! swapon --show 2>/dev/null | grep -q .; then
  log "内存 ${MEM_MB}MB，创建 2GB swap"
  if ! fallocate -l 2G /swapfile 2>/dev/null; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  fi
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-bideti.conf
  sysctl --system >/dev/null
fi
free -h

log "SELinux / 目录权限"
if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" = "Enforcing" ]; then
  setsebool -P httpd_can_network_connect 1 || true
  if command -v semanage >/dev/null 2>&1; then
    semanage fcontext -a -t httpd_sys_content_t "$APP_ROOT(/.*)?" 2>/dev/null || true
    restorecon -Rv "$APP_ROOT" >/dev/null || true
  else
    echo "WARN: 未安装 semanage，若 nginx 403 请检查 SELinux 上下文"
  fi
else
  echo "SELinux 未启用或为 Permissive"
fi

log "初始化完成"
cat <<EOF
应用目录:     $APP_ROOT
环境变量:     $ENV_FILE（root:$SERVICE_USER 640）
Node:         $NODE_V
pm2:          $("$PM2_BIN" -v)
nginx:        $(nginx -v 2>&1)
监听端口:     $PORT（仅 127.0.0.1，由 nginx 反代）

下一步：
  1. vi $ENV_FILE 填写 DEEPSEEK_API_KEY
  2. 本地打包并上传：powershell -File deploy/pack.ps1 && powershell -File deploy/upload.ps1 -Archive <包>
  3. 服务器执行：bash /root/bideti-deploy/02-release.sh /tmp/<包>.tar.gz
EOF
