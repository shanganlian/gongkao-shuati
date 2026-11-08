/**
 * 知识点卡片校验器（导入流程必跑）
 *
 * 用法：
 *   node scripts/validate-knowledge-cards.cjs                    # 校验默认数据文件
 *   node scripts/validate-knowledge-cards.cjs --file <json>
 *   node scripts/validate-knowledge-cards.cjs --json             # 输出机器可读的校验摘要
 *
 * 校验项（ERROR 退出码 1）：
 *   ① 九必填字段齐全（audio 必须存在且为空串）
 *   ② id 唯一且符合 zlfx-层号-序号（如 zlfx-02-001）
 *   ③ questions 仅允许 ["待配题"]、audio 仅允许 ""
 *   ④ 禁用词扫描（来源专属概念 / 审核留痕词），命中即 ERROR
 *   ⑤ 不许出现 markdown 元信息 / 未知字段（防止素材头部说明混进数据）
 */
const fs = require('fs');
const path = require('path');
const { validateCards, BANNED_WORDS } = require('./lib/knowledge-cards-rules.cjs');

const ROOT = path.join(__dirname, '..');
const argValue = (flag) => {
  const idx = process.argv.indexOf(flag);
  return idx > -1 ? process.argv[idx + 1] : null;
};

const FILE = path.resolve(argValue('--file') || path.join(ROOT, 'public', 'data', 'knowledge', 'ziliaofenxi.json'));
const JSON_OUT = process.argv.includes('--json');

function fail(message) {
  if (JSON_OUT) {
    console.log(JSON.stringify({ ok: false, fatal: message }, null, 2));
  } else {
    console.error(`[致命] ${message}`);
  }
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`未找到数据文件：${path.relative(ROOT, FILE)}（先跑 scripts/import-knowledge-cards.cjs）`);
}

const rawText = fs.readFileSync(FILE, 'utf8').replace(/^\uFEFF/, '');
let cards;
try {
  cards = JSON.parse(rawText);
} catch (err) {
  fail(`JSON 解析失败：${err.message}`);
}

const { errors, warnings, stats } = validateCards(cards, { rawText });
const ok = errors.length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify({
    ok,
    file: path.relative(ROOT, FILE),
    stats,
    errors,
    warnings,
    bannedWords: BANNED_WORDS,
  }, null, 2));
} else {
  console.log(`[文件] ${path.relative(ROOT, FILE)}`);
  console.log(`[统计] 卡片 ${stats.total} 张 / 唯一 id ${stats.ids} 个 / 覆盖层级 ${stats.layers} 层`);
  console.log(`[禁用词] ${BANNED_WORDS.length} 个：${BANNED_WORDS.join('、')}`);

  if (warnings.length) {
    console.log(`\n[WARN] ${warnings.length} 条`);
    warnings.slice(0, 20).forEach((w) => console.log(`  ${w.code} ${w.id || '-'} ${w.detail}`));
    if (warnings.length > 20) console.log(`  … 其余 ${warnings.length - 20} 条省略`);
  }

  if (errors.length) {
    console.log(`\n[ERROR] ${errors.length} 条`);
    errors.slice(0, 100).forEach((e) => console.log(`  ${e.code} ${e.id || '-'} ${e.detail}`));
    if (errors.length > 100) console.log(`  … 其余 ${errors.length - 100} 条省略`);
    console.log('\n[结论] 校验失败');
  } else {
    console.log('\n[结论] 校验通过');
  }
}

process.exit(ok ? 0 : 1);
