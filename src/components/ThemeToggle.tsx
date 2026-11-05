import React, { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

/**
 * 外观主题开关：负责主题状态的读写（html[data-theme] + localStorage）。
 * 具体深色配色由 index.css 的 @custom-variant dark + 各组件的 dark: 工具类提供；
 * 首帧防白闪由 index.html 的内联脚本按同一个 bideti-theme 键提前写好主题。
 */
const THEME_STORAGE_KEY = 'bideti-theme';

type Theme = 'light' | 'dark';

/** 读取初始主题：html 属性 > 本地存储 > 系统偏好 > 浅色 */
const readTheme = (): Theme => {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // 隐私模式等场景下 localStorage 不可用，退化为浅色
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

interface ThemeToggleProps {
  /** desktop：页头右侧胶囊按钮；menu：窄屏汉堡菜单内整行按钮 */
  variant?: 'desktop' | 'menu';
  /** 点击后的收尾动作（例如收起汉堡菜单） */
  onSelect?: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'desktop', onSelect }) => {
  const [theme, setTheme] = useState<Theme>(readTheme);

  // 首屏把当前主题同步到 html[data-theme]，供后续配色层选择器使用
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 忽略存储失败，状态仍在本页生效
    }
    onSelect?.();
  };

  const label = theme === 'dark' ? '切换到浅色外观' : '切换到深色外观';
  const Icon = theme === 'dark' ? Sun : Moon;
  const shortText = theme === 'dark' ? '浅色' : '深色';

  if (variant === 'menu') {
    return (
      <button
        type="button"
        data-testid="theme-toggle-menu"
        onClick={toggleTheme}
        aria-pressed={theme === 'dark'}
        aria-label={label}
        title={label}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          外观：{shortText}
        </span>
        <span className="text-[10px] font-semibold text-slate-400">
          {theme === 'dark' ? '已开启' : '已关闭'}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={theme === 'dark'}
      aria-label={label}
      title={label}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-500"
    >
      <Icon className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
      <span>{shortText}</span>
    </button>
  );
};
