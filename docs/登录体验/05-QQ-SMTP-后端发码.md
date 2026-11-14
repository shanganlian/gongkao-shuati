# 05 · QQ SMTP + 后端发 6 位验证码

> 2026-11-09 切换：验证码主链路从「前端直连 Supabase `signInWithOtp`」改为
> 「后端生成 6 位码 → QQ SMTP 发信 → 后端校验 → 换 Supabase session」。
> Supabase 后台的 SMTP 仍建议从 163 改成 QQ，作为密码重置/邮件链接的备用通道。

## 一、链路

```
AuthModal
  └─ POST /api/auth/email-code            （shared/email-auth.ts）
       ├─ 生成 6 位随机码，内存保存 10 分钟（60 秒冷却、5 次尝试）
       ├─ nodemailer → smtp.qq.com:465 SSL
       └─ 邮件：必得题库登录验证码 + 6 位码 + 一键登录链接
  └─ POST /api/auth/verify-email-code
       ├─ 校验 6 位码
       ├─ Supabase Admin createUser / generateLink（magiclink）
       └─ 返回 access_token + refresh_token → 前端 supabase.auth.setSession()
  └─ GET /api/auth/email-code/link        （邮件「一键登录」）
       └─ 校验链接 token → 换 session → 302 到站点 #access_token=...
```

配置体检：`GET /api/auth/email-code/status`，只返回是否配置、host/port、脱敏账号、
`serviceRoleConfigured`，**绝不返回授权码**。

`configured` 的判定只看 `SMTP_USER`、`SMTP_PASS`、`SMTP_FROM_EMAIL` 三项是否都非空
（`SMTP_USER` / `SMTP_FROM_EMAIL` 有内置默认值，通常只需填 `SMTP_PASS`；但建议两者显式写上且完全相同）。
`SUPABASE_SERVICE_ROLE_KEY` 只影响 `serviceRoleConfigured`，**不会**让 `configured` 变 true。

## 二、必须配置的环境变量

服务器：`/etc/bideti/bideti.env`；本地：`.env`。

| 变量 | 值 / 说明 |
| --- | --- |
| `SMTP_HOST` | `smtp.qq.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `1` |
| `SMTP_USER` | `775830833@qq.com` |
| `SMTP_PASS` | QQ 邮箱「设置 → 账户 → POP3/SMTP 服务」生成的**授权码**，不是 QQ 登录密码 |
| `SMTP_FROM_NAME` | `必得题库` |
| `SMTP_FROM_EMAIL` | `775830833@qq.com`（QQ 要求与 SMTP_USER 一致，否则 553） |
| `SITE_URL` | 生产 `https://igoiget.com`；本地 `http://localhost:3002` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role`，**只放服务端** |
| `EMAIL_CODE_SECRET` | 可选；验证码哈希固定盐，不填则进程启动时随机生成 |

`deploy/ecosystem.config.cjs` 已把上述键加入 pm2 透传白名单；
`deploy/01-bootstrap.sh` 新建 `bideti.env` 时也会生成这些键（空值，等你自己填）。

## 三、QQ 邮箱侧

1. 登录 `https://mail.qq.com`；
2. **设置 → 账户 → POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV 服务**；
3. 开启 **POP3/SMTP 服务**（需短信验证）；
4. 生成 **授权码**，只显示一次，复制保存；
5. 把授权码填到 `SMTP_PASS`，不要写进 Git、不要用 `echo` 写入 shell history。

QQ 免费邮箱有日发信量限制；用户量上来后换企业邮箱或专业邮件服务。

## 四、Supabase 后台（备用通道也切 QQ）

路径：Supabase 控制台 → 项目 `axcezfmqjotwcgqnaqro` → **Authentication → Emails → SMTP Settings**。

| 字段 | 值 |
| --- | --- |
| Enable custom SMTP | 开 |
| Host | `smtp.qq.com` |
| Port | `465` |
| Username | `775830833@qq.com` |
| Password | QQ 授权码 |
| Sender email | `775830833@qq.com` |
| Sender name | `必得题库` |
| Minimum interval per user | `60` 秒 |

同时确认 **Authentication → Providers → Email**：
`Enable Email provider` 开、`Confirm email` 关（关掉后 `signInWithOtp` 才走 Magic Link 模板）。

`Authentication → Rate Limits`：`Email OTP Expiration` = `600`，`Email OTP Length` = `6`。

Magic Link 模板必须含 `{{ .Token }}`，参考 `docs/登录体验/01-163-SMTP-与-中文邮件模板.md` 第三节；
现在主链路已由后端发码，模板只影响备用链接/密码重置。

邮件显示名由 Nodemailer 按 RFC 2047 编码为 `From: =?UTF-8?B?5b+F5b6X6aKY5bqT?= <...>`，
客户端解码后就是「必得题库」，不会出现中文裸头乱码。若 `status.fromName` 或邮件里看到乱码，
先确认 `/etc/bideti/bideti.env` / `.env` 本身是 UTF-8 保存（不要用 GBK 写入），而不是代码问题。

`Authentication → URL Configuration` 的 **Redirect URLs** 至少包含：
`https://igoiget.com/**`；本地调试再加 `http://localhost:3002/**`。

## 五、本地自测

```powershell
# 1. 填本地 .env 的 SMTP_PASS（以及可选 SUPABASE_SERVICE_ROLE_KEY）
# 2. 启动
npm run dev

# 3. 看配置是否读对（不会回显授权码）
Invoke-RestMethod http://127.0.0.1:3002/api/auth/email-code/status

# 4. 发码
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3002/api/auth/email-code `
  -ContentType 'application/json' -Body '{"email":"你的邮箱@example.com"}'
```

预期：
- `status.configured = true`，`host = smtp.qq.com`，`port = 465`，`secure = true`；
- 发码接口 200，返回 `{ ok: true, delivery: "qq-smtp", expiresIn: 600, linkIncluded: true }`；
- 若 `SMTP_PASS` 错，返回 502，提示 QQ 鉴权失败（不是 500）。

没有真实 QQ 授权码时，可用本地假 SMTP 服务器验证「配置读取 + 发信成功」：
把 `SMTP_HOST` 指向 `127.0.0.1`、`SMTP_PORT` 指向假服务器端口、`SMTP_SECURE=0`，
仅用于测试，不要写进 `.env.example`。

## 六、限制与回滚

- 验证码存**进程内存**：生产 pm2 是单实例（`instances: 1`），重启会清空未使用的码；
  若以后多实例/Serverless，必须换成 Redis 或数据库。
- 没有 `SUPABASE_SERVICE_ROLE_KEY` 时：能发码、能收到邮件，但校验接口返回 503，
  无法兑换登录态；这是 Supabase 的安全边界，不能绕过。
- 回滚：把 `src/context/AuthContext.tsx` 的 `sendEmailOtp` / `verifyEmailOtp` 改回
  `supabase.auth.signInWithOtp` / `verifyOtp`，并确保 Supabase SMTP 与 Magic Link 模板可用。
