/**
 * 知识点卡片导入：素材 md → public/data/knowledge/<module>.json
 *
 * 素材结构：markdown 中若干 ```json 代码块，每个块是一张卡片对象。
 * 导入纪律：
 *   1. 只按 CARD_FIELDS 白名单取字段，markdown 头部的修订记录 / 施工说明一律不落盘；
 *   2. 落盘前跑 scripts/lib/knowledge-cards-rules.cjs 全量校验，有 ERROR 直接退出非 0，不写文件；
 *   3. 输出是纯 JSON 数组，前端 fetch 即可，不含任何注释或元信息。
 *
 * 用法：
 *   node scripts/import-knowledge-cards.cjs                      # 自动取最新一份素材，写默认输出
 *   node scripts/import-knowledge-cards.cjs --dry-run            # 只校验、不写文件
 *   node scripts/import-knowledge-cards.cjs --source <md> --out <json>
 *   node scripts/import-knowledge-cards.cjs --expect-count 62
 */
const fs = require('fs');
const path = require('path');
const { CARD_FIELDS, validateCards } = require('./lib/knowledge-cards-rules.cjs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT, 'public', 'data', 'knowledge', 'ziliaofenxi.json');

const argValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  return idx > -1 ? process.argv[idx + 1] : null;
};

const DRY_RUN = process.argv.includes('--dry-run');
const OUT_FILE = path.resolve(argValue('--out') || DEFAULT_OUT);
const EXPECT_COUNT = argValue('--expect-count') ? Number(argValue('--expect-count')) : null;

/** 自动挑素材：同一目录下按文件名排最后的一份（文件名带日期，天然有序） */
function pickSource() {
  const explicit = argValue('--source');
  if (explicit) return path.resolve(explicit);
  const dir = path.join(ROOT, 'source-data', '知识点资料');
  const candidates = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.includes('资料分析知识卡片'))
    .sort();
  if (!candidates.length) {
    console.error(`[致命] 未在 ${dir} 找到「资料分析知识卡片」素材 md`);
    process.exit(1);
  }
  return path.join(dir, candidates[candidates.length - 1]);
}

/** 抽取 ```json ... ``` 代码块，返回 { cards, blocks, invalid } */
function extractBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  const invalid = [];
  let buf = null;
  let startLine = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (buf === null && trimmed === '```json') {
      buf = [];
      startLine = i + 1; // 1-based 行号
      return;
    }
    if (buf !== null && trimmed === '```') {
      const raw = buf.join('\n').trim();
      try {
        blocks.push({ card: JSON.parse(raw), line: startLine });
      } catch (err) {
        invalid.push({ line: startLine, message: err.message });
      }
      buf = null;
      return;
    }
    if (buf !== null) buf.push(line);
  });

  if (buf !== null) invalid.push({ line: startLine, message: '```json 代码块未闭合' });
  return { blocks, invalid };
}

function pickFields(card) {
  const out = {};
  for (const field of CARD_FIELDS) {
    if (field in card) out[field] = card[field];
  }
  return out;
}

function report(result) {
  const { errors, warnings, stats } = result;
  console.log(`\n[统计] 卡片 ${stats.total} 张 / 唯一 id ${stats.ids} 个 / 覆盖层级 ${stats.layers} 层`);
  if (warnings.length) {
    console.log(`[WARN] ${warnings.length} 条`);
    warnings.slice(0, 20).forEach((w) => console.log(`  ${w.code} ${w.id || '-'} ${w.detail}`));
    if (warnings.length > 20) console.log(`  … 其余 ${warnings.length - 20} 条省略`);
  }
  if (errors.length) {
    console.log(`[ERROR] ${errors.length} 条`);
    errors.slice(0, 50).forEach((e) => console.log(`  ${e.code} ${e.id || '-'} ${e.detail}`));
    if (errors.length > 50) console.log(`  … 其余 ${errors.length - 50} 条省略`);
  }
}

function main() {
  const source = pickSource();
  console.log(`[素材] ${path.relative(ROOT, source)}`);
  const md = fs.readFileSync(source, 'utf8');
  const { blocks, invalid } = extractBlocks(md);

  if (invalid.length) {
    console.error('[致命] 存在无法解析的 JSON 块：');
    invalid.forEach((item) => console.error(`  第 ${item.line} 行：${item.message}`));
    process.exit(1);
  }

  const cards = blocks.map((b) => pickFields(b.card));
  console.log(`[解析] 抽取到 ${cards.length} 张卡（JSON 块 ${blocks.length} 个）`);

  if (EXPECT_COUNT !== null && cards.length !== EXPECT_COUNT) {
    console.error(`[致命] 卡片数量不符：期望 ${EXPECT_COUNT}，实际 ${cards.length}`);
    process.exit(1);
  }

  const result = validateCards(cards);
  report(result);

  if (result.errors.length) {
    console.error('\n[中止] 校验未通过，未写入任何文件。');
    process.exit(1);
  }

  const json = `${JSON.stringify(cards, null, 2)}\n`;

  if (DRY_RUN) {
    console.log(`\n[dry-run] 校验通过，未写文件（目标：${path.relative(ROOT, OUT_FILE)}）`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, json, 'utf8');
  const sizeKb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
  console.log(`\n[写入] ${path.relative(ROOT, OUT_FILE)}（${cards.length} 张卡 / ${sizeKb} kB）`);
}

main();
