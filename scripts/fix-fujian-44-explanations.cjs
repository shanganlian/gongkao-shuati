#!/usr/bin/env node
/**
 * fix-fujian-44-explanations.cjs —— 福建 v2 44 条修复项解析清理
 *
 * 只处理 2010 春季 Q36-Q60（25 条）与 2011 917 联考 Q2-Q20（19 条）：
 *   1) 去掉答案文档里残留的空表格占位标记（[[TABLE imgs=0 rows=0]]）；
 *   2) 修正 2010 春季 Q40 解析中的结论笔误（“B 正确”→“B 不正确”）。
 *
 * 不改题干、选项、答案、模块，不跨题借用解析。
 *
 * 用法：
 *   node scripts/fix-fujian-44-explanations.cjs            # dry-run
 *   node scripts/fix-fujian-44-explanations.cjs --apply    # 备份后写入
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const REPORT_MD = path.join(ROOT, 'guokao-reports', 'fujian-v2-44项解析修正.md');
const REPORT_CSV = path.join(ROOT, 'guokao-reports', 'fujian-v2-44项解析修正.csv');
const APPLY = process.argv.includes('--apply');
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);

const Q40_ID = 'prov-fujian-2010-春季-40';
const Q40_RE = /并没有明显提倡获取多\s*种体验，B 正确。/;

function fail(msg) {
  throw new Error(msg);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sourceNum(q) {
  const m = String(q.source || '').match(/第(\d+)题/);
  return m ? Number(m[1]) : 0;
}

function compact(text, max = 220) {
  const s = String(text || '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function csv(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 空表格是 docx 转换残留；直接移除，避免把「的 + 颓势」拆成两段。 */
function cleanExplanation(text) {
  return String(text || '')
    .replace(/\s*\[\[TABLE imgs=0 rows=0\]\]\s*\[\[\/TABLE\]\]\s*/g, '')
    .replace(/\s*\[\[IMG\]\]\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function load() {
  const shardFiles = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f)).sort();
  const shards = shardFiles.map(file => ({
    file,
    rows: readJson(path.join(DIR, file)),
  }));
  const aggregate = readJson(path.join(DIR, 'questions.json'));
  const all = shards.flatMap(s => s.rows);
  return { shardFiles, shards, aggregate, all };
}

function select44(all) {
  const spring = all
    .filter(q => String(q.id).startsWith('prov-fujian-2010-春季-'))
    .filter(q => sourceNum(q) >= 36 && sourceNum(q) <= 60)
    .sort((a, b) => sourceNum(a) - sourceNum(b));
  const q917 = all
    .filter(q => String(q.id).startsWith('prov-fujian-2011-917联考-'))
    .filter(q => sourceNum(q) >= 2 && sourceNum(q) <= 20)
    .sort((a, b) => sourceNum(a) - sourceNum(b));
  if (spring.length !== 25) fail(`2010 春季 Q36-Q60 数量=${spring.length}（期望 25）`);
  if (q917.length !== 19) fail(`2011 917 Q2-Q20 数量=${q917.length}（期望 19）`);
  return [...spring, ...q917];
}

function patchOne(q) {
  const before = String(q.explanation || '');
  let after = cleanExplanation(before);
  const actions = [];
  if (after !== before.trim()) actions.push('去除空表格/图片占位标记');
  if (q.id === Q40_ID) {
    if (Q40_RE.test(after)) {
      after = after.replace(Q40_RE, '并没有明显提倡获取多种体验，B 不正确。');
      actions.push('结论笔误：B 正确 → B 不正确');
    } else if (!after.includes('B 不正确')) {
      fail(`Q40 未找到预期笔误，也未发现已修正结论：${Q40_RE}`);
    }
  }
  if (after === before) return null;
  return { id: q.id, module: q.module, before, after, actions };
}

function backup(ctx) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'guokao-reports', `backup-fujian-v2-44fix-${stamp}`);
  const outDir = path.join(dir, '福建');
  fs.mkdirSync(outDir, { recursive: true });
  for (const s of ctx.shards) {
    const target = path.join(DIR, s.file);
    const changed = s.rows.some(q => ctx.changeById.has(q.id));
    if (changed) fs.copyFileSync(target, path.join(outDir, s.file));
  }
  fs.copyFileSync(path.join(DIR, 'questions.json'), path.join(outDir, 'questions.json'));
  fs.writeFileSync(
    path.join(dir, 'README.txt'),
    `福建 v2 44 条解析修正前备份\n生成时间：${new Date().toISOString()}\n只需恢复本目录下与福建数据目录同名的文件。\n`,
    'utf8'
  );
  return dir;
}

function writeReports(changes, ctx) {
  const lines = [
    '# 福建 v2 44 条修复项解析清理',
    '',
    `生成时间：${new Date().toISOString()}`,
    `模式：${APPLY ? '已写入' : 'dry-run（未写入）'}`,
    '',
    '范围：2010 春季 Q36-Q60（25 条）+ 2011 917 联考 Q2-Q20（19 条）。',
    '',
    '## 结果',
    '',
    `- 扫描：${ctx.selected.length} 条`,
    `- 修改：${changes.length} 条`,
    `- 未改动：${ctx.selected.length - changes.length} 条`,
    '',
  ];
  if (!changes.length) {
    lines.push('无需修改（可能已应用过）。');
  } else {
    lines.push('| ID | 模块 | 动作 | 修改前（截断） | 修改后（截断） |');
    lines.push('|---|---|---|---|---|');
    for (const c of changes) {
      lines.push(
        `| ${c.id} | ${c.module} | ${c.actions.join('；')} | ${compact(c.before)} | ${compact(c.after)} |`
      );
    }
  }
  lines.push('');
  fs.writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');

  const csvLines = [['ID', '模块', '动作', '修改前', '修改后'].map(csv).join(',')];
  for (const c of changes) {
    csvLines.push([c.id, c.module, c.actions.join('；'), c.before, c.after].map(csv).join(','));
  }
  fs.writeFileSync(REPORT_CSV, `\uFEFF${csvLines.join('\n')}\n`, 'utf8');
}



function main() {
  const ctx = load();
  const selected = select44(ctx.all);
  const changes = [];
  const changeById = new Map();
  for (const q of selected) {
    const change = patchOne(q);
    if (!change) continue;
    changes.push(change);
    changeById.set(change.id, change);
  }
  ctx.selected = selected;
  ctx.changeById = changeById;

  if (!changes.length && fs.existsSync(REPORT_MD)) {
    console.log(`扫描 ${selected.length} 条，无待修改内容；保留现有报告：${path.relative(ROOT, REPORT_MD)}`);
    return;
  }

  if (APPLY && changes.length) {
    ctx.backupDir = backup(ctx);
    for (const s of ctx.shards) {
      let dirty = false;
      for (const q of s.rows) {
        const c = changeById.get(q.id);
        if (!c) continue;
        q.explanation = c.after;
        dirty = true;
      }
      if (dirty) fs.writeFileSync(path.join(DIR, s.file), JSON.stringify(s.rows, null, 2), 'utf8');
    }
    let dirty = false;
    for (const q of ctx.aggregate) {
      const c = changeById.get(q.id);
      if (!c) continue;
      q.explanation = c.after;
      dirty = true;
    }
    if (dirty) fs.writeFileSync(path.join(DIR, 'questions.json'), JSON.stringify(ctx.aggregate, null, 2), 'utf8');
  }

  writeReports(changes, ctx);
  console.log(`扫描 ${selected.length} 条，修改 ${changes.length} 条${APPLY ? '（已写入）' : '（dry-run）'}`);
  if (ctx.backupDir) console.log(`备份：${path.relative(ROOT, ctx.backupDir)}`);
  console.log(`报告：${path.relative(ROOT, REPORT_MD)}`);
}

try {
  main();
} catch (err) {
  console.error(err?.stack || err);
  process.exitCode = 1;
}
