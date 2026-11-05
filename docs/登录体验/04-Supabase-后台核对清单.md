# 04 · Supabase 后台逐步核对清单（发件人仍是 Supabase / 收到英文确认链接）

> 现象：① 发件人还是 `noreply@mail.app.supabase.io`，自定义 SMTP 没生效；② 收到的是英文 **Confirm your email** 链接，而不是 6 位验证码。
> 这两个现象各对应一个开关，改对就正常。所有页面都给你**直达 URL**，照着点即可。

## 0. 症状 → 根因

| 现象 | 根因 | 去哪修 |
| --- | --- | --- |
| 发件人是 Supabase 官方邮箱 | `Enable Custom SMTP` 开关没打开，或填完没 **Save**，或改到了**另一个项目** | §2 |
| 邮件是 "Confirm your email" + 只有链接 | `Confirm email` 开着 → 新邮箱的 `signInWithOtp` 走 **Confirm signup** 模板（默认英文、只有链接） | §1 |
| 邮件里没有 6 位数字 | Magic Link 默认模板不含 `{{ .Token }}` | §3 |
| 验证码一直"错误或已过期" | OTP 位数不是 6 / 有效期太短 / 用了旧码 | §4 |
| 点邮件里的按钮跳不回站内 | Site URL / Redirect URLs 没配 | §5 |

> 两个症状同时出现，通常意味着改动**根本没生效**——先做 §0 的项目核对，再动开关。

## 0.1 先确认你改的是同一个项目（30 秒，别跳过）

- 前端代码写死的项目地址是 `https://axcezfmqjotwcgqnaqro.supabase.co`（`src/lib/supabase.ts`），**project ref = `axcezfmqjotwcgqnaqro`**；
- 浏览器地址栏必须形如 `https://supabase.com/dashboard/project/axcezfmqjotwcgqnaqro/auth/smtp`；
- 如果不是，用左上角/右上角的**项目切换器**切到 `axcezfmqjotwcgqnaqro` 再改（常见坑：账号下有多个项目、开过 trial 副本、看的是别的组织）。

## 1. 关掉 Confirm email（"收到确认链接"的直接原因）

页面：`https://supabase.com/dashboard/project/axcezfmqjotwcgqnaqro/auth/providers`
（等价路径：**Authentication → Sign In / Providers → Email → 展开**）

| 开关 | 改成 | 原因 |
| --- | --- | --- |
| Enable Email provider | **开** | 关掉的话邮箱验证码登录整体失效 |
| **Confirm email** | **关** | 开着时新用户走 Confirm signup（英文+链接）；关掉后统一走 Magic Link（我们要的 6 位码） |
| Secure email change | 关 | 目前没有"改邮箱"流程 |
| Secure password change | 关 | 同上 |

改完点 **Save changes**，刷新页面确认开关还在「关」的位置。

**关掉之后的行为变化**（提前知道，避免误判）：

- `signUp(email, password)` 立刻拿到会话，前端「用邮箱注册」会直接登录成功，不再等邮件；
- 已经注册但**没确认**的账号不会自动变成已确认：测试时**换个新邮箱**，或到 `.../auth/users` 把测试账号删掉重来；
- 「发送验证码登录」这条主路径完全不受影响。

> 若你**想保留** Confirm email（密码注册必须先验邮箱），那就必须把 **Confirm signup** 模板也换成中文含 `{{ .Token }}` 的版本（§3.2），因为新用户的 `signInWithOtp` 永远先发 Confirm signup。
> 两条路都能用，但**只改 Magic Link 一定失败**——这正是你现在的情况。

## 2. SMTP：让发件人变成 163（三步缺一不可）

页面：`https://supabase.com/dashboard/project/axcezfmqjotwcgqnaqro/auth/smtp`
（等价路径：**Authentication → Emails → SMTP Settings**；旧界面在 **Project Settings → Auth**）

**Step 1 打开总开关**
页面顶部的 **Enable Custom SMTP**（有的版本叫 *Enable custom SMTP*）开关拨到**开**。
⚠️ 填了 6 个字段但开关是关的，Supabase 仍然用自带服务发信 —— **这是 90% 的"没生效"原因**。

**Step 2 填 6 个字段**

| 字段（界面英文） | 值 | 说明 |
| --- | --- | --- |
| Host | `smtp.163.com` | 不要带 `https://`、不要带空格 |
| Port | `465` | SSL；被墙/被占时改 `587`（STARTTLS） |
| Username | `luoweilw@163.com` | **完整邮箱**，不是 `luoweilw` |
| Password | **16 位授权码** | 不是登录密码；每次编辑该页都要重填 |
| Sender email | `luoweilw@163.com` | **必须与 Username 完全一致**，否则 163 报 `553` |
| Sender name | `必得题库` | 收件人看到的显示名 |
| Minimum interval per user | `60`（秒，若该页有此项） | 与前端 60 秒冷却一致 |

**Step 3 保存并回读**
点 **Save changes** → 刷新页面 → 确认①开关仍是「开」②字段还在③没有红色报错。

**Step 4 自测（关键判断点）**
用页面上的 **Send test email** 发到**一个非 163 邮箱**（QQ / Gmail / Outlook），看发件人：
- 显示 `必得题库 <luoweilw@163.com>` → ✅ SMTP 生效；
- 仍是 `noreply@mail.app.supabase.io` → ❌ 回 Step 1/Step 3。

**163 特有坑**
- `Password` 保存后**不回显**，再次打开页面是空的——不代表没配，以开关和测试信结果为准；
- 163 同一个账号自发自收容易丢信 → 测试收件人**别用** `luoweilw@163.com` 自己；
- 163 免费邮箱有日发信上限，超限返回 `550`/`554`，试跑阶段够用，用户量起来要换专业邮件服务。


## 3. 模板：中文 + 必须含 `{{ .Token }}`

页面：`https://supabase.com/dashboard/project/axcezfmqjotwcgqnaqro/auth/templates`
（等价路径：**Authentication → Emails → Templates**）

每个模板只有两个框：**Subject** 和 **Message body**（可切 HTML 视图）。改完必须 **Save**，
且**只有下一次发信才会生效**（已发出的邮件不会变）。

### 3.1 Magic Link（主路径，关掉 Confirm email 后所有验证码登录都走它）

- **Subject**：`必得题库 · 登录验证码 {{ .Token }}`
- **Message body**：粘 `docs/登录体验/email-templates/magic-link.html` 全文
- **自检**：源码里能看到 `{{ .Token }}`（点号、大小写、两侧空格要与这里一致；`{{.Token}}` 也行）
- **Save**

### 3.2 Confirm signup（仅在保留 Confirm email 时需要）

- **Subject**：`必得题库 · 完成注册（验证码 {{ .Token }}）`
- **Message body**：粘 `email-templates/confirm-signup.html`

### 3.3 其余三个（建议一次做完）

| 控制台模板 | 文件 | 建议主题 |
| --- | --- | --- |
| Reset Password | `reset-password.html` | `必得题库 · 重置密码` |
| Change Email Address | `change-email.html` | `必得题库 · 确认更换邮箱` |
| Reauthentication | `reauthentication.html` | `必得题库 · 身份验证码 {{ .Token }}` |

### 3.4 模板注意事项

- 模板引擎是 **Go template**，变量名**大小写敏感**，写错会原样输出或渲染失败；
- 正文**不要**堆图片、不要放营销语/外链，163 代发很容易被判垃圾；
- 正文不要出现 `{{ .Email }}` 之类的用户数据（防钓鱼观感，也避免被邮箱折成可疑链接）；
- 每个模板改完都 Save 一次；漏点 Save 是最常见的"改了没效果"。

## 4. 有效期与位数（让「10 分钟」名副其实）

| 设置 | 位置 | 改成 |
| --- | --- | --- |
| Email OTP Expiration | `.../auth/rate-limits`（部分版本在 Providers → Email） | `600` 秒（默认 3600） |
| Email OTP Length | `.../auth/providers` → Email（部分版本在 Rate Limits） | `6`（前端只认 6 位：`/^\d{6}$/`） |

> 不同 dashboard 版本会把这两项放在不同页面，**看到哪个改哪个**，只要值对就行。

## 5. Site URL / Redirect（邮件按钮能跳回站内）

页面：`.../auth/url-configuration`

- **Site URL**：`https://igoiget.com`
- **Redirect URLs**：至少加 `https://igoiget.com/**`；本机调试再加 `http://localhost:3000/**`

## 6. 端到端验收（5 步，5 分钟）

1. 无痕窗口打开 `https://igoiget.com` → 右上角登录 → 输入**一个全新的、非团队成员的、非 163 的邮箱** → 发送验证码；
2. 收件箱里应是：发件人 **必得题库 `<luoweilw@163.com>`**、主题中文、正文里有 **6 位数字**；
3. 填 6 位码 → 登录成功，额度条从「游客 10 题」变成「50 题」；
4. 立刻再点一次发送 → 提示「操作过于频繁，请在 60 秒后重试。」（说明 Minimum interval 生效）；
5. 故意输错 6 位码 → 提示「验证码错误或已过期，请重新获取（验证码 10 分钟内有效）。」

## 7. 还是不对时按这个查

| 现象 | 下一步 |
| --- | --- |
| 仍是 Supabase 发件人 | §0.1 项目 ref → §2 Step 1 开关 → Save → Send test email 看报错文案 |
| Send test email 报 `535` | 授权码错 / 163 侧 SMTP 未开启 / 授权码带了空格 |
| Send test email 报 `553` | Sender email ≠ Username |
| 报 `550`/`554` | 163 限频或内容被判垃圾，隔几分钟再试 |
| 邮件进垃圾箱 | 让用户查垃圾箱；163 代发信誉有限，后续换阿里云邮件推送/Resend（只改 Supabase 一处） |
| 中文模板生效但仍无 6 位码 | 模板里 `{{ .Token }}` 被删/写错，或 Confirm email 又开回来了（走了 Confirm signup） |
| 有码但一直"错误或已过期" | OTP Length ≠ 6、复制的旧码、Expiration 太短 |
| 想看失败原因 | **Logs → Auth**（或 Authentication → Logs），筛 `mail`、`smtp`、`error` |

## 8. 可选：用 Management API 一眼验证配置（不用点界面）

在 PowerShell 里执行（token 在 https://supabase.com/dashboard/account/tokens 生成）：

```powershell
$ref = 'axcezfmqjotwcgqnaqro'
$token = 'sbp_你的个人访问令牌'
$cfg = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/config/auth" -Headers @{ Authorization = "Bearer $token" }
$cfg | Select-Object external_email_enabled, mailer_autoconfirm, smtp_host, smtp_port, smtp_user, smtp_admin_email, smtp_sender_name, mailer_otp_exp
```

判读：

| 输出 | 含义 |
| --- | --- |
| `smtp_host` 为空或非 `smtp.163.com` | 自定义 SMTP **没生效** |
| `mailer_autoconfirm` = `True` | Confirm email **已关闭**（我们要的状态）；`False` 表示还开着 |
| `external_email_enabled` = `True` | 邮箱 provider 已启用 |
| `mailer_otp_exp` = `600` | 有效期已改（单位秒） |

## 9. 一句话总结

**三个开关**：`Confirm email` **关**、`Enable Custom SMTP` **开**、`Magic Link` 模板带 `{{ .Token }}`；
**三个值**：`Sender email` = `Username` = `luoweilw@163.com`、`Password` = **16 位授权码**、`Email OTP Expiration` = `600`。
