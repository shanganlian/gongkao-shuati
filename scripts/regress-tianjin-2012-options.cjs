#!/usr/bin/env node
/**
 * 回归测试：天津 2012《行测》第 24–30 题选项拆分
 *
 * 源 docx 把双词选项排成 2×4 表格：
 *   A、天方夜谭 | 想方设法 | B、荒谬之词 | 尽心尽力
 * 旧解析把整块当「言语材料」挂到下一题（第 26 题无选项、第 27 题 material 里是 26 的选项）。
 * 本脚本锁定修复后的拆分结果，防止回退。
 *
 * 用法：node scripts/regress-tianjin-2012-options.cjs
 */
const { PROVINCES, loadBase, pairDocs, loadDocText, buildPaperQuestions } = require('./overnight-provinces.cjs');

// answer: null = 答案册未给出该题答案，只校验「要么为空、要么是合法选项字母」
const EXPECTED = {
  24: {
    answer: 'B',
    options: ['惊心动魄 凸现', '振奋人心 表达', '震撼人心 张扬', '心神荡漾 展现'],
  },
  25: {
    answer: 'B',
    options: ['荡气回肠', '跌宕起伏', '悲欢离合', '峰回路转'],
  },
  26: {
    answer: 'C',
    options: ['天方夜谭 想方设法', '荒谬之词 尽心尽力', '无稽之谈 尽其所能', '奇谈怪论 忠心耿耿'],
  },
  27: {
    answer: 'B',
    options: ['家喻户晓 无与伦比', '享誉全球 无人能及', '世界知名 鹤立鸡群', '闻名中外 独占鳌头'],
  },
  28: {
    answer: 'A',
    options: ['奠基性 创造性 开拓性', '奠基性 深刻性 科学性', '根本性 全面性 实践性', '根本性 先进性 时代性'],
  },
  29: {
    answer: null,
    options: ['法制 漠视', '法制 敌视', '法治 漠视', '法治 敌视'],
  },
  30: {
    answer: 'C',
    options: ['起用 启事', '起用 启示', '启用 启事', '启用 启示'],
  },
};

const failures = [];

function check(cond, message) {
  if (!cond) failures.push(message);
}

(async () => {
  await loadBase();
  const cfg = PROVINCES.find(p => p.province === '天津');
  check(!!cfg, '未发现天津源目录');
  if (!cfg) throw new Error('天津 source dir not discovered');

  const pair = pairDocs(cfg).find(p => p.year === 2012);
  check(!!pair, '未找到天津 2012 题本/答案配对');
  if (!pair) throw new Error('2012 pair not found');

  const raw = await loadDocText(pair.questionFile);
  const answerText = pair.answerFile ? await loadDocText(pair.answerFile) : '';
  const built = buildPaperQuestions(raw, answerText, {
    year: 2012,
    label: pair.label,
    province: '天津',
    slug: 'tianjin',
  }, pair.questionFile, pair.answerFile || '');
  const byNum = new Map(built.questions.map(q => [q.num, q]));

  for (const [numText, expect] of Object.entries(EXPECTED)) {
    const num = Number(numText);
    const q = byNum.get(num);
    if (!q) {
      failures.push(`Q${num}: 题目缺失`);
      continue;
    }
    const got = (q.options || []).map(o => String(o.text || '').trim());
    check(
      got.length === 4 && got.every((t, i) => t === expect.options[i]),
      `Q${num}: 选项拆分不符，期望 ${JSON.stringify(expect.options)}，实际 ${JSON.stringify(got)}`
    );
    check(
      (q.options || []).map(o => o.key).join('') === 'ABCD',
      `Q${num}: 选项标记不是 A/B/C/D，实际 ${JSON.stringify((q.options || []).map(o => o.key))}`
    );
    check(!q.material, `Q${num}: 不应有 material，实际 ${JSON.stringify(String(q.material || '').slice(0, 80))}`);
    const answer = String(q.answer || '').trim();
    if (expect.answer) {
      check(answer === expect.answer, `Q${num}: 答案期望 ${expect.answer}，实际 ${JSON.stringify(answer)}`);
    } else {
      check(!answer || /^[A-D]$/.test(answer), `Q${num}: 答案应为空或 A-D，实际 ${JSON.stringify(answer)}`);
    }
  }

  // 「80、90 年代」曾被当成第 80 题，导致第 27 题选项挂到幻影题
  const q27 = byNum.get(27);
  check(!!q27 && /80、90 年代/.test(q27.stem || ''), 'Q27: 题干应包含「80、90 年代」（防止跨年代被误判成题号）');
  const stray = built.questions.filter(
    q => q.num !== 26 && (q.options || []).some(o => /天方夜谭/.test(String(o.text || '')))
  );
  check(stray.length === 0, `「天方夜谭」只应出现在 Q26，实际还出现在 ${stray.map(q => `Q${q.num}`).join('、')}`);
  const strayMaterial = built.questions.filter(q => /天方夜谭/.test(String(q.material || '')));
  check(strayMaterial.length === 0, `选项不应落进 material，实际 ${strayMaterial.map(q => `Q${q.num}`).join('、')}`);

  if (failures.length) {
    console.error(`\n天津 2012 选项回归：${failures.length} 项失败`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exitCode = 1;
    return;
  }
  console.log(`天津 2012 选项回归：全部通过（Q${Object.keys(EXPECTED).join('/Q')}）`);
})();
