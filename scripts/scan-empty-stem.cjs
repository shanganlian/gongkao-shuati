/**
 * 扫描题库分片，统计 stem 为空（或 trim 后为空）的题目
 * 输出：empty_stem.csv（清单 + 按考试/模块/文件分布）
 *
 * 用法：node scripts/scan-empty-stem.cjs
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT_CSV = path.join(__dirname, '..', 'empty_stem.csv');

function csvEscape(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, '\\n') + '"';
}

function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'idMap.json')
    .sort();

  const rows = [];
  let totalQuestions = 0;
  const byCategory = {};
  const byModule = {};
  const byFile = {};

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    } catch (e) {
      console.error(`[解析失败] ${file}: ${e.message}`);
      continue;
    }
    if (!Array.isArray(data)) continue;

    data.forEach((q, idx) => {
      totalQuestions++;
      if (!q || typeof q !== 'object') return;
      const stem = typeof q.stem === 'string' ? q.stem : '';
      if (stem.trim() !== '') return;

      const category = q.category || '(空)';
      const module = q.module || '(空)';
      byCategory[category] = (byCategory[category] || 0) + 1;
      byModule[module] = (byModule[module] || 0) + 1;
      byFile[file] = (byFile[file] || 0) + 1;

      rows.push({
        file,
        index: idx,
        id: q.id || '',
        category,
        module,
        province: q.province || '',
        source: q.source || '',
        title: q.title || '',
        stemRaw: JSON.stringify(q.stem),
        optionsCount: Array.isArray(q.options) ? q.options.length : -1,
        optionsJson: JSON.stringify(q.options || null),
        answer: q.answer || ''
      });
    });
  }

  const header = [
    'file', 'index', 'id', 'category', 'module', 'province', 'source',
    'title', 'stemRaw', 'optionsCount', 'optionsJson', 'answer'
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(header.map(h => csvEscape(r[h])).join(','));
  }
  fs.writeFileSync(OUT_CSV, '\uFEFF' + lines.join('\r\n'), 'utf8');

  console.log('===== 扫描结果 =====');
  console.log(`分片文件数: ${files.length}`);
  console.log(`题目总数: ${totalQuestions}`);
  console.log(`stem 为空题目数: ${rows.length}`);
  console.log('\n-- 按考试类型 --');
  Object.entries(byCategory).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\n-- 按模块 --');
  Object.entries(byModule).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('\n-- 按文件 --');
  Object.entries(byFile).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(`\n清单已写入: ${OUT_CSV}`);
}

main();
