#!/usr/bin/env node
/**
 * 深色配色对比度验收：按 WCAG 2.1 计算正文/次要文字与图表的对比度。
 * 用法：node scripts/check-dark-contrast.cjs [cssPath]
 * 传入 build 产物 css 时，额外检查 dark: 变体是否排在基础工具类之后（层叠顺序）。
 */
const fs = require('fs');
const path = require('path');

const PALETTE = {
  'slate-950': '#020617',
  'slate-900': '#0f172a',
  'slate-800': '#1e293b',
  'slate-700': '#334155',
  'slate-600': '#475569',
  'slate-500': '#64748b',
  'slate-400': '#94a3b8',
  'slate-300': '#cbd5e1',
  'slate-200': '#e2e8f0',
  'slate-100': '#f1f5f9',
  'emerald-200': '#a7f3d0',
  'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399',
  'emerald-500': '#10b981',
  'rose-200': '#fecdd3',
  'rose-300': '#fda4af',
  'rose-400': '#fb7185',
  'amber-200': '#fde68a',
  'amber-300': '#fcd34d',
  'amber-400': '#fbbf24',
};

const srgb = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

const luminance = (hex) => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
};

const ratio = (fg, bg) => {
  const a = luminance(PALETTE[fg]);
  const b = luminance(PALETTE[bg]);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

/** [前景, 背景, 说明, 是否文字（文字需 ≥4.5，图形需 ≥3）] */
const CASES = [
  ['slate-100', 'slate-900', '卡片主标题 / 正文（深字反演）', true],
  ['slate-200', 'slate-900', '正文 text-slate-800→200', true],
  ['slate-300', 'slate-900', '次要正文 text-slate-600→300', true],
  ['slate-300', 'slate-800', '输入框/次级面板内的次要正文', true],
  ['slate-400', 'slate-900', '说明文字 text-slate-500→400', true],
  ['slate-400', 'slate-800', '输入框内 placeholder→slate-400', true],
  ['slate-100', 'slate-950', '页面底色上的正文', true],
  ['emerald-400', 'slate-900', '强调文字 text-emerald-600→400', true],
  ['emerald-300', 'slate-900', '深绿字 text-emerald-800→300', true],
  ['emerald-400', 'slate-800', '深绿字落在输入框底', true],
  ['rose-300', 'slate-900', '错误/陷阱文字 text-rose-800→300', true],
  ['rose-400', 'slate-900', 'rose-600→400', true],
  ['amber-300', 'slate-900', '金色徽标文字（浅色为 #7A5B12）', true],
  ['slate-200', 'slate-700', '深色实心按钮（slate-900→700）上的白字', true],
  ['emerald-500', 'slate-900', '雷达图数据线 / 进度环', false],
  ['emerald-500', 'slate-800', '进度环落在浅一级面板', false],
  ['slate-500', 'slate-900', '雷达图网格线 / 进度环底轨（非文字，≥3:1 可见）', false],
];

let out = '# 深色配色对比度实测（WCAG 2.1）\n\n';
out += '| 前景 | 背景 | 场景 | 对比度 | 要求 | 结果 |\n| --- | --- | --- | --- | --- | --- |\n';

let fail = 0;
for (const [fg, bg, label, isText] of CASES) {
  const r = ratio(fg, bg);
  const need = isText ? 4.5 : 3;
  const ok = r >= need;
  if (!ok) fail += 1;
  out += `| ${fg} | ${bg} | ${label} | ${r.toFixed(2)}:1 | ≥${need}:1 | ${ok ? '通过' : '不达标'} |\n`;
}

const cssPath = process.argv[2];
if (cssPath && fs.existsSync(cssPath)) {
  const css = fs.readFileSync(cssPath, 'utf8');
  const pairs = [
    ['.bg-white{', '.dark\\:bg-slate-900:where'],
    ['.hover\\:bg-slate-800:hover', '.dark\\:hover\\:bg-slate-600:where'],
    ['.text-slate-900{', '.dark\\:text-slate-100:where'],
  ];
  out += '\n## 层叠顺序（dark: 变体必须排在后面才能覆盖基础类）\n\n';
  for (const [base, dark] of pairs) {
    const i = css.indexOf(base);
    const j = css.indexOf(dark);
    out += `- ${base.replace(/[{}]/g, '')} @${i} vs ${dark.replace(':where', '')} @${j} → ${i >= 0 && j > i ? '通过（dark 在后）' : '需检查'}\n`;
  }
}

out += `\n结论：${fail === 0 ? '全部达标' : `${fail} 项不达标`}\n`;
process.stdout.write(out);
