#!/usr/bin/env node
/**
 * 面试题库全量 audit（默认 100 题）
 *
 * 与 20 题样例验收共用同一套规则：
 *  - 结构校验：scripts/verify-interview-questions.cjs#validateInterviewBank
 *  - 采分点可判定性：scripts/lib/interview-audit.cjs#auditQuestion
 *
 * 产物（guokao-reports/）：
 *  - 面试题库-全量audit.json：逐题完整结果（含采分点判定明细）
 *  - 面试题库-全量audit.md：人读报告（总览 / 分布 / 问题清单）
 *  - 面试题库-可判定性明细.csv：逐条采分点，Excel 可直接打开
 *
 * 用法：
 *   node scripts/audit-interview-bank.cjs
 *   node scripts/audit-interview-bank.cjs --strict
 *   node scripts/audit-interview-bank.cjs --file <path>
 *
 * 原则：只读题库，不修改任何题目原文。
 */
const fs = require('fs');
const path = require('path');
const { validateInterviewBank, CATEGORIES, DIFFICULTIES } = require('./verify-interview-questions.cjs');
const { auditQuestion } = require('./lib/interview-audit.cjs');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(ROOT, 'public', 'data', 'interview', 'questions.json');
const OUT_DIR = path.join(ROOT, 'guokao-reports');
const OUT_JSON = path.join(OUT_DIR, '面试题库-全量audit.json');
const OUT_MD = path.join(OUT_DIR, '面试题库-全量audit.md');
const OUT_CSV = path.join(OUT_DIR, '面试题库-可判定性明细.csv');

const PREFIX_CATEGORY = {
  zh: '综合分析',
  zz: '组织管理',
  yj: '应急应变',
  rj: '人际沟通',
  zw: '自我认知',
  yy: '言语表达',
};
const CATEGORY_ORDER = CATEGORIES;
const DIFF_ORDER = DIFFICULTIES;
const STRICT = process.argv.includes('--strict');

function parseArgs(argv) {
  const idx = argv.indexOf('--file');
  if (idx >= 0) return path.resolve(argv[idx + 1] || DEFAULT_FILE);
  return DEFAULT_FILE;
}

function groupBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function normalizeTitle(title) {
  return String(title || '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[“”"'‘’（）()《》【】\[\]?？!！。，,、；;：:]/g, '');
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function main() {
  const file = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(file)) {
    console.error(`[FATAL] 题库文件不存在：${file}`);
    process.exit(1);
  }

  let bank;
  try {
    bank = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[FATAL] JSON 解析失败：${err.message}`);
    process.exit(1);
  }

  const { errors, warnings, stats } = validateInterviewBank(bank);
  if (!stats) {
    console.error(`[FATAL] ${errors.join('；')}`);
    process.exit(1);
  }

  const questions = bank.questions;
  const audited = questions.map((question) => ({ ...question, audit: auditQuestion(question) }));

  const totalPoints = audited.reduce((sum, item) => sum + item.audit.keyPointCount, 0);
  const judgeablePoints = audited.reduce((sum, item) => sum + item.audit.judgeableCount, 0);
  const actionPoints = audited.reduce((sum, item) => sum + item.audit.actionCount, 0);
  const judgmentPoints = audited.reduce((sum, item) => sum + item.audit.judgmentCount, 0);
  const criticalPoints = audited.reduce((sum, item) => sum + item.audit.criticalCount, 0);
  const flagged = audited.flatMap((item) =>
    item.audit.lowJudgeability.map((point) => ({
      id: item.id,
      category: item.category,
      difficulty: item.difficulty,
      ...point,
    }))
  );

  /** 题号前缀必须与题型一致（validator 只校验格式，不校验语义） */
  audited.forEach((question) => {
    const match = String(question.id || '').match(/^si-(zh|zz|yj|rj|zw|yy)-(\d{3})$/);
    if (match && PREFIX_CATEGORY[match[1]] !== question.category) {
      errors.push(
        `${question.id} 题号前缀对应「${PREFIX_CATEGORY[match[1]]}」，实际题型为「${question.category}」`
      );
    }
  });

  /** 每个前缀的序号是否连续（缺号只提示，不判失败） */
  const sequenceNotes = [];
  groupBy(audited, (item) => String(item.id || '').slice(0, 6)).forEach((list, prefix) => {
    const numbers = list
      .map((item) => Number(String(item.id).slice(-3)))
      .filter((num) => Number.isFinite(num))
      .sort((a, b) => a - b);
    const max = numbers[numbers.length - 1] || 0;
    const missing = [];
    for (let num = 1; num <= max; num += 1) if (!numbers.includes(num)) missing.push(num);
    if (missing.length) {
      sequenceNotes.push(`${prefix} 缺号：${missing.map((n) => String(n).padStart(3, '0')).join('、')}`);
      warnings.push(`题号不连续（${prefix}）`);
    }
  });

  /** 完全重复 / 去标点后重复的题干 */
  const duplicateTitles = [];
  groupBy(audited, (item) => String(item.title || '').trim()).forEach((list, title) => {
    if (list.length > 1) {
      duplicateTitles.push({ kind: 'exact', title, ids: list.map((item) => item.id) });
    }
  });
  groupBy(audited, (item) => normalizeTitle(item.title)).forEach((list, normalized) => {
    if (
      list.length > 1 &&
      !duplicateTitles.some((group) => group.ids.join() === list.map((item) => item.id).join())
    ) {
      duplicateTitles.push({ kind: 'normalized', title: list[0].title, ids: list.map((item) => item.id) });
    }
  });
  duplicateTitles.forEach((group) => warnings.push(`题干重复（${group.ids.join(' / ')}）`));

  /** 同一题内重复的采分点 */
  const duplicatePointsInQuestion = [];
  audited.forEach((question) => {
    groupBy(question.keyPoints, (point) => String(point.text || '').trim()).forEach((list, text) => {
      if (list.length > 1) {
        duplicatePointsInQuestion.push({ id: question.id, text, count: list.length });
        warnings.push(`${question.id} 同一题内采分点重复：${text}`);
      }
    });
  });

  /** 跨题完全重复的采分点（只提示，可能是通用表述） */
  const pointGroups = [];
  audited.forEach((question) => {
    question.keyPoints.forEach((point) => {
      pointGroups.push({ id: question.id, text: String(point.text || '').trim() });
    });
  });
  const crossQuestionDuplicates = [];
  groupBy(pointGroups, (item) => item.text).forEach((list, text) => {
    const ids = [...new Set(list.map((item) => item.id))];
    if (ids.length > 1) crossQuestionDuplicates.push({ text, ids, count: list.length });
  });

  /** 题干/设问/采分点的首尾空格（不影响判定，但会污染展示） */
  const whitespaceIssues = [];
  audited.forEach((question) => {
    if (String(question.title || '') !== String(question.title || '').trim()) {
      whitespaceIssues.push(`${question.id} title 首尾有空白`);
    }
    if (String(question.task || '') !== String(question.task || '').trim()) {
      whitespaceIssues.push(`${question.id} task 首尾有空白`);
    }
    question.keyPoints.forEach((point, index) => {
      if (String(point.text || '') !== String(point.text || '').trim()) {
        whitespaceIssues.push(`${question.id} keyPoints[${index + 1}] 首尾有空白`);
      }
    });
  });
  whitespaceIssues.forEach((note) => warnings.push(note));

  const categoryStats = CATEGORY_ORDER.map((category) => {
    const list = audited.filter((item) => item.category === category);
    const points = list.reduce((sum, item) => sum + item.audit.keyPointCount, 0);
    const judgeable = list.reduce((sum, item) => sum + item.audit.judgeableCount, 0);
    return {
      category,
      questions: list.length,
      points,
      judgeable,
      rate: points ? Number((judgeable / points).toFixed(3)) : 0,
      critical: list.reduce((sum, item) => sum + item.audit.criticalCount, 0),
      action: list.reduce((sum, item) => sum + item.audit.actionCount, 0),
      judgment: list.reduce((sum, item) => sum + item.audit.judgmentCount, 0),
      flagged: list.reduce((sum, item) => sum + item.audit.lowJudgeability.length, 0),
    };
  });

  const difficultyStats = DIFF_ORDER.map((difficulty) => {
    const list = audited.filter((item) => item.difficulty === difficulty);
    const points = list.reduce((sum, item) => sum + item.audit.keyPointCount, 0);
    const judgeable = list.reduce((sum, item) => sum + item.audit.judgeableCount, 0);
    return {
      difficulty,
      questions: list.length,
      points,
      judgeable,
      rate: points ? Number((judgeable / points).toFixed(3)) : 0,
      flagged: list.reduce((sum, item) => sum + item.audit.lowJudgeability.length, 0),
    };
  });

  const subTypeStats = [...groupBy(audited, (item) => item.subType).entries()]
    .map(([subType, list]) => ({ subType, count: list.length }))
    .sort((a, b) => b.count - a.count || a.subType.localeCompare(b.subType, 'zh'));

  const lowestCritical = audited
    .filter((item) => item.audit.criticalCount < 2)
    .map((item) => ({ id: item.id, critical: item.audit.criticalCount, title: item.title }));
  if (lowestCritical.length) {
    warnings.push(`${lowestCritical.length} 题的主线（critical）采分点少于 2 条，扣分点覆盖可能偏弱`);
  }

  const status = errors.length > 0 ? 'FAIL' : flagged.length > 0 || warnings.length > 0 ? 'WARN' : 'PASS';
  const generatedAt = new Date().toISOString();
  const rate = totalPoints ? Number((judgeablePoints / totalPoints).toFixed(3)) : 0;
  const sceneCoverage = stats.total ? Number((stats.withScene / stats.total).toFixed(3)) : 0;

  const report = {
    meta: {
      title: '面试大厅 v1.0 · 100 题全量 audit',
      generatedAt,
      sourceFile: path.relative(ROOT, file).replace(/\\/g, '/'),
      bankVersion: bank.version,
      bankUpdatedAt: bank.updatedAt,
      totalQuestions: stats.total,
      rules: [
        '结构校验：id / 题型 / 难度 / 标题与设问长度 / 计时 / 采分点 5–6 条 / 扣分点 2–3 条 / 提纲 3–6 条',
        '采分点须有“小标题：具体做法”的冒号分层',
        '冒号后的具体做法不少于 10 字',
        '不得出现“有深度/语言流畅/逻辑清晰”等纯主观评价词',
        '无动作/主体/时限的标为“判断/观点型”，按“是否明确表态 + 是否给出理由”核对',
      ],
      purpose:
        '全量确认 100 题的字段结构与采分点可判定性；audit 为脚本启发式结果，最终以人工判断为准；脚本只读，不修改题库原文',
    },
    summary: {
      status,
      totalQuestions: stats.total,
      uniqueIds: stats.uniqueIds,
      sceneCoverage,
      totalPoints,
      judgeablePoints,
      judgeableRate: rate,
      flaggedCount: flagged.length,
      criticalPoints,
      actionPoints,
      judgmentPoints,
      errors: errors.length,
      warnings: warnings.length,
      duplicateTitleGroups: duplicateTitles.length,
      duplicatePointInQuestion: duplicatePointsInQuestion.length,
      duplicatePointAcrossQuestions: crossQuestionDuplicates.length,
    },
    categoryStats,
    difficultyStats,
    subTypeStats,
    issues: {
      errors,
      warnings,
      sequenceNotes,
      duplicateTitles,
      duplicatePointsInQuestion,
      duplicatePointsAcrossQuestions: crossQuestionDuplicates,
      whitespaceIssues,
      lowestCritical,
    },
    questions: audited,
  };

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');

  const csvLines = ['id,category,difficulty,index,critical,kind,judgeable,notes,text'];
  audited.forEach((question) => {
    question.audit.details.forEach((point) => {
      csvLines.push(
        [
          question.id,
          question.category,
          question.difficulty,
          point.index,
          point.critical ? 'true' : 'false',
          point.kind,
          point.judgeable ? 'true' : 'false',
          point.notes.join('；'),
          point.text,
        ]
          .map(csvEscape)
          .join(',')
      );
    });
  });
  fs.writeFileSync(OUT_CSV, `\uFEFF${csvLines.join('\r\n')}\r\n`, 'utf8');

  const md = [];
  const statusText = status === 'PASS' ? '✅ 通过' : status === 'WARN' ? '⚠️ 通过（有告警）' : '❌ 未通过';
  md.push('# 面试题库 · 100 题全量 audit');
  md.push('');
  md.push(`- **结论**：${statusText}`);
  md.push(`- **生成时间**：${generatedAt}`);
  md.push(
    `- **题库文件**：\`${report.meta.sourceFile}\`（version ${bank.version} / updatedAt ${bank.updatedAt}）`
  );
  md.push('- **复跑**：`node scripts/audit-interview-bank.cjs`（严格模式加 `--strict`）');
  md.push('');
  md.push(
    '> audit 为脚本启发式体检，只负责把“无法逐条判定”的采分点挑出来；最终以人工判断为准。audit 脚本只读，题库的任何人工修订需单独记录并复跑。'
  );
  md.push('');
  md.push('## 1. 总览');
  md.push('');
  md.push('| 指标 | 数值 |');
  md.push('| --- | ---: |');
  md.push(`| 题目总数 | ${stats.total} |`);
  md.push(`| 唯一 id | ${stats.uniqueIds} |`);
  md.push(`| 含考场设定 scene | ${stats.withScene}（${pct(sceneCoverage)}） |`);
  md.push(`| 采分点总数 | ${totalPoints} |`);
  md.push(`| 可逐条判定 | ${judgeablePoints}（${pct(rate)}） |`);
  md.push(`| 需人工复核 | ${flagged.length} |`);
  md.push(`| 主线 critical 采分点 | ${criticalPoints} |`);
  md.push(`| 行动型 / 判断型 | ${actionPoints} / ${judgmentPoints} |`);
  md.push(`| 结构校验 ERROR / WARN | ${errors.length} / ${warnings.length} |`);
  md.push('');
  md.push('## 2. 题型 × 难度分布');
  md.push('');
  md.push('| 题型 | 题量 | 采分点 | 可判定 | 可判定率 | 复核 |');
  md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  categoryStats.forEach((row) => {
    md.push(
      `| ${row.category} | ${row.questions} | ${row.points} | ${row.judgeable} | ${pct(row.rate)} | ${row.flagged} |`
    );
  });
  md.push('');
  md.push('| 难度 | 题量 | 采分点 | 可判定 | 可判定率 | 复核 |');
  md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  difficultyStats.forEach((row) => {
    md.push(
      `| ${row.difficulty} | ${row.questions} | ${row.points} | ${row.judgeable} | ${pct(row.rate)} | ${row.flagged} |`
    );
  });
  md.push('');
  md.push('### 子题型分布');
  md.push('');
  md.push('| 子题型 | 题量 |');
  md.push('| --- | ---: |');
  subTypeStats.forEach((row) => md.push(`| ${row.subType} | ${row.count} |`));
  md.push('');
  md.push('## 3. 需人工复核的采分点');
  md.push('');
  if (flagged.length === 0) {
    md.push('未发现不可判定的采分点。');
  } else {
    md.push('| 题号 | 题型 | 序号 | 主线 | 采分点 | 原因 |');
    md.push('| --- | --- | ---: | :---: | --- | --- |');
    flagged.forEach((point) => {
      md.push(
        `| ${point.id} | ${point.category} | ${point.index} | ${
          point.critical ? '是' : ''
        } | ${point.text} | ${point.notes.join('；')} |`
      );
    });
  }
  md.push('');

  md.push('## 4. 结构与重复项检查');
  md.push('');
  md.push(`- 题号连续性：${sequenceNotes.length === 0 ? '全部连续' : sequenceNotes.join('；')}`);
  md.push(
    `- 题干重复：${
      duplicateTitles.length === 0 ? '无' : duplicateTitles.map((item) => item.ids.join(' / ')).join('；')
    }`
  );
  md.push(
    `- 同题内采分点重复：${
      duplicatePointsInQuestion.length === 0
        ? '无'
        : duplicatePointsInQuestion.map((item) => `${item.id}「${item.text}」×${item.count}`).join('；')
    }`
  );
  md.push(
    `- 跨题采分点完全重复：${
      crossQuestionDuplicates.length === 0 ? '无' : `${crossQuestionDuplicates.length} 组（见 JSON issues）`
    }`
  );
  md.push(`- 首尾空白：${whitespaceIssues.length === 0 ? '无' : whitespaceIssues.join('；')}`);
  md.push(
    `- 主线少于 2 条：${lowestCritical.length === 0 ? '无' : lowestCritical.map((item) => item.id).join('、')}`
  );
  md.push('');
  md.push('### 结构校验告警');
  md.push('');
  if (warnings.length === 0) {
    md.push('无。');
  } else {
    warnings.forEach((warning) => md.push(`- ${warning}`));
  }
  md.push('');
  md.push('### 结构校验错误');
  md.push('');
  if (errors.length === 0) {
    md.push('无。');
  } else {
    errors.forEach((error) => md.push(`- ${error}`));
  }
  md.push('');
  md.push('## 5. 产物');
  md.push('');
  md.push('- 逐题完整结果：`guokao-reports/面试题库-全量audit.json`');
  md.push('- 人读报告：`guokao-reports/面试题库-全量audit.md`');
  md.push('- 逐条采分点明细：`guokao-reports/面试题库-可判定性明细.csv`');
  md.push('');
  fs.writeFileSync(OUT_MD, `${md.join('\r\n')}\r\n`, 'utf8');

  console.log('=== 面试题库全量 audit ===');
  console.log(`文件：${file}`);
  console.log(
    `题量 ${stats.total}｜采分点 ${totalPoints}｜可判定 ${judgeablePoints}（${pct(
      rate
    )}）｜需复核 ${flagged.length}`
  );
  console.log('题型分布：' + CATEGORY_ORDER.map((c) => `${c} ${stats.byCategory[c] || 0}`).join(' | '));
  console.log('难度分布：' + DIFF_ORDER.map((d) => `${d} ${stats.byDifficulty[d] || 0}`).join(' | '));
  console.log(`结构校验：ERROR ${errors.length} / WARN ${warnings.length}`);
  console.log(`结论：${status}`);
  console.log(`输出：${path.relative(ROOT, OUT_JSON)}`);
  console.log(`      ${path.relative(ROOT, OUT_MD)}`);
  console.log(`      ${path.relative(ROOT, OUT_CSV)}`);

  if (errors.length > 0) process.exit(1);
  if (STRICT && (flagged.length > 0 || warnings.length > 0)) process.exit(1);
}

main();
