/**
 * 数据层验证：模拟前端 useQuestions 的加载 + 校验逻辑，
 * 检查各考试/省份/模块组合下能正常渲染的题目数量。
 *
 * 用法：node scripts/verify-question-loading.cjs
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT = path.join(__dirname, 'verify-question-loading.txt');

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const idMap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'idMap.json'), 'utf8'));

const SUBJECTIVE = ['shenlun', 'gongji'];

function getInvalidReason(q) {
  if (!q || typeof q !== 'object') return '题目对象为空';
  if (typeof q.stem !== 'string' || q.stem.trim() === '') return '题干为空';
  // 图片题（选项为图片，文本化丢失）允许无选项
  if (!SUBJECTIVE.includes(q.module) && q.isImageQuestion !== true) {
    if (!Array.isArray(q.options) || q.options.length === 0) return '缺少选项';
    if (q.options.length < 2) return '选项数量不足';
    if (q.options.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) return '选项文本为空';
  }
  return null;
}

const cache = {};
function loadChunk(f) {
  if (!cache[f]) cache[f] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  return cache[f];
}

const lines = [];
const log = s => { lines.push(s); console.log(s); };

log('===== 数据层验证：模拟前端加载 + 校验 =====\n');

// 1. 分类浏览：每个 index key 加载全部分片
log('-- 1. 分类浏览（每个 key 加载全部分片）--');
const keyStats = [];
for (const key of Object.keys(index)) {
  const files = index[key];
  const seen = new Set();
  let total = 0, valid = 0, placeholders = 0;
  const reasons = {};
  for (const f of files) {
    for (const q of loadChunk(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      total++;
      if (q.isPlaceholder) placeholders++;
      const r = getInvalidReason(q);
      if (r) reasons[r] = (reasons[r] || 0) + 1;
      else valid++;
    }
  }
  keyStats.push({ key, files: files.length, total, valid, skipped: total - valid, placeholders, reasons });
}
keyStats.sort((a, b) => b.total - a.total);
for (const s of keyStats) {
  const r = Object.entries(s.reasons).map(([k, v]) => `${k}:${v}`).join(', ');
  log(`  ${s.key.padEnd(28)} 分片${String(s.files).padStart(2)}  总${String(s.total).padStart(5)}  有效${String(s.valid).padStart(5)}  跳过${String(s.skipped).padStart(3)}${s.placeholders ? '  (占位' + s.placeholders + ')' : ''}${r ? '  [' + r + ']' : ''}`);
}

// 2. 多分片 ID 修复验证：对比 chunks[0] vs 全部分片
log('\n-- 2. 多分片 ID 加载修复验证 --');
const multiIds = Object.entries(idMap).filter(([, v]) => v.length > 1);
let onlyFirstFound = 0, allFound = 0, missingAll = 0;
for (const [id, chunks] of multiIds) {
  const inFirst = loadChunk(chunks[0]).some(q => q.id === id);
  const inAny = chunks.some(c => loadChunk(c).some(q => q.id === id));
  if (inFirst) onlyFirstFound++;
  if (inAny) allFound++;
  else missingAll++;
}
log(`  多分片 ID 总数: ${multiIds.length}`);
log(`  旧逻辑(chunks[0])能找到: ${onlyFirstFound}`);
log(`  新逻辑(全部分片)能找到: ${allFound}`);
log(`  所有分片都找不到: ${missingAll}`);

// 3. 各模块有效题目数（全部省份）
log('\n-- 3. 各模块有效题目数（全部分类）--');
const modStats = {};
for (const s of keyStats) {
  const mod = s.key.split('-')[2];
  if (!modStats[mod]) modStats[mod] = { total: 0, valid: 0 };
  modStats[mod].total += s.total;
  modStats[mod].valid += s.valid;
}
for (const [mod, st] of Object.entries(modStats)) {
  log(`  ${mod.padEnd(10)} 总${String(st.total).padStart(6)}  有效${String(st.valid).padStart(6)}  跳过${String(st.total - st.valid).padStart(3)}`);
}

// 4. 结论
const totalAll = keyStats.reduce((a, s) => a + s.total, 0);
const validAll = keyStats.reduce((a, s) => a + s.valid, 0);
const phAll = keyStats.reduce((a, s) => a + s.placeholders, 0);
log('\n-- 4. 汇总 --');
log(`  题目总数: ${totalAll}`);
log(`  可渲染: ${validAll}`);
log(`  被校验跳过: ${totalAll - validAll}`);
log(`  跳过率: ${((totalAll - validAll) / totalAll * 100).toFixed(3)}%`);
log(`  其中占位题（原卷文本缺失 isPlaceholder）: ${phAll}`);
log(`  真实缺陷跳过（非占位）: ${totalAll - validAll - phAll}`);
log(`  真实缺陷率: ${((totalAll - validAll - phAll) / totalAll * 100).toFixed(3)}%`);
log(`\n  结论: ${validAll > 0 ? '✅ 笔试专区有大量可正常显示的题目' : '❌ 无可显示题目'}`);

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('\n报告已写入:', OUT);
