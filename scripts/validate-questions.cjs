/**
 * 题库导入校验器
 *
 * 用途：新题库导入 public/data/questions/ 后运行，检出脏数据。
 *
 * 用法：
 *   node scripts/validate-questions.js              # 全量校验，输出报告
 *   node scripts/validate-questions.js --strict     # 有 ERROR 时退出码 1（可用于 CI）
 *   node scripts/validate-questions.js --limit 50   # 每类最多打印 50 条样例
 *
 * 校验规则：
 *   [ERROR] E01 题干为空（stem 缺失 / trim 后为空）
 *   [ERROR] E02 客观题缺少选项（options 为空或 < 2 项，图片题除外）
 *   [ERROR] E03 选项文本为空
 *   [ERROR] E04 选项 key 重复（如 [CDABCDABC]，多为多题合并）
 *   [ERROR] E05 选项 key 不是 A/B/C/D 序列
 *   [ERROR] E06 答案不在选项范围内
 *   [ERROR] E07 stem 含选项标记（选项被粘进题干，如 "…的是： A、xxx"；
 *           题干中全部为「A、B 两地」式变量枚举时豁免，见 lib/stem-option-mark.cjs）
 *   [WARN]  W01 题干过短（< 8 字）
 *   [WARN]  W02 缺少解析
 *   [WARN]  W03 缺少 thinkingTip
 *   [WARN]  W04 题干含题号（疑似多题合并）
 *   [WARN]  W05 题干过长（> 2000 字，疑似多题合并）
 *   [WARN]  W06 图片题未标记 isImageQuestion
 *
 * 输出：
 *   - 控制台汇总 + 样例
 *   - validate-questions-report.csv（全量问题明细）
 */
const fs = require('fs');
const path = require('path');

const DIR_IDX = process.argv.indexOf('--dir');
const DATA_DIR = DIR_IDX > -1
  ? path.resolve(process.argv[DIR_IDX + 1])
  : path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT_CSV = DIR_IDX > -1
  ? path.join(__dirname, '..', `validate-questions-${path.basename(DATA_DIR)}.csv`)
  : path.join(__dirname, '..', 'validate-questions-report.csv');
const STRICT = process.argv.includes('--strict');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx > -1 ? parseInt(process.argv[limitIdx + 1], 10) : 10;

const SUBJECTIVE = ['shenlun', 'gongji'];
const VALID_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

// stem 中的选项标记：行首/空白后的 A、/A./A．/A)/A：，且后面紧跟内容
// 变量枚举（"A、B 两地"）由 lib/stem-option-mark.cjs 豁免，见该文件说明
const { hasStemOptionMark, firstMarkPos } = require('./lib/stem-option-mark.cjs');
// 题干中的题号（如 "17\n" 或 "17、"）
const STEM_QUESTION_NO = /(?:^|[\s\n])\d{1,3}\s*(?:[、.．]|\n)/;

const INDEX_FILE = path.join(DATA_DIR, 'index.json');
if (!fs.existsSync(INDEX_FILE)) {
  console.error(`[致命] 未找到 index.json: ${INDEX_FILE}`);
  console.error('请先用转换脚本生成 index.json，或用 --dir 指向正确目录。');
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

const cache = {};
const load = f => (cache[f] ||= JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));

const issues = [];
const add = (level, code, q, file, detail) => issues.push({ level, code, id: q?.id, file, module: q?.module, detail });

const seen = new Set();
let total = 0;

for (const key of Object.keys(index)) {
  for (const f of index[key]) {
    for (const q of load(f)) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      total++;

      const stem = typeof q.stem === 'string' ? q.stem : '';
      const opts = Array.isArray(q.options) ? q.options : [];
      const isSubjective = SUBJECTIVE.includes(q.module);
      const isImage = q.isImageQuestion === true;

      // ---- E01 题干为空 ----
      if (stem.trim() === '') {
        add('ERROR', 'E01', q, f, '题干为空');
        continue; // 题干为空时后续规则无意义
      }

      // ---- E07 stem 含选项标记（变量枚举已豁免，见 lib/stem-option-mark.cjs） ----
      if (hasStemOptionMark(stem, opts)) {
        const pos = firstMarkPos(stem);
        add('ERROR', 'E07', q, f, `stem 含选项标记: ${JSON.stringify(stem.slice(Math.max(0, pos), pos + 60))}`);
      }

      // ---- 客观题选项校验 ----
      if (!isSubjective && !isImage) {
        if (opts.length === 0) {
          add('ERROR', 'E02', q, f, '缺少选项');
        } else if (opts.length < 2) {
          add('ERROR', 'E02', q, f, `选项数量不足(${opts.length})`);
        } else {
          // E03 选项文本为空
          const emptyOpt = opts.find(o => !o || typeof o.text !== 'string' || o.text.trim() === '');
          if (emptyOpt) add('ERROR', 'E03', q, f, `选项 ${emptyOpt?.key} 文本为空`);

          // E04 选项 key 重复
          const keys = opts.map(o => String(o?.key || '').toUpperCase());
          const hasDup = new Set(keys).size !== keys.length;
          if (hasDup) {
            add('ERROR', 'E04', q, f, `选项 key 重复 [${keys.join('')}]`);
          }

          // E05 选项 key 不是 A/B/C/D 序列（仅在无重复时检查，避免与 E04 重复计数）
          const expected = VALID_KEYS.slice(0, opts.length);
          if (!hasDup && keys.join('') !== expected.join('')) {
            add('ERROR', 'E05', q, f, `选项 key 非标准序列 [${keys.join('')}]，期望 [${expected.join('')}]`);
          }

          // E06 答案不在选项范围内
          if (q.answer && !keys.includes(String(q.answer).toUpperCase())) {
            add('ERROR', 'E06', q, f, `答案 ${JSON.stringify(q.answer)} 不在选项 [${keys.join('')}] 中`);
          }
        }
      }

      // ---- WARN ----
      if (stem.trim().length < 8) add('WARN', 'W01', q, f, `题干过短(${stem.trim().length}字)`);
      if (!q.explanation || String(q.explanation).trim() === '') add('WARN', 'W02', q, f, '缺少解析');
      if (!q.thinkingTip || String(q.thinkingTip).trim() === '') add('WARN', 'W03', q, f, '缺少 thinkingTip');
      if (STEM_QUESTION_NO.test(stem)) add('WARN', 'W04', q, f, '题干含题号（疑似多题合并）');
      if (stem.length > 2000) add('WARN', 'W05', q, f, `题干过长(${stem.length}字)`);
      if (!isSubjective && opts.length === 0 && !isImage) add('WARN', 'W06', q, f, '无选项且未标记 isImageQuestion');
    }
  }
}

// ---- 汇总 ----
const byCode = {};
for (const it of issues) {
  byCode[it.code] ||= { level: it.level, count: 0, samples: [] };
  byCode[it.code].count++;
  if (byCode[it.code].samples.length < LIMIT) byCode[it.code].samples.push(it);
}

const errors = issues.filter(i => i.level === 'ERROR');
const warns = issues.filter(i => i.level === 'WARN');

console.log('===== 题库导入校验报告 =====\n');
console.log(`题目总数: ${total}`);
console.log(`ERROR: ${errors.length}   WARN: ${warns.length}\n`);

const CODE_DESC = {
  E01: '题干为空', E02: '缺少选项', E03: '选项文本为空', E04: '选项 key 重复',
  E05: '选项 key 非标准序列', E06: '答案不在选项范围', E07: 'stem 含选项标记',
  W01: '题干过短', W02: '缺少解析', W03: '缺少 thinkingTip',
  W04: '题干含题号', W05: '题干过长', W06: '图片题未标记'
};

for (const code of Object.keys(byCode).sort()) {
  const b = byCode[code];
  console.log(`[${b.level}] ${code} ${CODE_DESC[code] || ''}: ${b.count}`);
  for (const s of b.samples) {
    console.log(`    ${s.id}  ${s.detail}`);
  }
  console.log('');
}

// ---- CSV ----
const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
const rows = [['level', 'code', 'id', 'file', 'module', 'detail']];
for (const it of issues) rows.push([it.level, it.code, it.id, it.file, it.module, it.detail]);
fs.writeFileSync(OUT_CSV, '\uFEFF' + rows.map(r => r.map(esc).join(',')).join('\n'), 'utf8');
console.log(`明细已写入: ${OUT_CSV}`);

if (STRICT && errors.length > 0) {
  console.error(`\n[strict] 存在 ${errors.length} 个 ERROR，校验失败。`);
  process.exit(1);
}
