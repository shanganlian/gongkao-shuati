# 必得题库 · 阿里云迁移执行手册

## 0. 本次确认的参数

| 项目 | 值 |
| --- | --- |
| 服务器 | `47.106.172.207`（阿里云深圳，宁ICP备2026004293号接入） |
| 域名 | `igoiget.com`、`www.igoiget.com`（没有 m. 等子域） |
| 证书邮箱 | `luoweilw@163.com` |
| 运行用户 | `bideti` |
| 应用目录 | `/var/www/bideti`（`releases/` + `current` 软链） |
| 密钥文件 | `/etc/bideti/bideti.env`（`root:bideti 640`） |
| 后端端口 | `127.0.0.1:3002`，只允许 nginx 反代 |
| Node | 24 LTS |
| 进程管理 | pm2（单实例 fork） |
| 证书 | Let's Encrypt，certbot nginx 插件 |
| AI | 只配 `DEEPSEEK_API_KEY`；不配 Gemini，走内置降级 |

> 本目录脚本只做部署，不会自动改 DNS。**DNS 必须最后切**，否则证书 HTTP-01 校验会失败。

---

## 1. 本地代码准备（已完成）

本次已提交的运行时修正：

1. `server.ts` 用 `import.meta.url` 计算 `appRoot`，修复生产模式 ESM 下没有 `__dirname` 导致的启动崩溃。
2. `tsx` 从 `devDependencies` 移到 `dependencies`，保证服务器 `npm ci --omit=dev` 后仍能启动。
3. `.nvmrc` 改为 `24`。
4. `server.ts` 生产模式默认只监听 `127.0.0.1`，由 nginx 反代；本地开发仍监听 `0.0.0.0`。
5. 新增 `.gitattributes`，保证 `deploy/*.sh` 在 Windows 检出后仍是 LF。

发布包只上传运行所需文件，不拉 Git 历史（仓库 `.git` 约 3.8GB）：

```text
dist/ server.ts shared/ src/ package.json package-lock.json tsconfig.json deploy/
```

---

## 2. 上传部署脚本

在本机仓库根目录执行（PowerShell）：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/upload.ps1 -Archive .\bideti-release-YYYYmmdd-HHMMSS.tar.gz
```

首次还没有发布包时，可先只上传脚本：

```powershell
scp -r .\deploy root@47.106.172.207:/root/bideti-deploy
ssh root@47.106.172.207 "chmod +x /root/bideti-deploy/*.sh"
```

上传脚本不会上传 `.env` 或任何密钥。

---

## 3. 主机预检（只读）

```bash
ssh root@47.106.172.207
bash /root/bideti-deploy/00-preflight.sh
```

bootstrap 之前出现 `nginx/pm2/certbot 未安装`、`Node 低于 24`、`/etc/bideti/bideti.env 尚未创建` 都是正常的，脚本会记为 WARN。真正需要先处理的是：

- 磁盘可用空间不足 5GB；
- 内存低于 1GB；
- DeepSeek / Supabase 出站不可达；
- 80/443 被其他业务占用。

阿里云安全组只需放行 **22、80、443**；`3002` 不要对公网开放。

---

## 4. 初始化主机

```bash
bash /root/bideti-deploy/01-bootstrap.sh
```

会完成：

- 安装 nginx、firewalld、tar/xz、openssl、rsync；
- 安装 Node 24（npmmirror 二进制 tar.xz 直装到 `/usr/local`，失败依次回退 registry.npmmirror / 阿里云 / nodejs.org，不依赖 NodeSource）；
- 安装 pm2，npm 全局镜像设为 npmmirror；
- 创建 `bideti` 用户、`/var/www/bideti`、`/var/log/bideti`、`/etc/bideti`；
- 创建并启用 `pm2-bideti.service`，配合 `pm2 save` 实现开机恢复；
- 内存小于 2GB 且有需要时创建 2GB swap；
- firewalld 放行 80/443；
- SELinux 为 Enforcing 时放行 nginx 反代与静态目录。

重复执行是安全的。

Node 安装包默认从各镜像的 `index.json` 取最新 24.x，并在下载后做 SHA256 校验；如需固定版本或走内网镜像：

```bash
NODE_VERSION=24.22.2 bash /root/bideti-deploy/01-bootstrap.sh
NODE_MIRROR=http://内网镜像/nodejs bash /root/bideti-deploy/01-bootstrap.sh
```

镜像按 `npmmirror → registry.npmmirror → 阿里云 → nodejs.org` 顺序回退；`NODE_SKIP_VERIFY=1` 可跳过校验（仅限完全可信的内网镜像）。

---

## 5. 填写密钥

```bash
vi /etc/bideti/bideti.env
```

至少填写：

```dotenv
NODE_ENV=production
PORT=3002
DEEPSEEK_API_KEY=sk-你的真实密钥
```

注意：

- 不要配置 `GEMINI_API_KEY`。大陆服务器访问 Google 不稳定，相关接口会自动走内置降级；浏览器朗读由 `SpeechSynthesis` 在本地完成，不经过服务器。
- Supabase 不填时使用 `shared/api-auth.ts` 里的内置公开配置；要切项目再填 `SUPABASE_URL` / `SUPABASE_ANON_KEY`。
- 文件权限保持 `root:bideti 640`，不要 `chmod 644`。
- 不要用 `echo` 写密钥，避免留在 shell history。

---

## 6. 本地打包并上传

```powershell
cd D:\行岸公考
powershell -ExecutionPolicy Bypass -File deploy/pack.ps1
```

脚本会执行 `npm ci` + `npm run build`，生成：

```text
bideti-release-YYYYmmdd-HHMMSS.tar.gz
bideti-release-YYYYmmdd-HHMMSS.tar.gz.sha256
```

如果刚刚已经 `npm ci` 过，可加 `-SkipInstall` 跳过重复安装。

上传：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/upload.ps1 -Archive .\bideti-release-YYYYmmdd-HHMMSS.tar.gz
```

发布包约 130–150MB（gzip 后，实测 132.3MB）；`dist/` 原始约 613MB，`public/` 约 612MB，不上传 `node_modules` 和 `.git`。

---

## 7. 首次发布

```bash
bash /root/bideti-deploy/02-release.sh /tmp/bideti-release-YYYYmmdd-HHMMSS.tar.gz
```

脚本执行顺序：

1. 校验 `.sha256`；
2. 解包到 `/var/www/bideti/releases/<时间戳>`；
3. `npm ci --omit=dev`；
4. 首次发布时安装 `deploy/nginx/igoiget.conf`；
5. `current` 软链原子切换；
6. pm2 重启并 `pm2 save`；
7. 健康检查：
   - `/api/stats/overview` 期望返回 **401 JSON**（说明后端已启动、鉴权中间件生效）；
   - 首页包含「必得题库」；
8. 失败自动切回上一个版本；
9. 只保留最近 3 个 release。

首次发布后本机验证（还没有证书，用 HTTP + Host）：

```bash
curl -fsS -H 'Host: igoiget.com' http://127.0.0.1/ | grep -o '<title>[^<]*</title>'
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: igoiget.com' http://127.0.0.1/api/stats/overview
# 期望第二行输出 401
```

查看进程：

```bash
sudo -u bideti -H pm2 status bideti
sudo -u bideti -H pm2 logs bideti
```

---

## 8. 切 DNS 前测试（不依赖域名解析）

在服务器上：

```bash
curl -fsS -H 'Host: igoiget.com' http://127.0.0.1/ | grep '必得题库'
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: igoiget.com' http://127.0.0.1/api/stats/overview
```

在本地（可选，验证公网 80 已通）：

```powershell
curl.exe -I -H "Host: igoiget.com" http://47.106.172.207/
```

如果返回 200/301，说明 nginx 已能按 Host 命中站点。

---

## 9. 最后切 DNS

在域名解析处修改：

| 主机记录 | 类型 | 值 | TTL |
| --- | --- | --- | --- |
| `@` | A | `47.106.172.207` | 300 |
| `www` | A | `47.106.172.207` | 300 |

要求：

- 删除旧的 A/AAAA 记录，避免解析到旧主机；
- 不要只切 `www` 不切 `@`；
- 等 `nslookup igoiget.com` 和 `nslookup www.igoiget.com` 都返回 `47.106.172.207` 再继续；
- 备案接入已经是阿里云这台服务器（宁ICP备2026004293号），但仍建议确认阿里云控制台里域名状态正常，否则 80 可能被拦。

---

## 10. 申请 HTTPS 证书

DNS 生效后执行：

```bash
bash /root/bideti-deploy/04-certbot.sh
```

脚本会：

- 检查两个域名都解析到 `47.106.172.207`；
- 安装 certbot（dnf 优先，失败则 venv）；
- 用 nginx 插件申请证书并配置 301 跳转；
- 配置自动续期（systemd timer 或 `/etc/cron.d/certbot-renew`）；
- 执行 `certbot renew --dry-run`。

如果 DNS 还没完全生效，不要用 `SKIP_DNS_CHECK=1` 硬跑；HTTP-01 会失败并触发 Let's Encrypt 频率限制。

---

## 11. 上线验收

```bash
curl -I https://igoiget.com/
curl -I https://www.igoiget.com/
curl -s https://igoiget.com/ | grep '必得题库'
curl -s -o /dev/null -w '%{http_code}\n' https://igoiget.com/api/stats/overview   # 401
```

浏览器检查：

1. 页脚显示 `© 2026 必得题库 · 宁ICP备2026004293号`，备案号链接到 `https://beian.miit.gov.cn/`；
2. 注册/登录正常（Supabase）；
3. 面试评分能返回 `provider=deepseek`（需登录后带 Bearer token 测试）；
4. `www` 与裸域都能打开，证书 SAN 包含两个域名；
5. 刷新任意前端路由不 404（nginx `try_files` 已处理）。

说明：`/api/interview-review` 有 `requireAuth`。现有 `scripts/smoke-interview-endpoint.mjs` 不带 Bearer 会 401，这是预期；请在浏览器登录后测，或给脚本传登录后的 `INTERVIEW_API_TOKEN`。

---

## 12. 回滚与日常发布

回滚到上一个 release：

```bash
bash /root/bideti-deploy/03-rollback.sh
```

回滚到指定版本：

```bash
bash /root/bideti-deploy/03-rollback.sh /var/www/bideti/releases/20261101-120000
```

日常发布只需要重复第 6、7 步；nginx 配置只在首次缺失时安装，certbot 改过的 443 配置不会被覆盖。

常用命令：

```bash
sudo -u bideti -H pm2 status
sudo -u bideti -H pm2 logs bideti --lines 100
sudo -u bideti -H pm2 restart bideti
sudo -u bideti -H pm2 save
nginx -t && systemctl reload nginx
```

---

## 13. 安全与注意事项

- `/etc/bideti/bideti.env` 权限 `root:bideti 640`；不要提交、不要贴到聊天/日志。
- pm2 `save` 会把环境变量写入 `/home/bideti/.pm2/dump.pm2`（仅该用户可读）；这是开机恢复所需，不要拷贝该文件。
- 只保留最近 3 个 release；旧版本由发布脚本清理。
- 发布脚本用 `flock` 防并发，失败自动回滚。
- `proxy_pass http://127.0.0.1:3002;` 后面不要加斜杠。
- 证书首次签发后，发布脚本的健康检查会自动改走 `https://127.0.0.1` + `--resolve`，不依赖公网 DNS。
- 大陆服务器不建议配置 Gemini；`/api/generate-plan`、`/api/ai-review`、`/api/tts` 会走内置兜底/浏览器朗读。
- 备案是硬门槛：`igoiget.com` 必须保持宁ICP备2026004293号且阿里云接入正常。


