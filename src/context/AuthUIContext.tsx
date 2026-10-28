import React, { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { AuthModal, type AuthReason } from '../components/AuthModal';

/**
 * 全站唯一登录弹窗。
 * Navbar / PracticeArena / App 统一调用 openAuth(reason)，
 * 避免多个 AuthModal 实例各自维护开关状态。
 */
interface AuthUIValue {
  openAuth: (reason?: AuthReason) => void;
  closeAuth: () => void;
}

const AuthUIContext = createContext<AuthUIValue | undefined>(undefined);

export function AuthUIProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AuthReason>('default');

  const openAuth = useCallback((nextReason: AuthReason = 'default') => {
    setReason(nextReason);
    setOpen(true);
  }, []);

  const closeAuth = useCallback(() => setOpen(false), []);

  return (
    <AuthUIContext.Provider value={{ openAuth, closeAuth }}>
      {children}
      <AuthModal open={open} onClose={closeAuth} reason={reason} />
    </AuthUIContext.Provider>
  );
}

export function useAuthUI() {
  const ctx = useContext(AuthUIContext);
  if (!ctx) throw new Error('useAuthUI must be used within AuthUIProvider');
  return ctx;
}
