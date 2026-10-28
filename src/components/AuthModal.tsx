import React, { useEffect, useState } from 'react';
import { X, Mail, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type AuthReason = 'default' | 'guest_limit' | 'need_login';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  reason?: AuthReason;
}

type Mode = 'otp' | 'password' | 'register';

const REASON_TIPS: Record<AuthReason, string> = {
  default: '',
  guest_limit: '游客每日可免费刷 10 题。登录后每日 50 题，错题与答题历史自动云端同步。',
  need_login: '登录后即可使用该功能，记录将云端同步，换设备不丢失。',
};

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, reason = 'default' }) => {
  const { signIn, signUp, sendEmailOtp, verifyEmailOtp } = useAuth();
  const [mode, setMode] = useState<Mode>('otp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // 每次打开都回到"验证码登录"（默认第一位），并清理上一次的敏感状态
  useEffect(() => {
    if (!open) return;
    setMode('otp');
    setError('');
    setNotice('');
    setOtpSent(false);
    setToken('');
    setPassword('');
    setCooldown(0);
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(prev => (prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (!open) return null;

  const finish = () => {
    onClose();
    setEmail('');
    setPassword('');
    setToken('');
    setOtpSent(false);
    setError('');
    setNotice('');
  };

  const handleSendOtp = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('请输入有效邮箱');
      return;
    }
    setSending(true);
    setError('');
    setNotice('');
    const { error: sendError } = await sendEmailOtp(email);
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setOtpSent(true);
    setCooldown(60);
    setNotice('验证码已发送，请查收邮箱（含垃圾箱），10 分钟内有效。');
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(token.trim())) {
      setError('请输入 6 位数字验证码');
      return;
    }
    setLoading(true);
    setError('');
    const { error: verifyError } = await verifyEmailOtp(email, token);
    setLoading(false);
    if (verifyError) {
      setError(`${verifyError}（若邮件内只有登录链接，请在 Supabase 邮件模板中加入 {{ .Token }}）`);
      return;
    }
    finish();
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    const { error: authError } = mode === 'register'
      ? await signUp(email, password)
      : await signIn(email, password);
    setLoading(false);
    if (authError) {
      setError(authError);
      return;
    }
    if (mode === 'register') {
      setNotice('注册成功，请查收验证邮件；也可直接用验证码登录。');
      setMode('password');
      return;
    }
    finish();
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-slate-900">登录 / 注册</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="关闭">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-3 leading-relaxed">
          登录后每日 <strong className="text-emerald-700">50 题</strong>免费额度，错题与答题历史云端同步；游客每日 10 题。
        </p>

        {REASON_TIPS[reason] && (
          <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] leading-relaxed text-amber-900">
            {REASON_TIPS[reason]}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl mb-4">
          <button
            onClick={() => switchMode('otp')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode === 'otp' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            邮箱验证码
          </button>
          <button
            onClick={() => switchMode('password')}
            className={`py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mode !== 'otp' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            密码登录
          </button>
        </div>

        {mode === 'otp' ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">邮箱</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            {otpSent && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">6 位验证码</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    value={token}
                    onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>
              </div>
            )}

            {notice && <p className="text-[11px] text-emerald-700 leading-relaxed">{notice}</p>}
            {error && <p className="text-[11px] text-rose-600 leading-relaxed">{error}</p>}

            {!otpSent ? (
              <button
                onClick={handleSendOtp}
                disabled={sending}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {sending ? '发送中...' : '发送验证码'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? '验证中...' : '验证码登录 / 注册'}
                </button>
                <button
                  onClick={handleSendOtp}
                  disabled={sending || cooldown > 0}
                  className="w-full text-xs text-slate-500 hover:text-slate-800 disabled:text-slate-300 cursor-pointer"
                >
                  {cooldown > 0 ? `重新发送（${cooldown}s）` : '没收到？重新发送'}
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <form onSubmit={handlePasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">密码（至少 6 位）</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  placeholder="••••••"
                />
              </div>
              {notice && <p className="text-[11px] text-emerald-700 leading-relaxed">{notice}</p>}
              {error && <p className="text-[11px] text-rose-600 leading-relaxed">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold cursor-pointer"
              >
                {loading ? '处理中...' : mode === 'register' ? '注册' : '登录'}
              </button>
            </form>

            <div className="mt-3 text-center text-xs text-slate-500">
              {mode === 'register' ? (
                <span>
                  已有账号？
                  <button onClick={() => switchMode('password')} className="text-emerald-600 font-medium cursor-pointer">去登录</button>
                </span>
              ) : (
                <span>
                  没有密码？
                  <button onClick={() => switchMode('register')} className="text-emerald-600 font-medium cursor-pointer">用邮箱注册</button>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};



