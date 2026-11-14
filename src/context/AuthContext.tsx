import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { mergeGuestDataToAccount } from '../lib/guestStore';
import { translateAuthError } from '../lib/authErrors';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** 游客数据合并成功后自增，用于触发额度/历史刷新 */
  mergeVersion: number;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  /** 发送邮箱验证码（新邮箱自动注册；linkIncluded 表示邮件里是否带一键登录链接） */
  sendEmailOtp: (email: string) => Promise<{ error?: string; linkIncluded?: boolean }>;
  /** 校验邮箱验证码并登录 */
  verifyEmailOtp: (email: string, token: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mergeVersion, setMergeVersion] = useState<number>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // 登录后把游客态（错题 + 答题历史 + 已用额度）并入账号；幂等，失败保留下次重试
  useEffect(() => {
    if (!user) return;
    mergeGuestDataToAccount().then(result => {
      if (result.merged) setMergeVersion(prev => prev + 1);
    });
  }, [user?.id]);

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: translateAuthError(error?.message) };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: translateAuthError(error?.message) };
  };

  const sendEmailOtp = async (email: string) => {
    try {
      const response = await fetch('/api/auth/email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          error: translateAuthError(
            payload?.message || payload?.error || '发送验证码失败，请稍后重试。'
          ),
        };
      }
      return { linkIncluded: Boolean(payload?.linkIncluded) };
    } catch (e) {
      return { error: '网络请求失败，请检查网络连接后重试。' };
    }
  };

  const verifyEmailOtp = async (email: string, token: string) => {
    try {
      const response = await fetch('/api/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: token.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          error: translateAuthError(
            payload?.message || payload?.error || '验证码错误或已过期，请重新获取。'
          ),
        };
      }

      const session = payload?.session;
      if (!session?.access_token || !session?.refresh_token) {
        return { error: '登录失败：服务端未返回有效登录态，请稍后重试。' };
      }

      // 后端已用 Supabase Admin 校验并签发 session，这里只负责写入浏览器会话
      const { error } = await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      return { error: translateAuthError(error?.message) };
    } catch (e) {
      return { error: '网络请求失败，请检查网络连接后重试。' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, mergeVersion, signUp, signIn, sendEmailOtp, verifyEmailOtp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { AuthProvider, useAuth };

