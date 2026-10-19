#!/usr/bin/env node
/** 清除福建 v2 分片中被误写入的审计内部字段（__file），并重写 index/questions.json。 */
const fs = require('node:fs');
const path = require('node:path');
const { writeProvinceShards } = require('./overnight-provinces.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const OUT = path.join(ROOT, 'guokao-reports', 'fujian-v2-内部字段清理.txt');
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);
const APPLY = process.argv.includes('--apply');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f));
  const rows = [];
  let dirty = 0;
  for (const file of files) {
    for (const q of readJson(path.join(DIR, file))) {
      if (Object.prototype.hasOwnProperty.call(q, '__file')) {
        delete q.__file;
        dirty += 1;
      }
      rows.push(q);
    }
  }
  const ids = new Set(rows.map(q => q.id));
  const lines = [
    '福建 v2 内部字段清理',
    `生成时间：${new Date().toISOString()}`,
    `模式：${APPLY ? 'APPLIED' : 'DRY-RUN'}`,
    `清理 __file：${dirty} 条`,
    `题数：${rows.length} / 唯一 ID：${ids.size}`,
  ];
  if (APPLY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(ROOT, 'guokao-reports', `backup-fujian-v2-pre-clean-${stamp}`);
    fs.cpSync(DIR, backup, { recursive: true });
    lines.push(`写入前备份：${path.relative(ROOT, backup).replace(/\\/g, '/')}`);
    writeProvinceShards('福建', 'fujian', rows);
    const after = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f));
    let remaining = 0;
    for (const file of after) {
      const text = fs.readFileSync(path.join(DIR, file), 'utf8');
      if (text.includes('"__file"')) remaining += 1;
    }
    lines.push(`重写分片：${after.length} 个`);
    lines.push(`残留 __file 分片：${remaining}`);
    lines.push(`结论：${remaining === 0 && rows.length === 2564 && ids.size === 2564 ? '✅ 通过' : '❌ 失败'}`);
  } else {
    lines.push('结论：dry-run，未写入');
  }
  fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
  if (APPLY && !(rows.length === 2564 && ids.size === 2564)) process.exitCode = 1;
}

main();
