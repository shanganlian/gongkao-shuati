#!/usr/bin/env node
/**
 * verify-fujian-repair.cjs —— 福建 v2 修复结果回归校验
 *
 * 校验四件事：
 *   1) 44 条修复项的模块、解析非空、无空表格/图片占位、Q40 结论笔误已修；
 *   2) 分片与 questions.json 中这 44 条的模块/答案/解析一致；
 *   3) sample-20 恰好 20 条、五模块覆盖、回归 ID 在列且字段齐全；
 *   4) ledger.md 的答案/解析覆盖与 paper-stats.json 一致。
 *
 * 用法：node scripts/verify-fujian-repair.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const REPORT_DIR = path.join(ROOT, 'guokao-reports', '省考-福建-转换');
const SAMPLE_ID = 'prov-fujian-2011-917联考-11';
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);
const failures = [];

function check(ok, label, detail) {
  if (!ok) failures.push(detail ? `${label}：${detail}` : label);
}

function sourceNum(q) {
  const m = String(q.source || '').match(/第(\d+)题/);
  return m ? Number(m[1]) : 0;
}

function pct(n, d) {
  return `${((n / d) * 100).toFixed(1)}%`;
}

function main() {
  const shardFiles = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f)).sort();
  const shards = shardFiles.flatMap(f => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
  const aggregate = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'questions.json'), 'utf8'));
  const aggById = new Map(aggregate.map(q => [q.id, q]));

  const fullMismatch = [];
  for (const q of shards) {
    const a = aggById.get(q.id);
    if (!a) fullMismatch.push(`${q.id} 聚合缺失`);
    else if (q.module !== a.module || q.stem !== a.stem || q.answer !== a.answer || q.explanation !== a.explanation) {
      fullMismatch.push(q.id);
    }
  }
  check(shards.length === aggregate.length, '全量分片/聚合题数', `${shards.length} vs ${aggregate.length}`);
  check(fullMismatch.length === 0, '全量分片/聚合字段一致', fullMismatch.slice(0, 8).join('、'));

  const spring = shards
    .filter(q => String(q.id).startsWith('prov-fujian-2010-春季-'))
    .filter(q => sourceNum(q) >= 36 && sourceNum(q) <= 60);
  const q917 = shards
    .filter(q => String(q.id).startsWith('prov-fujian-2011-917联考-'))
    .filter(q => sourceNum(q) >= 2 && sourceNum(q) <= 20);
  check(spring.length === 25, '2010 春季 Q36-Q60 数量', `实际 ${spring.length}`);
  check(q917.length === 19, '2011 917 Q2-Q20 数量', `实际 ${q917.length}`);
  const selected = [...spring, ...q917];

  const badModule = [];
  const empty = [];
  const markers = [];
  const mismatch = [];
  for (const q of selected) {
    const expected = String(q.id).includes('-春季-') ? 'yanyu' : 'changshi';
    if (q.module !== expected) badModule.push(`${q.id}=${q.module}`);
    if (!String(q.explanation || '').trim()) empty.push(q.id);
    if (/\[\[(?:TABLE|\/TABLE|IMG)\]\]/.test(String(q.explanation || ''))) markers.push(q.id);
    const a = aggById.get(q.id);
    if (!a) mismatch.push(`${q.id} 聚合缺失`);
    else if (a.module !== q.module || a.answer !== q.answer || a.explanation !== q.explanation) {
      mismatch.push(`${q.id} 分片/聚合字段不一致`);
    }
  }
  check(badModule.length === 0, '44 条模块', badModule.join('、'));
  check(empty.length === 0, '44 条解析为空', empty.join('、'));
  check(markers.length === 0, '44 条解析残留占位标记', markers.join('、'));
  check(mismatch.length === 0, '44 条分片/聚合一致', mismatch.slice(0, 8).join('；'));

  const q40 = selected.find(q => q.id === 'prov-fujian-2010-春季-40');
  check(Boolean(q40), '缺少 Q40');
  // 2026-10-20 起解析已做 OCR 空格清洗，断言按去空白后的文本比较
  const q40Text = String(q40?.explanation || '').replace(/\s+/g, '');
  check(
    Boolean(q40Text.includes('B不正确') && !q40Text.includes('B正确。')),
    'Q40 结论笔误未修净'
  );

  const sample = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'sample-20.json'), 'utf8'));
  const sampleMd = fs.readFileSync(path.join(REPORT_DIR, 'sample-20.md'), 'utf8');
  check(sample.length === 20, '样本数量', `实际 ${sample.length}`);
  check(new Set(sample.map(q => q.id)).size === sample.length, '样本 ID 重复');
  const modules = new Set(sample.map(q => q.module));
  check(modules.size === 5, '样本模块覆盖', `实际 ${[...modules].join(',')}`);
  const reg = sample.find(q => q.id === SAMPLE_ID);
  check(Boolean(reg), `样本缺少回归题 ${SAMPLE_ID}`);
  if (reg) {
    check(reg.module === 'changshi', '回归题模块', reg.module);
    check(reg.answer === 'C', '回归题答案', reg.answer);
    check(String(reg.explanation || '').includes('泼水节'), '回归题解析未使用 917 常识内容');
  }
  check(sampleMd.includes(SAMPLE_ID), 'sample-20.md 缺少回归题');
  const incomplete = sample.filter(
    q => !q.answer || !String(q.explanation || '').trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !String(o.text || '').trim())
  );
  check(incomplete.length === 0, '样本字段不完整', incomplete.map(q => q.id).join('、'));

  const stats = JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'paper-stats.json'), 'utf8')).aggregate;
  const ledger = fs.readFileSync(path.join(REPORT_DIR, 'ledger.md'), 'utf8');
  check(ledger.includes(`| 有答案 | ${stats.withAnswer}（${pct(stats.withAnswer, stats.questions)}） |`), 'ledger 答案覆盖与 paper-stats 不一致');
  check(ledger.includes(`| 有解析 | ${stats.withExplanation}（${pct(stats.withExplanation, stats.questions)}） |`), 'ledger 解析覆盖与 paper-stats 不一致');
  check(stats.questions === aggregate.length, 'paper-stats 题数与 questions.json 不一致', `${stats.questions} vs ${aggregate.length}`);
  check(stats.withExplanation === aggregate.filter(q => String(q.explanation || '').trim()).length, 'paper-stats 解析数与实际不一致');

  const lines = [
    '# 福建 v2 修复结果回归校验',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `- 修复项：${selected.length} 条（2010 春季 25 + 2011 917 常识 19）`,
    `- 分片：${shardFiles.length} 个 / ${shards.length} 题；聚合：${aggregate.length} 题`,
    `- 样本：${sample.length} 条 / ${modules.size} 个模块；回归题：${reg ? '在列' : '缺失'}`,
    `- 账本：有答案 ${stats.withAnswer}（${pct(stats.withAnswer, stats.questions)}），有解析 ${stats.withExplanation}（${pct(stats.withExplanation, stats.questions)}）`,
    '',
    failures.length ? `## 失败项（${failures.length}）\n\n${failures.map(f => `- ${f}`).join('\n')}` : '## 结论\n\n✅ 全部通过',
    '',
  ];
  const report = path.join(ROOT, 'guokao-reports', 'fujian-v2-修复校验.md');
  fs.writeFileSync(report, lines.join('\n'), 'utf8');
  console.log(failures.length ? `❌ ${failures.length} 项失败` : '✅ 福建 v2 修复校验全部通过');
  for (const f of failures) console.log(`  - ${f}`);
  console.log(`报告：${path.relative(ROOT, report)}`);
  if (failures.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || err);
  process.exitCode = 1;
}
