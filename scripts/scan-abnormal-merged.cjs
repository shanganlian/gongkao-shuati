/**
 * 扫描「多题合并」脏数据。
 *
 * 判定信号（满足任一即命中）：
 *   a. options 存在重复 key（如 [A,A,A,A] 或 [CDABCDABC]）
 *   b. 任一 option.text 或 stem 内匹配 /[0-9]{1,3}、/ 形式的题号，且其后紧跟汉字题干
 *      （如 "83、下列选项中……"）
 *   c. 单条记录的 stem + options 总长度异常（> 500 字）
 *
 * 输出：
 *   - 控制台统计（命中数 + 按考试/模块分布 + 样例）
 *   - abnormal_merged_scan.csv（全量明细）
 *
 * 用法：node scripts/scan-abnormal-merged.cjs [样例数]
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT_CSV = path.join(__dirname, '..', 'abnormal_merged_scan.csv');
const SAMPLE_N = parseInt(process.argv[2] || '8', 10);

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const SUBJECTIVE = ['shenlun', 'gongji'];

// 题号模式：1~3 位数字 + 、，其后紧跟汉字（排除 "2023、" 这类年份、"1、" 这类小序号误判）
const QUESTION_NO_MERGED = /(?<![0-9])[0-9]{1,3}\s*、\s*[\u4e00-\u9fa5]/g;
const MAX_TOTAL_LEN = 500;

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

/** 选项 key 是否有重复 */
function hasDupKeys(opts) {
  const keys = opts.map(o => String(o?.key || '').toUpperCase());
  return new Set(keys).size !== keys.length;
}

/** 找出文本中的题号串 */
function findQuestionNos(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  QUESTION_NO_MERGED.lastIndex = 0;
  let m;
  while ((m = QUESTION_NO_MERGED.exec(text)) !== null) {
    out.push({ no: m[0].trim(), pos: m.index, ctx: text.slice(m.index, m.index + 30) });
  }
  return out;
}

// 按分片文件去重（同一分片可能被多个分类 key 引用），但不对题目 id 去重，
// 以保证统计口径与 mark-abnormal-merged.cjs 一致（后者逐分片写入标记）。
const scannedFiles = new Set();
const hits = [];

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    if (scannedFiles.has(f)) continue;
    scannedFiles.add(f);
    for (const q of load(f)) {
      if (SUBJECTIVE.includes(q.module)) continue;

      const stem = typeof q.stem === 'string' ? q.stem : '';
      const opts = Array.isArray(q.options) ? q.options : [];

      const signals = [];

      // a. 重复 key
      const dupKey = opts.length > 0 && hasDupKeys(opts);
      if (dupKey) {
        signals.push(`重复key[${opts.map(o => o?.key).join('')}]`);
      }

      // b. 题号串
      const stemNos = findQuestionNos(stem);
      if (stemNos.length > 0) signals.push(`stem题号串(${stemNos.length})`);
      let optNos = [];
      for (const o of opts) {
        const nos = findQuestionNos(o?.text);
        if (nos.length > 0) optNos.push({ key: o?.key, nos });
      }
      if (optNos.length > 0) signals.push(`选项题号串(${optNos.length}项)`);
      const hasNoSignal = stemNos.length > 0 || optNos.length > 0;

      // c. 总长异常 —— 仅作为 a/b 的佐证，单独命中不标记
      //    （资料分析题本身题干就长，单独用长度判定会大量误伤）
      const totalLen = stem.length + opts.reduce((a, o) => a + String(o?.text || '').length, 0);
      const tooLong = totalLen > MAX_TOTAL_LEN;
      if (tooLong && (dupKey || hasNoSignal)) signals.push(`总长${totalLen}`);

      // 判定：a 或 b 命中即标记；c 单独命中不标记
      if (!dupKey && !hasNoSignal) continue;

      // 解析考试分类：key 形如 national-none-changshi / provincial-宁夏-panduan
      const parts = key.split('-');
      const exam = parts[0];
      const province = parts[1];
      const module = parts[2];

      hits.push({
        id: q.id, file: f, key, exam, province, module,
        answer: q.answer,
        optKeys: opts.map(o => o?.key).join(''),
        optCount: opts.length,
        totalLen,
        signals,
        stemNos: stemNos.map(x => x.no),
        optNos,
        stem,
        opts
      });
    }
  }
}

// ---- 统计 ----
console.log('===== 扫描：多题合并脏数据 =====\n');
console.log(`命中总数: ${hits.length}\n`);

const bySignal = {};
for (const h of hits) {
  for (const s of h.signals) {
    // 归一化：去掉括号内的具体数值，只保留信号类别
    const k = s.replace(/[\[\(].*$/, '').replace(/^总长\d+$/, '总长>500');
    bySignal[k] = (bySignal[k] || 0) + 1;
  }
}
console.log('-- 按信号分布（可重叠）--');
for (const [k, v] of Object.entries(bySignal).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// 信号组合分布
const combo = {};
for (const h of hits) {
  const k = h.signals.map(s => s.replace(/[\[\(].*$/, '').replace(/^总长\d+$/, '总长>500')).sort().join(' + ');
  combo[k] = (combo[k] || 0) + 1;
}
console.log('\n-- 按信号组合分布 --');
for (const [k, v] of Object.entries(combo).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

const groupBy = (fn) => {
  const m = {};
  for (const h of hits) { const k = fn(h); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};

console.log('\n-- 按考试分布 --');
for (const [k, v] of groupBy(h => h.exam)) console.log(`  ${k.padEnd(20)} ${v}`);

console.log('\n-- 按模块分布 --');
for (const [k, v] of groupBy(h => h.module)) console.log(`  ${k.padEnd(12)} ${v}`);

console.log('\n-- 按省份分布（前 15）--');
for (const [k, v] of groupBy(h => h.province).slice(0, 15)) console.log(`  ${k.padEnd(12)} ${v}`);

console.log(`\n-- 样例（前 ${SAMPLE_N} 条）--`);
for (const h of hits.slice(0, SAMPLE_N)) {
  console.log('='.repeat(70));
  console.log(`id=${h.id}  module=${h.module}  answer=${JSON.stringify(h.answer)}`);
  console.log(`options keys=[${h.optKeys}] (${h.optCount} 个)  总长=${h.totalLen}`);
  console.log(`信号: ${h.signals.join(' | ')}`);
  console.log(`stem: ${JSON.stringify(h.stem.slice(0, 120))}`);
  for (const o of h.opts.slice(0, 4)) {
    console.log(`  ${o?.key}. ${JSON.stringify(String(o?.text || '').slice(0, 110))}`);
  }
}

// ---- CSV ----
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['id', 'file', 'exam', 'province', 'module', 'answer', 'opt_keys', 'opt_count', 'total_len', 'signals', 'stem_nos', 'stem_head', 'opt_texts']];
for (const h of hits) {
  rows.push([
    h.id, h.file, h.exam, h.province, h.module, h.answer, h.optKeys, h.optCount, h.totalLen,
    h.signals.join('; '), h.stemNos.join(','), h.stem.slice(0, 150),
    h.opts.map(o => `${o?.key}.${String(o?.text || '').slice(0, 60)}`).join(' || ').slice(0, 400)
  ]);
}
fs.writeFileSync(OUT_CSV, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');
console.log(`\n明细已写入: ${OUT_CSV}`);
