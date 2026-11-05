/**
 * Supabase Auth 的英文报错 → 中文提示。
 *
 * 只做「展示层翻译」：Supabase 的错误码与文案随版本变化，这里按关键字匹配，
 * 未命中的一律原样返回，避免把真实错误吞掉导致无法排查。
 */
type Rule = {
  pattern: RegExp;
  /** 命中后的中文提示；函数形式可取捕获组（如剩余秒数、最小密码长度） */
  message: string | ((match: RegExpMatchArray) => string);
};

const RULES: Rule[] = [
  {
    pattern: /for security purposes, you can only request this after\s*(\d+)\s*seconds?/i,
    message: m => `操作过于频繁，请在 ${m[1]} 秒后重试。`,
  },
  {
    pattern: /email rate limit exceeded/i,
    message: '验证码发送过于频繁：同一邮箱每小时有发送上限，请稍后再试。',
  },
  {
    pattern: /email address not authorized/i,
    message: '当前邮件服务未配置发信通道，暂时无法给该邮箱发送验证码，请联系管理员。',
  },
  {
    pattern: /over_email_send_rate_limit|over_sms_send_rate_limit/i,
    message: '发送太频繁了，请稍后再试。',
  },
  {
    pattern: /invalid login credentials/i,
    message: '邮箱或密码不正确。',
  },
  {
    pattern: /email not confirmed/i,
    message: '邮箱尚未验证：请先用验证码登录，或点击验证邮件中的链接。',
  },
  {
    pattern: /user already registered|already been registered/i,
    message: '该邮箱已注册，请直接使用验证码或密码登录。',
  },
  {
    pattern: /token has expired or is invalid|otp_expired|invalid otp|token is invalid|invalid token/i,
    message: '验证码错误或已过期，请重新获取（验证码 10 分钟内有效）。',
  },
  {
    pattern: /email link is invalid or has expired/i,
    message: '邮件里的链接已失效，请重新获取。',
  },
  {
    pattern: /password should be at least\s*(\d+)\s*characters?/i,
    message: m => `密码太短，至少需要 ${m[1]} 位。`,
  },
  {
    pattern: /unable to validate email address|invalid format|invalid email/i,
    message: '邮箱格式不正确，请检查后重试。',
  },
  {
    pattern: /signups?\s*(not allowed|disabled)|signup is disabled/i,
    message: '当前暂不开放注册，请联系管理员。',
  },
  {
    pattern: /too many requests/i,
    message: '请求过于频繁，请稍后再试。',
  },
  {
    pattern: /auth session missing|session.*expired|jwt expired/i,
    message: '登录状态已失效，请重新登录。',
  },
  {
    pattern: /captcha/i,
    message: '人机验证未通过，请刷新页面后重试。',
  },
  {
    pattern: /failed to fetch|networkerror|network request failed/i,
    message: '网络请求失败，请检查网络连接后重试。',
  },
];

export function translateAuthError(message?: string | null): string | undefined {
  if (!message) return undefined;
  const raw = message.trim();
  if (!raw) return undefined;

  for (const rule of RULES) {
    const match = raw.match(rule.pattern);
    if (!match) continue;
    return typeof rule.message === 'string' ? rule.message : rule.message(match);
  }

  return raw;
}
