# Supabase 中文邮件模板（可直接粘贴）

Supabase 控制台 → **Authentication → Emails** → 选中对应模板 → 把下面文件的内容整段粘进「Message body」，
主题按表里的建议填写。模板引擎是 Go template，变量用 `{{ .Xxx }}`。

| 文件 | 控制台模板名 | 建议主题 | 何时发出 |
| --- | --- | --- | --- |
| `magic-link.html` | Magic Link | `必得题库 · 登录验证码 {{ .Token }}` | 前端「验证码登录 / 注册」（`signInWithOtp`） |
| `confirm-signup.html` | Confirm signup | `必得题库 · 完成注册（验证码 {{ .Token }}）` | 前端「用邮箱注册」（`signUp`，且开启了邮箱确认） |
| `reset-password.html` | Reset Password | `必得题库 · 重置密码` | 找回密码（`resetPasswordForEmail`） |
| `change-email.html` | Change Email Address | `必得题库 · 确认更换邮箱` | 用户改邮箱 |
| `reauthentication.html` | Reauthentication | `必得题库 · 身份验证码 {{ .Token }}` | 敏感操作二次验证 |

## 可用变量

| 变量 | 含义 |
| --- | --- |
| `{{ .Token }}` | 6 位数字验证码（**本项目的登录就靠它**） |
| `{{ .ConfirmationURL }}` | 一次性确认链接（点开即完成验证） |
| `{{ .TokenHash }}` | token 的哈希，自建验证页时用 |
| `{{ .SiteURL }}` | 项目 Site URL |
| `{{ .RedirectTo }}` | 本次请求带的回跳地址 |
| `{{ .Email }}` / `{{ .NewEmail }}` | 当前邮箱 / 新邮箱（改邮箱模板用） |
| `{{ .Data }}` | `user_metadata` 对象 |

## 三条硬规则

1. **先关掉 `Confirm email`，再谈模板**：`Confirm email` 开着时，新邮箱调用 `signInWithOtp` 会走 **Confirm signup** 模板
   （默认英文、只有链接），你在 Magic Link 上怎么改都不会生效。关闭路径见 `../04-Supabase-后台核对清单.md` 第 1 节。
2. **`magic-link.html` 必须保留 `{{ .Token }}`**：删掉它用户就只能点链接，`AuthModal` 的 6 位码输入框会一直报错
   （前端已有兜底提示文案：`若邮件内只有登录链接，请在 Supabase 邮件模板中加入 {{ .Token }}`）。
3. **OTP 有效期要和界面一致**：`AuthModal` 写的是「10 分钟内有效」，而 Supabase 默认 `Email OTP Expiration = 3600` 秒。
   请在 **Authentication → Rate Limits → Email OTP Expiration** 把它改成 **600**（旧界面在 Providers → Email），
   或者把界面文案改成 60 分钟，二者必须一致。
4. **不要放进用户可控文本**（昵称、题干等）而不转义；模板里只用上表变量最安全。

## 粘贴顺序建议

1. 先配 SMTP（见 `../01-163-SMTP-与-中文邮件模板.md` 第二节），否则默认邮件服务只能发给项目团队成员，且限 2 封/小时；
2. 再改 `Magic Link`（主路径，验证码登录）；
3. 再改 `Confirm signup` / `Reset Password` / `Change Email Address` / `Reauthentication`；
4. 每次改完点 **Send test email**（或用一个非团队成员邮箱真实走一遍注册）验收。
