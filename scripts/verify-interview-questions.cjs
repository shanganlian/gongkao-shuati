#!/usr/bin/env node
/**
 * 面试题库校验（面试大厅 v1.0）
 * 用法：node scripts/verify-interview-questions.cjs [--file <path>]
 * 退出码：0 通过 / 1 存在问题
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(ROOT, 'public', 'data', 'interview', 'questions.json');

const CATEGORIES = ['综合分析', '组织管理', '应急应变', '人际沟通', '自我认知', '言语表达'];
const DIFFICULTIES = ['基础', '中等', '拔高'];
const ID_RE = /^si-(zh|zz|yj|rj|zw|yy)-\d{3}$/;
const SOURCE = '结构化面试经典题·改编';

function parseArgs(argv) {
  const idx = argv.indexOf('--file');
  if (idx >= 0) return path.resolve(argv[idx + 1] || DEFAULT_FILE);
  return DEFAULT_FILE;
}

function strLen(s) {
  return Array.from(String(s || '')).length;
}

/**
 * 校验一份面试题库对象，返回错误/警告/统计。
 * 供 CLI 与全量 audit 脚本共用，保证两处口径一致。
 */
function validateInterviewBank(bank) {
  const errors = [];
  const warnings = [];

  if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
    return { errors: ['题库根节点必须是对象'], warnings, stats: null };
  }

  if (!Number.isInteger(bank.version)) errors.push('顶层缺少 version(number)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bank.updatedAt || '')) errors.push('顶层 updatedAt 需为 YYYY-MM-DD');
  if (!Array.isArray(bank.categories) || bank.categories.length !== CATEGORIES.length) {
    errors.push('顶层 categories 必须为 6 个题型');
  } else if (CATEGORIES.some((c) => !bank.categories.includes(c))) {
    errors.push('顶层 categories 与约定不一致');
  }
  if (!Array.isArray(bank.questions)) {
    return { errors: [...errors, 'questions 不是数组'], warnings, stats: null };
  }

  const seen = new Set();
  const byCategory = {};
  const byDifficulty = {};
  let withScene = 0;

  bank.questions.forEach((q, i) => {
    const at = `#${i + 1}(${q && q.id ? q.id : '无 id'})`;
    if (!q || typeof q !== 'object') {
      errors.push(`${at} 不是对象`);
      return;
    }
    if (!ID_RE.test(q.id || '')) errors.push(`${at} id 不符合 si-<题型码>-<3 位序号>`);
    if (seen.has(q.id)) errors.push(`${at} id 重复`);
    seen.add(q.id);

    if (!CATEGORIES.includes(q.category)) errors.push(`${at} category 非法：${q.category}`);
    if (!strLen(q.subType)) errors.push(`${at} 缺少 subType`);
    else if (strLen(q.subType) > 10) errors.push(`${at} subType 超过 10 字`);
    if (!DIFFICULTIES.includes(q.difficulty)) errors.push(`${at} difficulty 非法：${q.difficulty}`);

    const tLen = strLen(q.title);
    if (tLen < 15 || tLen > 160) errors.push(`${at} title 长度 ${tLen}，应在 15–160`);
    const kLen = strLen(q.task);
    if (kLen < 8 || kLen > 120) errors.push(`${at} task 长度 ${kLen}，应在 8–120`);

    if (!(q.thinkingSeconds >= 30 && q.thinkingSeconds <= 180)) errors.push(`${at} thinkingSeconds 越界`);
    if (!(q.answerSeconds >= 90 && q.answerSeconds <= 300)) errors.push(`${at} answerSeconds 越界`);

    if (!Array.isArray(q.keyPoints) || q.keyPoints.length < 5 || q.keyPoints.length > 6) {
      errors.push(`${at} keyPoints 必须 5–6 条，当前 ${(q.keyPoints || []).length}`);
    } else {
      q.keyPoints.forEach((p, j) => {
        if (!p || typeof p.text !== 'string') return errors.push(`${at} keyPoints[${j}] 缺 text`);
        const n = strLen(p.text);
        if (n < 8 || n > 80) errors.push(`${at} keyPoints[${j}] 长度 ${n}，应在 8–80`);
        if (p.critical !== undefined && typeof p.critical !== 'boolean') {
          errors.push(`${at} keyPoints[${j}] critical 必须是 boolean`);
        }
      });
      if (!q.keyPoints.some((p) => p.critical === true)) {
        warnings.push(`${at} 没有标记 critical 采分点（报告无法点“主线必补”）`);
      }
    }

    if (!Array.isArray(q.pitfalls) || q.pitfalls.length < 2 || q.pitfalls.length > 3) {
      errors.push(`${at} pitfalls 必须 2–3 条，当前 ${(q.pitfalls || []).length}`);
    }

    if (!Array.isArray(q.referenceOutline) || q.referenceOutline.length < 3 || q.referenceOutline.length > 6) {
      errors.push(`${at} referenceOutline 必须是 3–6 条数组，当前 ${(q.referenceOutline || []).length}`);
    }

    if (!Array.isArray(q.tags) || q.tags.length < 1 || q.tags.length > 5) {
      errors.push(`${at} tags 必须 1–5 个`);
    }

    if (q.source !== SOURCE) errors.push(`${at} source 必须为“${SOURCE}”`);
    if (q.scene) withScene += 1;

    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
  });

  const total = bank.questions.length;
  if (total !== 100) warnings.push(`题量 ${total}，v1.0 目标为 100`);
  CATEGORIES.forEach((c) => {
    if (!byCategory[c]) errors.push(`题型「${c}」没有题目`);
  });

  return {
    errors,
    warnings,
    stats: {
      total,
      uniqueIds: seen.size,
      withScene,
      byCategory,
      byDifficulty,
    },
  };
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
  } catch (e) {
    console.error(`[FATAL] JSON 解析失败：${e.message}`);
    process.exit(1);
  }

  const { errors, warnings, stats } = validateInterviewBank(bank);
  if (!stats) {
    console.error(`[FATAL] ${errors.join('；')}`);
    process.exit(1);
  }

  console.log('=== 面试题库校验 ===');
  console.log(`文件：${file}`);
  console.log(
    `题量：${stats.total}　唯一 id：${stats.uniqueIds}　含 scene：${stats.withScene}（${
      stats.total ? Math.round((stats.withScene / stats.total) * 100) : 0
    }%）`
  );
  console.log('题型分布：' + CATEGORIES.map((c) => `${c} ${stats.byCategory[c] || 0}`).join(' | '));
  console.log('难度分布：' + DIFFICULTIES.map((d) => `${d} ${stats.byDifficulty[d] || 0}`).join(' | '));

  if (warnings.length) {
    console.log(`\n[WARN] ${warnings.length} 条`);
    warnings.forEach((w) => console.log('  - ' + w));
  }
  if (errors.length) {
    console.log(`\n[ERROR] ${errors.length} 条`);
    errors.slice(0, 60).forEach((e) => console.log('  - ' + e));
    if (errors.length > 60) console.log(`  ...另有 ${errors.length - 60} 条`);
    console.log('\n校验未通过');
    process.exit(1);
  }
  console.log('\n校验通过');
}

if (require.main === module) {
  main();
}

module.exports = { validateInterviewBank, CATEGORIES, DIFFICULTIES, ID_RE, SOURCE };
