#!/usr/bin/env node
/**
 * 导出「面试大厅 v1.0」20 题内容验收样例，并做采分点“可逐项判定”体检。
 *
 * 用法：
 *   node scripts/export-interview-samples.cjs            # 生成样例 + 打印体检摘要
 *   node scripts/export-interview-samples.cjs --strict   # 存在不可判定采分点时退出码 1
 *
 * 说明：体检是启发式（分层冒号 / 具体动作主体时限 / 主观形容词黑名单），
 *      只用来把可疑采分点挑出来给人看，不替代人工判断，也不会自动改题库。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BANK_PATH = path.join(ROOT, 'public/data/interview/questions.json');
const OUT_DIR = path.join(ROOT, 'guokao-reports');
const OUT_PATH = path.join(OUT_DIR, '面试样例-20题.json');
const STRICT = process.argv.includes('--strict');

const QUOTA = {
  综合分析: 4,
  组织管理: 4,
  应急应变: 4,
  人际沟通: 3,
  自我认知: 3,
  言语表达: 2,
};
const CATEGORY_ORDER = Object.keys(QUOTA);
const DIFF_RANK = { 基础: 0, 中等: 1, 拔高: 2 };

const { auditQuestion } = require('./lib/interview-audit.cjs');

function pickEvenly(list, quota) {
  const sorted = [...list].sort(
    (a, b) =>
      (DIFF_RANK[a.difficulty] ?? 9) - (DIFF_RANK[b.difficulty] ?? 9) || a.id.localeCompare(b.id)
  );
  if (quota >= sorted.length) return sorted;
  const step = sorted.length / quota;
  const picked = [];
  for (let i = 0; i < quota; i += 1) {
    const item = sorted[Math.floor(i * step + step / 2)];
    if (item && !picked.includes(item)) picked.push(item);
  }
  return picked;
}

/**
 * 采分点体检规则已抽到 scripts/lib/interview-audit.cjs，
 * 20 题样例与 100 题全量 audit 共用同一口径。
 */
function auditQuestion(question) {
  const details = question.keyPoints.map((point, index) => {
    const result = auditKeyPoint(point.text);
    return {
      index: index + 1,
      critical: point.critical === true,
      text: point.text,
      kind: result.kind,
      judgeable: result.judgeable,
      notes: result.notes,
      warnings: result.warnings,
    };
  });
  const low = details.filter((item) => !item.judgeable);
  return {
    keyPointCount: question.keyPoints.length,
    criticalCount: question.keyPoints.filter((point) => point.critical === true).length,
    actionCount: details.filter((item) => item.kind === 'action').length,
    judgmentCount: details.filter((item) => item.kind === 'judgment').length,
    judgeableCount: details.length - low.length,
    judgeableRate: details.length ? Number(((details.length - low.length) / details.length).toFixed(3)) : 0,
    lowJudgeability: low,
    details,
  };
}


function main() {
  if (!fs.existsSync(BANK_PATH)) {
    console.error(`未找到题库：${BANK_PATH}`);
    process.exit(1);
  }
  const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
  const questions = Array.isArray(bank.questions) ? bank.questions : [];
  if (questions.length === 0) {
    console.error('题库为空，无法导出样例');
    process.exit(1);
  }

  const picked = [];
  const overflow = [];
  CATEGORY_ORDER.forEach((category) => {
    const pool = questions.filter((item) => item.category === category);
    const selected = pickEvenly(pool, QUOTA[category]);
    picked.push(...selected);
    overflow.push(...pool.filter((item) => !selected.includes(item)));
  });

  const target = Object.values(QUOTA).reduce((sum, value) => sum + value, 0);
  while (picked.length < target && overflow.length > 0) {
    picked.push(overflow.shift());
  }
  picked.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      (DIFF_RANK[a.difficulty] ?? 9) - (DIFF_RANK[b.difficulty] ?? 9) ||
      a.id.localeCompare(b.id)
  );

  const audited = picked.slice(0, target).map((question) => ({
    ...question,
    audit: auditQuestion(question),
  }));

  const totalPoints = audited.reduce((sum, item) => sum + item.audit.keyPointCount, 0);
  const judgeablePoints = audited.reduce((sum, item) => sum + item.audit.judgeableCount, 0);
  const actionPoints = audited.reduce((sum, item) => sum + item.audit.actionCount, 0);
  const judgmentPoints = audited.reduce((sum, item) => sum + item.audit.judgmentCount, 0);
  const flagged = audited.flatMap((item) =>
    item.audit.lowJudgeability.map((point) => ({ id: item.id, category: item.category, ...point }))
  );

  const output = {
    meta: {
      title: '面试大厅 v1.0 · 样例 20 题（内容验收用）',
      exportedAt: new Date().toISOString(),
      sourceFile: 'public/data/interview/questions.json',
      bankVersion: bank.version,
      bankUpdatedAt: bank.updatedAt,
      bankTotal: questions.length,
      selected: audited.length,
      quota: QUOTA,
      selection:
        '按题型配额抽取；每个题型内先按难度（基础→中等→拔高）排序，再等距取点，脚本可重复运行且结果一致',
      auditRules: [
        '采分点须有“小标题：具体做法”的冒号分层',
        '冒号后的具体做法不少于 10 字',
        '不得出现“有深度/语言流畅/逻辑清晰”等纯主观评价词',
        '无动作/主体/时限的标为“判断/观点型”，按“是否明确表态 + 是否给出理由”核对',
      ],
      judgeability: {
        totalPoints,
        judgeablePoints,
        rate: totalPoints ? Number((judgeablePoints / totalPoints).toFixed(3)) : 0,
        flaggedCount: flagged.length,
        actionPoints,
        judgmentPoints,
      },
      purpose:
        '供人工抽查采分点能否逐条判定：audit 为脚本启发式体检结果，最终以人工判断为准；题库原文未做任何改动',
    },
    questions: audited,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  const txtLines = [];
  txtLines.push('面试大厅 v1.0 · 样例 20 题（内容验收）');
  txtLines.push(`导出时间：${output.meta.exportedAt}`);
  txtLines.push(
    `题库：${questions.length} 题（version ${bank.version} / updatedAt ${bank.updatedAt}）｜本文件：${audited.length} 题`
  );
  txtLines.push(
    `配额：${Object.entries(QUOTA)
      .map(([name, count]) => `${name} ${count}`)
      .join(' / ')}`
  );
  txtLines.push(
    `采分点体检：${judgeablePoints}/${totalPoints} 可判定（${(output.meta.judgeability.rate * 100).toFixed(1)}%）｜行动型 ${actionPoints} / 判断型 ${judgmentPoints}｜需复核 ${flagged.length} 条`
  );
  txtLines.push('体检规则：' + output.meta.auditRules.join('；'));
  txtLines.push('说明：audit 为脚本启发式结果，最终以人工判断为准；题库原文未改动。');

  audited.forEach((item, index) => {
    txtLines.push('');
    txtLines.push(
      `【${index + 1}】${item.id}｜${item.category}·${item.subType}｜${item.difficulty}｜限时 ${item.answerSeconds} 秒`
    );
    if (item.scene) txtLines.push(`场景：${item.scene}`);
    txtLines.push(`题干：${item.title}`);
    txtLines.push(`设问：${item.task}`);
    txtLines.push(
      `采分点（可判定 ${item.audit.judgeableCount}/${item.audit.keyPointCount}｜行动 ${item.audit.actionCount} / 判断 ${item.audit.judgmentCount}）：`
    );
    item.audit.details.forEach((point) => {
      const mark = point.critical ? '[主线] ' : '[补充] ';
      const warn = point.judgeable ? '' : `  ⚠ ${point.notes.join('；')}`;
      const kind = point.kind === 'action' ? '' : '（判断型）';
      txtLines.push(`  ${point.index}. ${mark}${point.text}${kind}${warn}`);
    });
    txtLines.push('常见扣分点：');
    (item.pitfalls || []).forEach((pitfall, pitfallIndex) => {
      txtLines.push(`  ${pitfallIndex + 1}) ${pitfall}`);
    });
    txtLines.push('参考提纲：');
    (item.referenceOutline || []).forEach((outline, outlineIndex) => {
      txtLines.push(`  ${outlineIndex + 1}) ${outline}`);
    });
    txtLines.push(`来源：${item.source}｜标签：${(item.tags || []).join('、')}`);
  });

  const OUT_TXT = OUT_PATH.replace(/\.json$/, '.txt');
  fs.writeFileSync(OUT_TXT, `\uFEFF${txtLines.join('\r\n')}\r\n`, 'utf8');

  console.log(`题库 ${questions.length} 题 → 导出 ${audited.length} 题`);
  console.log(`输出：${path.relative(ROOT, OUT_PATH)}`);
  console.log(`纯文本：${path.relative(ROOT, OUT_TXT)}`);
  console.log(
    `采分点 ${totalPoints} 条，可判定 ${judgeablePoints} 条（${(output.meta.judgeability.rate * 100).toFixed(1)}%）`
  );
  if (flagged.length > 0) {
    console.log(`\n需人工复核 ${flagged.length} 条：`);
    flagged.forEach((item) => {
      console.log(`- ${item.id}〔${item.category}〕第 ${item.index} 条：${item.text}`);
      console.log(`  原因：${item.notes.join('；')}`);
    });
  } else {
    console.log('\n未发现不可判定的采分点。');
  }

  if (STRICT && flagged.length > 0) process.exit(1);
}

main();

