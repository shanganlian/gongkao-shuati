/**
 * 国考 v2 缺选项回填（7 题）
 *
 * 用法：node scripts/patches/2026-10-19-gk-missing-options.cjs
 *
 * 幂等：按题目 ID 读取分片，补/覆盖 options 后按 A-D 排序写回。
 * 数据来源见 guokao-reports/v2-缺选项回填对照-2026-10-19.md。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const V2 = path.join(ROOT, 'public', 'data', 'questions-v2');

const PATCHES = [
  {
    id: 'gk-2003-A卷-84',
    file: 'national-none-yanyu-0.json',
    add: { A: '孔子发展了前人的学说，把礼和仁统一起来了' },
    note: '2003 国考 A 卷第 84 题；公开题库原文 A 项',
  },
  {
    id: 'gk-2002-B卷-79',
    file: 'national-none-shuliang-0.json',
    add: { C: '0' },
    note: '数列差为 10,5,5,0；同卷解析明确 5-5=0，答案 C',
  },
  {
    id: 'gk-2004-A卷-38',
    file: 'national-none-shuliang-0.json',
    add: { B: '0' },
    note: '原式=0；同卷解析给出答案 B',
  },
  {
    id: 'gk-2004-B卷-35',
    file: 'national-none-shuliang-0.json',
    add: { B: '0' },
    note: '原式=0；同卷解析给出答案 B',
  },
  {
    id: 'gk-2008-未标注-125',
    file: 'national-none-ziliao-1.json',
    add: { A: '年印刷量减少的企业数 11 11' },
    note: 'A 项文字就在原卷题干表格中（A年印刷量减少的企业数 11 11）',
  },
  {
    id: 'gk-2022-地市级-114',
    file: 'national-none-ziliao-3.json',
    add: { C: '0.7' },
    note: '同卷完整选项表 A.1.9 B.1.6 C.0.7 D.0.5',
  },
  {
    id: 'gk-2022-地市级-128',
    file: 'national-none-ziliao-3.json',
    add: { B: '17' },
    note: '同卷完整选项表 A.15 B.17 C.11 D.13',
  },
];

function orderedOptions(options) {
  const map = new Map();
  for (const o of options || []) {
    if (o && o.key) map.set(String(o.key).trim().toUpperCase(), String(o.text || '').trim());
  }
  return [...map.keys()]
    .sort()
    .map((key) => ({ key, text: map.get(key) }));
}

let changed = 0;
const byFile = new Map();
for (const p of PATCHES) {
  if (!byFile.has(p.file)) byFile.set(p.file, []);
  byFile.get(p.file).push(p);
}

for (const [file, patches] of byFile) {
  const full = path.join(V2, file);
  const arr = JSON.parse(fs.readFileSync(full, 'utf8'));
  let fileChanged = false;
  for (const p of patches) {
    const q = arr.find((x) => x.id === p.id);
    if (!q) throw new Error(`题目不存在: ${p.id}`);
    const merged = new Map((q.options || []).map((o) => [String(o.key).trim().toUpperCase(), String(o.text || '').trim()]));
    for (const [key, text] of Object.entries(p.add)) merged.set(key, text);
    q.options = orderedOptions([...merged.entries()].map(([key, text]) => ({ key, text })));
    const keys = q.options.map((o) => o.key).join('');
    if (keys !== 'ABCD') throw new Error(`${p.id} 选项 key 不是 ABCD: ${keys}`);
    if (!q.options.every((o) => o.text)) throw new Error(`${p.id} 存在空选项`);
    if (!q.options.some((o) => o.key === q.answer)) throw new Error(`${p.id} 答案不在选项中`);
    console.log(`[PATCH] ${p.id} -> ${q.options.map((o) => `${o.key}.${o.text}`).join(' | ')}`);
    changed++;
    fileChanged = true;
  }
  if (fileChanged) fs.writeFileSync(full, JSON.stringify(arr, null, 2) + '\n', 'utf8');
}

console.log(`[DONE] 回填 ${changed} 题，涉及 ${byFile.size} 个分片`);
