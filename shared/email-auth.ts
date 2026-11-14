import type { Express, Request, Response } from 'express';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import * as nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from './api-auth';

/**
 * 邮箱验证码登录（后端发码版）。
 *
 * 与旧版最大的区别：验证码不再由 Supabase Auth 代发，而是
 *   1. 本模块生成 6 位数字码，存内存（10 分钟有效、60 秒冷却、5 次尝试）；
 *   2. 通过 QQ 邮箱 SMTP（smtp.qq.com:465 SSL）发送中文邮件；
 *   3. 前端拿到 code 后调 /api/auth/verify-email-code，本模块再用
 *      Supabase Admin 生成一次性 magiclink token 并换回正式 Supabase session。
 *
 * 生产是 pm2 单实例（deploy/ecosystem.config.cjs 的 instances: 1），所以内存存储够用；
 * 如果以后上多实例/Serverless，必须把 codeStore 换成 Redis 或数据库。
 */

const DEFAULT_SITE_URL = 'https://igoiget.com';
const DEFAULT_SMTP_HOST = 'smtp.qq.com';
const DEFAULT_SMTP_PORT = 465;
const DEFAULT_SMTP_USER = '775830833@qq.com';
const DEFAULT_FROM_NAME = '必得题库';
const DEFAULT_CODE_TTL_SECONDS = 600;
const DEFAULT_COOLDOWN_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_EMAIL_HOUR = 8;
const MAX_SENDS_PER_IP_HOUR = 20;

type EmailCodeEntry = {
  codeHash: Buffer;
  linkHash: Buffer;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  ip: string;
};

type SessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  configured: boolean;
};

/** 同一进程内共享；键为小写邮箱 */
const codeStore = new Map<string, EmailCodeEntry>();
/** email:<邮箱> / ip:<地址> -> 最近一小时发送时间戳 */
const sendLog = new Map<string, number[]>();
/** 未配置 EMAIL_CODE_SECRET 时用进程级随机密钥，重启后旧码自然失效 */
const fallbackSecret = randomBytes(32);
let transporterCache: { key: string; transporter: ReturnType<typeof nodemailer.createTransport> } | null = null;

class EmailAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'EmailAuthError';
    this.code = code;
    this.status = status;
  }
}

function readInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'on', 'yes'].includes(raw)) return true;
  if (['0', 'false', 'off', 'no'].includes(raw)) return false;
  return fallback;
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254) return null;
  // 与前端 AuthModal 的校验保持一致；\s 已排除换行，避免邮件头注入
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function codeSecret(): Buffer {
  const configured = (process.env.EMAIL_CODE_SECRET || '').trim();
  return configured ? Buffer.from(configured, 'utf8') : fallbackSecret;
}

function hashValue(email: string, value: string): Buffer {
  return createHmac('sha256', codeSecret()).update(`${email}:${value}`).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function readSmtpConfig(): SmtpConfig {
  const host = (process.env.SMTP_HOST || DEFAULT_SMTP_HOST).trim();
  const defaultPort = host.toLowerCase().endsWith('qq.com') ? DEFAULT_SMTP_PORT : 587;
  const port = readInt('SMTP_PORT', defaultPort);
  const secure = readBool('SMTP_SECURE', port === 465);
  const user = (process.env.SMTP_USER || DEFAULT_SMTP_USER).trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  const fromEmail = (process.env.SMTP_FROM_EMAIL || user).trim();
  const fromName = (process.env.SMTP_FROM_NAME || DEFAULT_FROM_NAME).trim();

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromName,
    fromEmail,
    configured: Boolean(user && pass && fromEmail),
  };
}

function getTransporter(config: SmtpConfig) {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.pass}`;
  if (transporterCache && transporterCache.key === key) return transporterCache.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    // QQ 邮箱 SSL 证书使用 smtp.qq.com，显式指定避免反代/容器环境 SNI 取错
    tls: { servername: config.host },
  });

  transporterCache = { key, transporter };
  return transporter;
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const name = email.slice(0, at);
  return `${name.slice(0, Math.min(4, name.length))}***${email.slice(at)}`;
}

function resolveSiteUrl(req?: Request): string {
  const configured = (process.env.SITE_URL || process.env.APP_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');

  const origin = req?.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      // 生产环境只信任显式 SITE_URL，避免伪造 Origin 把登录 token 带去别的域名；
      // 本地开发才允许用请求 Origin（http://localhost:3002 / 局域网 IP）。
      if (process.env.NODE_ENV !== 'production' &&
          (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid Origin
    }
  }

  return DEFAULT_SITE_URL;
}

function buildEmailLink(siteUrl: string, email: string, token: string): string {
  const url = new URL('/api/auth/email-code/link', siteUrl);
  url.searchParams.set('email', email);
  url.searchParams.set('token', token);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmailHtml(params: { code: string; link: string | null; siteUrl: string }): string {
  const { code, link, siteUrl } = params;
  const safeSiteUrl = escapeHtml(siteUrl);
  const safeLink = link ? escapeHtml(link) : '';
  const actionBlock = link
    ? `
            <tr>
              <td align="center" style="padding:22px 24px 8px;">
                <a href="${safeLink}" style="display:inline-block;padding:12px 26px;background:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">一键登录</a>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 24px 0;color:#94a3b8;font-size:12px;line-height:1.7;">
                按钮打不开时可复制此链接到浏览器：<br />
                <a href="${safeLink}" style="color:#059669;word-break:break-all;">${safeLink}</a>
              </td>
            </tr>`
    : `
            <tr>
              <td style="padding:8px 24px 0;color:#64748b;font-size:13px;line-height:1.7;">
                请返回必得题库，输入上方验证码完成登录。
              </td>
            </tr>`;

  return `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
            <tr>
              <td style="background:#059669;padding:18px 24px;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:.5px;">必得题库</td>
            </tr>
            <tr>
              <td style="padding:28px 24px 4px;color:#0f172a;font-size:15px;line-height:1.7;">
                你的登录验证码
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:14px 24px 6px;">
                <div style="display:inline-block;padding:14px 24px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;color:#065f46;font-size:30px;font-weight:700;letter-spacing:8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;">${escapeHtml(code)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:6px 24px 0;color:#64748b;font-size:13px;line-height:1.7;">
                验证码 <strong>10 分钟内有效</strong>，请勿转发给他人。
              </td>
            </tr>${actionBlock}
            <tr>
              <td style="padding:20px 24px 28px;color:#94a3b8;font-size:12px;line-height:1.7;border-top:1px solid #e2e8f0;">
                如果这不是你本人的操作，请忽略本邮件。<br />
                本邮件由系统自动发送，请勿直接回复。
              </td>
            </tr>
          </table>
          <div style="max-width:520px;padding:14px 8px 0;color:#94a3b8;font-size:11px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;">
            必得题库 · 公务员与事业单位备考题库<br />
            <a href="${safeSiteUrl}" style="color:#94a3b8;">${safeSiteUrl}</a>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderEmailText(params: { code: string; link: string | null; siteUrl: string }): string {
  const lines = [
    '必得题库',
    '',
    '你的登录验证码：',
    params.code,
    '',
    '验证码 10 分钟内有效，请勿转发给他人。',
  ];
  if (params.link) {
    lines.push('', '一键登录：', params.link);
  } else {
    lines.push('', '请返回必得题库，输入上方验证码完成登录。');
  }
  lines.push('', `必得题库 · ${params.siteUrl}`, '如果这不是你本人的操作，请忽略本邮件。');
  return lines.join('\n');
}

async function sendLoginCodeMail(params: {
  config: SmtpConfig;
  email: string;
  code: string;
  link: string | null;
  siteUrl: string;
}): Promise<void> {
  const transporter = getTransporter(params.config);
  const info = await transporter.sendMail({
    from: { name: params.config.fromName, address: params.config.fromEmail },
    to: params.email,
    subject: '必得题库登录验证码',
    text: renderEmailText({ code: params.code, link: params.link, siteUrl: params.siteUrl }),
    html: renderEmailHtml({ code: params.code, link: params.link, siteUrl: params.siteUrl }),
    headers: {
      'X-Auto-Response-Suppress': 'All',
    },
  });
  if (Array.isArray(info.rejected) && info.rejected.length > 0) {
    throw new Error(`SMTP rejected recipient: ${info.rejected.join(', ')}`);
  }
}

function countRecent(key: string, now: number): number {
  const windowStart = now - 60 * 60 * 1000;
  const times = sendLog.get(key);
  if (!times) return 0;
  const recent = times.filter(t => t > windowStart);
  if (recent.length === 0) {
    sendLog.delete(key);
  } else if (recent.length !== times.length) {
    sendLog.set(key, recent);
  }
  return recent.length;
}

function recordSend(key: string, now: number): void {
  const times = sendLog.get(key) || [];
  times.push(now);
  sendLog.set(key, times);
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (first) return first.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function serviceRoleConfigured(): boolean {
  return Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}

/**
 * 用 Supabase Admin 创建/确认用户并生成一次性 magiclink token，
 * 再用 anon 客户端 verifyOtp 换回正式 session（access_token + refresh_token）。
 */
async function mintSupabaseSession(email: string, siteUrl: string): Promise<SessionPayload> {
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!serviceRoleKey) {
    throw new EmailAuthError(
      'email_session_not_configured',
      503,
      '服务端未配置 SUPABASE_SERVICE_ROLE_KEY，暂时只能发码、不能兑换登录态。请在 /etc/bideti/bideti.env 与本地 .env 添加 Supabase service_role key 后重启服务。'
    );
  }

  const supabaseUrl = getSupabaseUrl();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 新邮箱自动创建并确认；已存在时忽略“已注册”错误
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createError && !/already.*registered|already.*exists|user.*exists/i.test(createError.message)) {
    throw new EmailAuthError('supabase_user_failed', 502, `创建用户失败：${createError.message}`);
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: siteUrl },
  });
  if (linkError) {
    throw new EmailAuthError('supabase_link_failed', 502, `生成登录令牌失败：${linkError.message}`);
  }

  const hashedToken = linkData?.properties?.hashed_token;
  if (!hashedToken) {
    throw new EmailAuthError('supabase_link_failed', 502, '生成登录令牌失败：Supabase 未返回 hashed_token。');
  }

  const anon = createClient(supabaseUrl, getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let { data: verifyData, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'email',
  });
  // 不同 Supabase 版本对 magiclink token_hash 的 type 命名略有差异，email 失败时再试 magiclink
  if (verifyError) {
    const fallback = await anon.auth.verifyOtp({
      token_hash: hashedToken,
      type: 'magiclink',
    });
    verifyData = fallback.data;
    verifyError = fallback.error;
  }
  if (verifyError || !verifyData.session) {
    throw new EmailAuthError(
      'supabase_verify_failed',
      502,
      `兑换登录态失败：${verifyError?.message || 'Supabase 未返回 session'}`
    );
  }

  return {
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
    expires_in: verifyData.session.expires_in,
    token_type: verifyData.session.token_type,
  };
}

function cleanupStores(): void {
  const now = Date.now();
  for (const [email, entry] of codeStore.entries()) {
    if (entry.expiresAt + 60 * 60 * 1000 < now) codeStore.delete(email);
  }
  const windowStart = now - 60 * 60 * 1000;
  for (const [key, times] of sendLog.entries()) {
    const recent = times.filter(t => t > windowStart);
    if (recent.length === 0) sendLog.delete(key);
    else sendLog.set(key, recent);
  }
}

function sendError(res: Response, status: number, error: string, message: string, extra?: Record<string, unknown>) {
  return res.status(status).json({ error, message, ...(extra || {}) });
}

export function registerEmailAuthRoutes(app: Express): void {
  /**
   * 配置体检：只返回“是否配好”和脱敏后的账号，绝不返回授权码。
   * 本地自测可先看这个接口，再点发送。
   */
  app.get('/api/auth/email-code/status', (req, res) => {
    const smtp = readSmtpConfig();
    return res.json({
      configured: smtp.configured,
      transport: 'qq-smtp',
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: maskEmail(smtp.user),
      fromName: smtp.fromName,
      fromEmail: maskEmail(smtp.fromEmail),
      serviceRoleConfigured: serviceRoleConfigured(),
      siteUrl: resolveSiteUrl(req),
      codeTtlSeconds: readInt('EMAIL_CODE_TTL_SECONDS', DEFAULT_CODE_TTL_SECONDS),
      cooldownSeconds: readInt('EMAIL_CODE_COOLDOWN_SECONDS', DEFAULT_COOLDOWN_SECONDS),
      maxAttempts: readInt('EMAIL_CODE_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
    });
  });

  /** 发送 6 位数字验证码 */
  app.post('/api/auth/email-code', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) return sendError(res, 400, 'invalid_email', '请输入有效邮箱。');

    const smtp = readSmtpConfig();
    if (!smtp.configured) {
      return sendError(
        res,
        503,
        'email_not_configured',
        '邮件服务未配置：请在服务端设置 SMTP_PASS（QQ 邮箱授权码）后重试。'
      );
    }

    cleanupStores();
    const now = Date.now();
    const cooldownSeconds = readInt('EMAIL_CODE_COOLDOWN_SECONDS', DEFAULT_COOLDOWN_SECONDS);
    const existing = codeStore.get(email);
    if (existing && now - existing.lastSentAt < cooldownSeconds * 1000) {
      const retryAfter = Math.max(1, Math.ceil((cooldownSeconds * 1000 - (now - existing.lastSentAt)) / 1000));
      return sendError(res, 429, 'rate_limited', `发送太频繁，请在 ${retryAfter} 秒后重试。`, { retryAfter });
    }

    const ip = clientIp(req);
    if (countRecent(`email:${email}`, now) >= MAX_SENDS_PER_EMAIL_HOUR) {
      return sendError(res, 429, 'rate_limited', '该邮箱发送验证码过于频繁，请稍后再试。');
    }
    if (countRecent(`ip:${ip}`, now) >= MAX_SENDS_PER_IP_HOUR) {
      return sendError(res, 429, 'rate_limited', '当前网络发送验证码过于频繁，请稍后再试。');
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const linkToken = randomBytes(32).toString('hex');
    const ttlSeconds = readInt('EMAIL_CODE_TTL_SECONDS', DEFAULT_CODE_TTL_SECONDS);
    const siteUrl = resolveSiteUrl(req);
    const link = serviceRoleConfigured() ? buildEmailLink(siteUrl, email, linkToken) : null;

    const entry: EmailCodeEntry = {
      codeHash: hashValue(email, code),
      linkHash: hashValue(email, linkToken),
      expiresAt: now + ttlSeconds * 1000,
      attempts: 0,
      lastSentAt: now,
      ip,
    };

    // 先占位，避免并发请求绕过 60 秒冷却
    codeStore.set(email, entry);

    try {
      await sendLoginCodeMail({ config: smtp, email, code, link, siteUrl });
    } catch (err: any) {
      if (codeStore.get(email) === entry) codeStore.delete(email);
      const message = String(err?.message || err || 'unknown');
      console.error('[email-code] SMTP send failed:', message);
      const configHint = /EAUTH|535|authentication|login|auth/i.test(message)
        ? 'QQ 邮箱鉴权失败：请确认 SMTP_PASS 是 QQ 邮箱「设置 → 账户 → POP3/SMTP 服务」里生成的授权码，不是 QQ 登录密码。'
        : '邮件发送失败，请稍后重试；管理员可查看服务端日志。';
      return sendError(res, 502, 'email_send_failed', configHint);
    }

    recordSend(`email:${email}`, now);
    recordSend(`ip:${ip}`, now);
    console.log(`[email-code] sent to ${maskEmail(email)} via ${smtp.host}:${smtp.port}${link ? '' : ' (no link: service role missing)'}`);

    return res.json({
      ok: true,
      delivery: 'qq-smtp',
      expiresIn: ttlSeconds,
      linkIncluded: Boolean(link),
    });
  });

  /** 邮件里的「一键登录」：校验签名链接 → 换 Supabase session → 带 token 跳回前端 */
  app.get('/api/auth/email-code/link', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const siteUrl = resolveSiteUrl(req);
    const email = normalizeEmail(req.query.email);
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const redirectError = (message: string) =>
      res.redirect(`${siteUrl}/?login_error=${encodeURIComponent(message)}`);

    if (!email || !token) return redirectError('登录链接无效，请重新获取验证码。');

    const entry = codeStore.get(email);
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) codeStore.delete(email);
      return redirectError('登录链接已过期，请重新获取验证码。');
    }
    if (!safeEqual(hashValue(email, token), entry.linkHash)) {
      return redirectError('登录链接无效，请重新获取验证码。');
    }

    try {
      const session = await mintSupabaseSession(email, siteUrl);
      codeStore.delete(email);
      const params = new URLSearchParams({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: String(session.expires_in ?? 3600),
        token_type: session.token_type || 'bearer',
        type: 'magiclink',
      });
      return res.redirect(`${siteUrl}/#${params.toString()}`);
    } catch (err: any) {
      const message = err instanceof EmailAuthError ? err.message : '登录失败，请返回网站使用验证码登录。';
      console.error('[email-code] link login failed:', err?.message || err);
      return redirectError(message);
    }
  });

  /** 校验 6 位码并返回正式 Supabase session */
  app.post('/api/auth/verify-email-code', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const email = normalizeEmail(req.body?.email);
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!email) return sendError(res, 400, 'invalid_email', '请输入有效邮箱。');
    if (!/^\d{6}$/.test(code)) return sendError(res, 400, 'invalid_code', '请输入 6 位数字验证码。');

    const entry = codeStore.get(email);
    if (!entry) {
      return sendError(res, 400, 'invalid_code', '验证码错误或已过期，请重新获取（验证码 10 分钟内有效）。');
    }
    if (Date.now() > entry.expiresAt) {
      codeStore.delete(email);
      return sendError(res, 410, 'code_expired', '验证码已过期，请重新获取。');
    }

    const maxAttempts = readInt('EMAIL_CODE_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS);
    if (entry.attempts >= maxAttempts) {
      codeStore.delete(email);
      return sendError(res, 429, 'too_many_attempts', '验证码错误次数过多，请重新获取。');
    }

    if (!safeEqual(hashValue(email, code), entry.codeHash)) {
      entry.attempts += 1;
      if (entry.attempts >= maxAttempts) codeStore.delete(email);
      return sendError(res, 400, 'invalid_code', '验证码错误或已过期，请重新获取（验证码 10 分钟内有效）。');
    }

    try {
      const session = await mintSupabaseSession(email, resolveSiteUrl(req));
      codeStore.delete(email);
      return res.json({ ok: true, session });
    } catch (err: any) {
      if (err instanceof EmailAuthError) {
        return sendError(res, err.status, err.code, err.message);
      }
      console.error('[email-code] verify failed:', err?.message || err);
      return sendError(res, 500, 'verify_failed', '登录失败，请稍后重试。');
    }
  });
}
