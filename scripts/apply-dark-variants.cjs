#!/usr/bin/env node
/**
 * 暗色变体补齐工具（Tailwind v4，配合 index.css 里的 @custom-variant dark）
 *
 * 用法：
 *   node scripts/apply-dark-variants.cjs              # dry-run，只打印计划
 *   node scripts/apply-dark-variants.cjs --audit      # 只输出颜色工具类清单（含未映射项）
 *   node scripts/apply-dark-variants.cjs --apply      # 真正写入
 *
 * 规则：按“色阶反演”给浅色工具类补 dark: 变体，例如
 *   bg-white        -> dark:bg-slate-900
 *   text-slate-900  -> dark:text-slate-100
 *   border-slate-200-> dark:border-slate-700
 *   bg-emerald-50   -> dark:bg-emerald-900/40
 * 已带 dark: 的类、以及白/黑半透明叠加层不处理。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const APPLY = process.argv.includes('--apply');
const AUDIT = process.argv.includes('--audit');

const NEUTRAL = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);
const FAMILIES = new Set([
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'emerald', 'green', 'teal', 'cyan', 'sky', 'blue', 'indigo',
  'violet', 'purple', 'fuchsia', 'pink', 'rose', 'red', 'orange', 'amber', 'yellow', 'lime',
]);

/** 任意值 / 特殊色的一次性覆盖表 */
const EXACT = {
  'bg-[#F3F4F6]': 'bg-slate-950',
  'text-[#7A5B12]': 'text-amber-300',
  'text-[#7C4A03]': 'text-amber-300',
  'text-[#8A6A12]': 'text-amber-300',
  'border-[#A16207]/30': 'border-amber-600/40',
  'bg-[#A16207]/5': 'bg-amber-500/10',
  'bg-[#A16207]/15': 'bg-amber-500/20',
  // 深色实心按钮/选中态：提亮到 slate-700，保证在 slate-900 卡片与 slate-950 页面上都可见
  'bg-slate-900': 'bg-slate-700',
  'hover:bg-slate-800': 'hover:bg-slate-600',
  'hover:bg-slate-700': 'hover:bg-slate-600',
  // 浅色输入框在深色下用 slate-800，聚焦时提亮到 700
  'focus:bg-white': 'focus:bg-slate-700',
  'hover:bg-white': 'hover:bg-slate-800',
  // 半透明白底（吸顶栏 / 底部导航 / 内嵌面板）不能留白
  'bg-white/95': 'bg-slate-900/95',
  'bg-white/90': 'bg-slate-900/90',
  'bg-white/80': 'bg-slate-900/80',
  'bg-white/70': 'bg-slate-900/70',
  'bg-white/60': 'bg-slate-900/60',
  // 极浅的品牌绿底在深色下几乎不可见
  'bg-emerald-950/5': 'bg-emerald-500/10',
  'focus:ring-slate-900': 'focus:ring-slate-100',
  'bg-brand-ink': null,
  'text-brand-ink': null,
  'bg-brand-gold': null,
  'text-brand-gold': null,
  'bg-brand-line': null,
  'border-brand-line': null,
};

/** 中性色（slate 系）文本：深字 -> 浅字 */
function neutralText(shade) {
  if (shade >= 900) return 100;
  if (shade >= 800) return 200;
  if (shade >= 700) return 200;
  if (shade >= 600) return 300;
  if (shade >= 500) return 400;
  return null; // 400 及更浅在深色下无需调整
}

/** 彩色文本：深字 -> 更亮的同级色 */
function coloredText(shade) {
  if (shade >= 900) return 200;
  if (shade >= 700) return 300;
  if (shade >= 500) return 400;
  return null;
}

/** 中性色背景 */
function neutralBg(shade) {
  if (shade >= 500) return null;
  if (shade === 0) return 900; // white
  if (shade <= 100) return 800;
  if (shade === 200) return 700;
  if (shade === 300) return 600;
  return 500;
}

/** 彩色背景 */
function coloredBg(shade) {
  if (shade >= 500) return null;
  if (shade <= 100) return '900/40';
  if (shade === 200) return 800;
  if (shade === 300) return 700;
  return 700;
}

/** 边框 / 分隔线 */
function borderShade(family, shade) {
  if (NEUTRAL.has(family)) {
    if (shade >= 500) return null;
    if (shade <= 100) return 'slate-800';
    if (shade === 200) return 'slate-700';
    if (shade === 300) return 'slate-600';
    return 'slate-500';
  }
  if (shade >= 500) return null;
  if (shade <= 100) return `${family}-900`;
  if (shade === 200) return `${family}-800`;
  if (shade === 300) return `${family}-700`;
  return `${family}-600`;
}

/** 把单个 token 映射成 dark: 变体；返回 null 表示无需处理 */
function mapToken(token) {
  if (!token || token.includes('dark:')) return null;
  if (EXACT[token] !== undefined) {
    return EXACT[token] ? `dark:${EXACT[token]}` : null;
  }

  const parts = token.split(':');
  const variants = parts.slice(0, -1);
  const base = parts[parts.length - 1];
  const prefix = variants.length ? variants.join(':') + ':' : '';

  // bg-white / bg-black（含透明度叠加层跳过）
  if (base === 'bg-white') return `dark:${prefix}bg-slate-900`;
  if (base === 'bg-black') return null;
  if (base === 'text-white' || base === 'text-black') return null;
  if (base.startsWith('bg-white/') || base.startsWith('bg-black/')) return null;
  if (base.startsWith('border-white') || base.startsWith('border-black')) return null;
  if (base.startsWith('text-white/') || base.startsWith('text-black/')) return null;

  const m = base.match(
    /^(bg|text|border|divide|ring|from|via|to|placeholder|stroke|fill|outline)-([a-z]+)-(\d{2,3})(?:\/(\d{1,3}))?$/
  );
  if (!m) return null;

  const [, util, family, shadeRaw, alpha] = m;
  if (!FAMILIES.has(family)) return null;
  const shade = Number(shadeRaw);
  const isNeutral = NEUTRAL.has(family);
  const outFamily = isNeutral ? 'slate' : family;
  const alphaSuffix = alpha ? `/${alpha}` : '';

  if (util === 'text' || util === 'placeholder') {
    if (!isNeutral && family === 'amber' && shade <= 400) return null;
    const next = isNeutral ? neutralText(shade) : coloredText(shade);
    if (!next) return null;
    return `dark:${prefix}${util === 'placeholder' ? 'placeholder' : 'text'}-${outFamily}-${next}${alphaSuffix}`;
  }

  if (util === 'stroke' || util === 'fill') {
    const next = isNeutral ? neutralText(shade) : coloredText(shade);
    if (!next) return null;
    return `dark:${prefix}${util}-${outFamily}-${next}${alphaSuffix}`;
  }

  if (util === 'bg') {
    if (isNeutral) {
      const next = neutralBg(shade);
      if (!next) return null;
      return `dark:${prefix}bg-slate-${next}${alphaSuffix}`;
    }
    const next = coloredBg(shade);
    if (!next) return null;
    const outShade = String(next).includes('/') ? next : `${next}${alphaSuffix}`;
    return `dark:${prefix}bg-${family}-${outShade}`;
  }

  // border / divide / ring / outline
  const next = borderShade(family, shade);
  if (!next) return null;
  return `dark:${prefix}${util}-${next}${alphaSuffix}`;
}

module.exports = { mapToken };


/** 遍历 src 下所有 tsx */
function listFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, acc);
    else if (entry.isFile() && full.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

const auditCounts = new Map();
const unmapped = new Map();

/** 判断一个 token 是否“看起来像颜色工具类”，用于审计 */
function looksLikeColorToken(tok) {
  return /^(?:[a-z-]+:)*(bg|text|border|divide|ring|from|via|to|placeholder|stroke|fill|outline)-(white|black|[a-z]+-\d{2,3})(?:\/\d{1,3})?$/.test(tok) ||
    /^(?:[a-z-]+:)*[a-z-]+-\[#/.test(tok);
}

/** 处理一段不含 ${} 的类名字面量 */
function transformChunk(chunk, stats) {
  const present = new Set(chunk.split(/\s+/).filter(Boolean));
  return chunk.replace(/[^\s]+/g, (tok) => {
    if (looksLikeColorToken(tok)) {
      auditCounts.set(tok, (auditCounts.get(tok) || 0) + 1);
    }
    const mapped = mapToken(tok);
    if (!mapped) {
      if (looksLikeColorToken(tok) && !tok.includes('dark:') && !/^(?:[a-z-]+:)*(text-white|bg-white\/|bg-black\/|border-white|text-black)/.test(tok)) {
        unmapped.set(tok, (unmapped.get(tok) || 0) + 1);
      }
      return tok;
    }
    if (present.has(mapped)) return tok;
    present.add(mapped);
    stats.added += 1;
    return `${tok} ${mapped}`;
  });
}

/** 处理模板字符串：静态片段按类名处理，${} 内部递归处理（内部常是三元类名） */
function transformTemplate(content, stats) {
  let out = '';
  let last = 0;
  const exprRe = /\$\{[^{}]*\}/g;
  let m;
  while ((m = exprRe.exec(content))) {
    out += transformChunk(content.slice(last, m.index), stats);
    out += '${' + transformSource(m[0].slice(2, -1), stats) + '}';
    last = m.index + m[0].length;
  }
  out += transformChunk(content.slice(last), stats);
  return out;
}

/** 递归处理源码里的字符串字面量 */
function transformSource(src, stats) {
  return src.replace(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g, (whole, quote, body) => {
    if (!/[a-z]-/.test(body)) return whole;
    if (!/(bg|text|border|ring|divide|from|via|to|stroke|fill|placeholder)-/.test(body)) return whole;
    if (quote === '`') {
      const next = transformTemplate(body, stats);
      return next === body ? whole : `${quote}${next}${quote}`;
    }
    if (/[;{}]|=>/.test(body)) return whole;
    const next = transformChunk(body, stats);
    return next === body ? whole : `${quote}${next}${quote}`;
  });
}

function processFile(file) {
  const original = fs.readFileSync(file, 'utf8');
  const stats = { added: 0 };
  const rewritten = transformSource(original, stats);
  return { file, original, rewritten, added: stats.added };
}

const files = listFiles(SRC);
const results = files.map(processFile).filter((r) => r.added > 0);
const totalAdded = results.reduce((n, r) => n + r.added, 0);

const lines = [];
lines.push(`# 暗色变体补齐 ${APPLY ? '(APPLY)' : '(DRY-RUN)'}`);
lines.push(`扫描 tsx：${files.length} 个；命中文件：${results.length} 个；新增 dark: 变体：${totalAdded} 条`);

if (AUDIT) {
  lines.push('', '## 颜色工具类清单（按出现次数）');
  [...auditCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([tok, n]) => lines.push(`- ${tok} × ${n}`));
  lines.push('', '## 未映射的颜色工具类');
  [...unmapped.entries()].sort((a, b) => b[1] - a[1]).forEach(([tok, n]) => lines.push(`- ${tok} × ${n}`));
}

lines.push('', '## 每文件新增数');
[...results].sort((a, b) => b.added - a.added)
  .forEach((r) => lines.push(`- ${path.relative(ROOT, r.file).replace(/\\/g, '/')} :: +${r.added}`));

if (APPLY) {
  for (const r of results) fs.writeFileSync(r.file, r.rewritten, 'utf8');
  lines.push('', '已写入磁盘。');
}

fs.writeFileSync(path.join(ROOT, 'zz_codemod.log'), lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
