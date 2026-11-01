#!/usr/bin/env bash
# 阿里云 Alibaba Cloud Linux 4 初始化：nginx / firewalld / Node 24 / pm2 / 目录 / swap / SELinux
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
[ "$(uname -m)" = "x86_64" ] || die "本脚本只准备了 x86_64 的 Node 二进制；当前 $(uname -m)"

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

log "安装 Node ${NODE_MAJOR}"
current_major() {
  if command -v node >/dev/null 2>&1; then
    node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0
  else
    echo 0
  fi
}
if [ "$(current_major)" -lt "$NODE_MAJOR" ]; then
  BASE="https://npmmirror.com/mirrors/node/latest-v${NODE_MAJOR}.x"
  NODE_TAR="$(curl -fsSL "$BASE/" | grep -oE "node-v${NODE_MAJOR}\\.[0-9]+\\.[0-9]+-linux-x64\\.tar\\.xz" | head -n 1 || true)"
  if [ -n "$NODE_TAR" ]; then
    log "从 npmmirror 下载 $NODE_TAR"
    curl -fsSL "$BASE/$NODE_TAR" -o "/tmp/$NODE_TAR"
    curl -fsSL "$BASE/SHASUMS256.txt" -o /tmp/SHASUMS256.txt
    (cd /tmp && grep " $NODE_TAR\$" SHASUMS256.txt | sha256sum -c -) || die "Node 安装包校验失败"
    mkdir -p /usr/local/lib/nodejs
    tar -xJf "/tmp/$NODE_TAR" -C /usr/local/lib/nodejs
    NODE_DIR="/usr/local/lib/nodejs/${NODE_TAR%.tar.xz}"
    ln -sfn "$NODE_DIR" /usr/local/lib/nodejs/current
    ln -sf "$NODE_DIR/bin/node" /usr/local/bin/node
    ln -sf "$NODE_DIR/bin/npm" /usr/local/bin/npm
    ln -sf "$NODE_DIR/bin/npx" /usr/local/bin/npx
  else
    log "npmmirror 解析失败，回退 NodeSource"
    curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    dnf install -y nodejs
  fi
fi
hash -r
NODE_V="$(node -v)"
NODE_MAJOR_ACTUAL="${NODE_V#v}"
NODE_MAJOR_ACTUAL="${NODE_MAJOR_ACTUAL%%.*}"
[ "${NODE_MAJOR_ACTUAL:-0}" -ge 24 ] || die "Node 版本仍为 $NODE_V，期望 24+"
node -v
npm -v

log "配置 npm 镜像并安装 pm2"
npm config set registry "$NPM_REGISTRY" --global
npm install -g pm2@latest --no-audit --no-fund
command -v pm2 >/dev/null || die "pm2 安装失败"
pm2 -v

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
Node:         $(node -v)
pm2:          $(pm2 -v)
nginx:        $(nginx -v 2>&1)
监听端口:     $PORT（仅 127.0.0.1，由 nginx 反代）

下一步：
  1. vi $ENV_FILE 填写 DEEPSEEK_API_KEY
  2. 本地打包并上传：powershell -File deploy/pack.ps1 && powershell -File deploy/upload.ps1 -Archive <包>
  3. 服务器执行：bash /root/bideti-deploy/02-release.sh /tmp/<包>.tar.gz
EOF
