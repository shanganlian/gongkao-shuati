#!/usr/bin/env node
/**
 * E10 全库只读扫描（v1 线上库 / v2 国考池 / v2p 省考源池）。
 * 输出：控制台统计 + JSON 明细，便于调参与生成报告。
 *
 * 用法：node scripts/scan-e10.cjs [--out <file>]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getE10Issues } = require('./lib/e10-rule.cjs');

const ROOT = path.resolve(__dirname, '..');
const V1 = path.join(ROOT, 'public', 'data', 'questions');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2');
const V2P = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const outIndex = process.argv.indexOf('--out');
const OUT = outIndex > -1
  ? path.resolve(process.argv[outIndex + 1])
  : path.join(ROOT, '..', 'xingan-temp', 'e10-scan.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function provinceFromKey(key) {
  const part = String(key).split('-')[1] || 'none';
  return part === 'none' ? '国考' : part;
}

function loadIndexSource(name, dir, defaultProvince) {
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) return null;
  const index = readJson(indexPath);
  const files = new Set();
  const fileProvince = new Map();
  for (const [key, list] of Object.entries(index)) {
    for (const file of list) {
      files.add(file);
      if (!fileProvince.has(file)) fileProvince.set(file, defaultProvince || provinceFromKey(key));
    }
  }
  const questions = [];
  const seen = new Set();
  for (const file of files) {
    const list = readJson(path.join(dir, file));
    for (const q of list) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      questions.push({ q, province: q.province || fileProvince.get(file) || defaultProvince || '未知' });
    }
  }
  return { name, questions };
}

function loadV2P() {
  if (!fs.existsSync(V2P)) return [];
  const out = [];
  for (const entry of fs.readdirSync(V2P, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(V2P, entry.name);
    const aggregate = path.join(dir, 'questions.json');
    const indexPath = path.join(dir, 'index.json');
    let list = [];
    if (fs.existsSync(aggregate)) {
      list = readJson(aggregate);
    } else if (fs.existsSync(indexPath)) {
      const index = readJson(indexPath);
      const seenFile = new Set();
      for (const file of Object.values(index).flat()) {
        if (seenFile.has(file)) continue;
        seenFile.add(file);
        list.push(...readJson(path.join(dir, file)));
      }
    }
    const seen = new Set();
    const questions = [];
    for (const q of list) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      questions.push({ q, province: q.province || entry.name });
    }
    if (questions.length) out.push({ name: `v2p/${entry.name}`, questions });
  }
  return out;
}

const sources = [
  loadIndexSource('v1', V1),
  loadIndexSource('v2', V2, '国考'),
  ...loadV2P(),
].filter(Boolean);

const hits = [];
for (const source of sources) {
  for (const { q, province } of source.questions) {
    const issues = getE10Issues(q);
    if (!issues.length) continue;
    hits.push({
      dataset: source.name,
      province,
      id: q.id,
      module: q.module,
      answer: q.answer,
      isAbnormal: q.isAbnormal === true,
      issues,
      stem: String(q.stem || '').slice(0, 240),
      material: String(q.material || '').slice(0, 240),
      options: (q.options || []).map(option => `${option?.key}.${String(option?.text || '').slice(0, 80)}`),
    });
  }
}

const byCode = {};
const byProvince = {};
const byDataset = {};
for (const hit of hits) {
  for (const issue of hit.issues) byCode[issue.code] = (byCode[issue.code] || 0) + 1;
  const key = `${hit.dataset}|${hit.province}`;
  byProvince[key] = (byProvince[key] || 0) + 1;
  byDataset[hit.dataset] = (byDataset[hit.dataset] || 0) + 1;
}

const summary = {
  generatedAt: new Date().toISOString(),
  sources: sources.map(source => ({ name: source.name, questions: source.questions.length })),
  totalQuestions: sources.reduce((sum, source) => sum + source.questions.length, 0),
  hits: hits.length,
  byCode,
  byDataset,
  byProvince,
  samples: hits.slice(0, 30),
  all: hits,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2), 'utf8');

console.log('===== E10 全库扫描（只读） =====');
console.log(`题量: ${summary.totalQuestions}  命中: ${summary.hits}`);
console.log('按代码:', JSON.stringify(byCode));
console.log('按数据集:', JSON.stringify(byDataset));
console.log(`明细: ${OUT}`);
