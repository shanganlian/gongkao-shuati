#!/usr/bin/env node
/** 福建 v2 修复后独立校验（只读）。 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const OUT = path.join(ROOT, 'guokao-reports', 'fujian-v2-校验.txt');
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fail(msg) {
  throw new Error(msg);
}

function main() {
  const index = readJson(path.join(DIR, 'index.json'));
  const shardFiles = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f)).sort();
  const rows = [];
  for (const file of shardFiles) {
    const list = readJson(path.join(DIR, file));
    for (const q of list) rows.push(q);
  }
  const aggregate = readJson(path.join(DIR, 'questions.json'));
  const ids = new Map();
  for (const q of rows) {
    if (!q.id) fail('存在空 ID');
    if (!ids.has(q.id)) ids.set(q.id, []);
    ids.get(q.id).push(q);
  }
  const dup = [...ids.entries()].filter(([, list]) => list.length > 1);

  const bad = [];
  const check = (ok, msg) => {
    if (!ok) bad.push(msg);
  };
  check(rows.length === 2564, `分片题数=${rows.length}（期望 2564）`);
  check(aggregate.length === 2564, `questions.json 题数=${aggregate.length}（期望 2564）`);
  check(!rows.some(q => Object.prototype.hasOwnProperty.call(q, '__file')), '分片仍存在内部 __file 字段');
  check(!aggregate.some(q => Object.prototype.hasOwnProperty.call(q, '__file')), 'questions.json 仍存在内部 __file 字段');
  check(dup.length === 0, `重复 ID 组=${dup.length}`);
  check(Object.keys(index).length === 5, `index key=${Object.keys(index).length}（期望 5）`);
  const referenced = Object.values(index).flat().sort();
  check(JSON.stringify(referenced) === JSON.stringify(shardFiles), 'index 与实际分片不完全一致');

  const spring = rows.filter(q => String(q.id).startsWith('prov-fujian-2010-春季-'));
  const springQ36 = spring.filter(q => {
    const m = String(q.source).match(/第(\d+)题/);
    const n = m ? Number(m[1]) : 0;
    return n >= 36 && n <= 60;
  });
  check(springQ36.length === 25, `2010 春季 Q36-Q60 数量=${springQ36.length}（期望 25）`);
  check(springQ36.every(q => q.module === 'yanyu'), '2010 春季 Q36-Q60 存在非 yanyu');
  check(spring.every(q => !String(q.id).includes('2011')), '2010 春季混入 2011 ID');

  const y424 = rows.filter(q => String(q.id).startsWith('prov-fujian-2011-424联考-'));
  const y917 = rows.filter(q => String(q.id).startsWith('prov-fujian-2011-917联考-'));
  check(y424.length === 120, `2011 424 题数=${y424.length}（期望 120）`);
  check(y917.length === 120, `2011 917 题数=${y917.length}（期望 120）`);
  check(!rows.some(q => String(q.id).includes('prov-fujian-2011-联考-')), '仍存在旧 2011-联考 ID');
  const q424 = y424.find(q => String(q.id).endsWith('-2'));
  const q917 = y917.find(q => String(q.id).endsWith('-2'));
  check(!!q424 && !!q917, '找不到 2011 两卷 Q2');
  check(!!q917?.explanation, '2011 917 Q2 解析为空');
  check(q424?.explanation !== q917?.explanation, '2011 917 Q2 仍与 424 解析相同');
  check(/常识|行政|外交|法律|正确|错误|答案/.test(String(q917?.explanation || '')), '2011 917 Q2 解析不像常识');
  const y917Changshi = y917.filter(q => {
    const m = String(q.source).match(/第(\d+)题/);
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 20;
  });
  check(y917Changshi.length === 20 && y917Changshi.every(q => q.module === 'changshi'), '2011 917 Q1-Q20 模块异常');

  const y421 = rows.filter(q => String(q.id).startsWith('prov-fujian-2012-421联考-'));
  const y915 = rows.filter(q => String(q.id).startsWith('prov-fujian-2012-915联考-'));
  check(y421.length === 120, `2012 421 题数=${y421.length}（期望 120）`);
  check(y915.length === 120, `2012 915 题数=${y915.length}（期望 120）`);
  check(!rows.some(q => String(q.id).includes('prov-fujian-2012-联考-')), '仍存在旧 2012-联考 ID');

  const lines = [];
  lines.push('福建 v2 修复后独立校验');
  lines.push(`生成时间：${new Date().toISOString()}`);
  lines.push('');
  lines.push(`分片：${shardFiles.length} 个 / ${rows.length} 题`);
  lines.push(`index：${Object.keys(index).length} keys`);
  lines.push(`questions.json：${aggregate.length} 题`);
  lines.push(`唯一 ID：${ids.size} / 重复组：${dup.length}`);
  lines.push(`2010 春季：${spring.length} 题，Q36-Q60 yanyu ${springQ36.filter(q => q.module === 'yanyu').length}/25`);
  lines.push(`2011 424：${y424.length} 题；2011 917：${y917.length} 题；917 常识 Q1-Q20：${y917Changshi.filter(q => q.module === 'changshi').length}/20`);
  lines.push(`2012 421：${y421.length} 题；2012 915：${y915.length} 题`);
  lines.push('');
  if (bad.length) {
    lines.push('结论：❌ 失败');
    for (const b of bad) lines.push(`- ${b}`);
  } else {
    lines.push('结论：✅ 全部通过');
  }
  fs.writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
  if (bad.length) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  fs.writeFileSync(OUT, `福建 v2 独立校验失败：${err?.stack || err}\n`, 'utf8');
  console.error(err);
  process.exitCode = 1;
}
