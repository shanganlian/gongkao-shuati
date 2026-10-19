#!/usr/bin/env node
/**
 * 随机抽查 questions-v2 题目（完整字段）
 *
 * 用法：
 *   node scripts/inspect-v2.js
 *   node scripts/inspect-v2.js --seed=20261018
 *   node scripts/inspect-v2.js --dir=public/data/questions-v2 --per-module=4 --shenlun=2
 *
 * 输出：常识/言语/数量/判断/资料各 4 道 + 申论 2 道，含题干/选项/答案/解析/材料/source。
 * 答案为空时标注「（无官方答案）」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = parseArgs(process.argv.slice(2));
const DIR = path.resolve(ROOT, args.dir || path.join('public', 'data', 'questions-v2'));
const PER_MODULE = Number(args['per-module'] || 4);
const SHENLUN_COUNT = Number(args.shenlun ?? 2);
const SEED = Number(args.seed || Date.now() % 1e9);

const MODULE_ORDER = [
  ['changshi', '常识判断'],
  ['yanyu', '言语理解'],
  ['shuliang', '数量关系'],
  ['panduan', '判断推理'],
  ['ziliao', '资料分析'],
  ['shenlun', '申论'],
];
const LINE = '='.repeat(78);

function parseArgs(argv) {
  const out = {};
  for (const item of argv) {
    const m = item.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
    else if (item.startsWith('--')) out[item.slice(2)] = true;
  }
  return out;
}

// mulberry32：同一 seed 可复现同一次抽取
function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadAll(dir) {
  const indexPath = path.join(dir, 'index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`找不到索引文件：${indexPath}`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const all = [];
  for (const files of Object.values(index)) {
    for (const file of files) {
      all.push(...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
    }
  }
  return all;
}

function printQuestion(question, seq, total) {
  const moduleLabel = (MODULE_ORDER.find(([key]) => key === question.module) || [])[1] || question.module;
  const hasAnswer = Boolean((question.answer || '').trim());

  console.log(LINE);
  console.log(`[${seq}/${total}] ${question.id}`);
  console.log(`模块: ${moduleLabel}(${question.module}) | 分类: ${question.category || '-'} | 难度: ${question.difficulty || '-'} | 图片题: ${question.isImageQuestion ? '是' : '否'}`);
  console.log(`来源: ${question.source || '（无来源）'}`);
  console.log('-'.repeat(78));

  console.log('【题干】');
  console.log((question.stem || '').trim() || '（空）');

  console.log('\n【选项】');
  const options = question.options || [];
  if (!options.length) {
    console.log('（无选项）');
  } else {
    for (const option of options) {
      const text = (option.text || '').trim();
      console.log(`${option.key}. ${text || '（图片选项）'}`);
    }
  }

  console.log('\n【答案】');
  console.log(hasAnswer ? question.answer.trim() : '（无官方答案）');

  console.log('\n【解析】');
  console.log((question.explanation || '').trim() || '（无解析）');

  console.log('\n【材料】');
  console.log((question.material || '').trim() || '（无材料）');

  console.log('\n【source】');
  console.log(question.source || '（无来源）');
  console.log();
}

try {
  const all = loadAll(DIR);
  const rng = createRng(SEED);
  const selected = [];

  for (const [module, label] of MODULE_ORDER) {
    const pool = all.filter(q => q.module === module);
    const want = module === 'shenlun' ? SHENLUN_COUNT : PER_MODULE;
    const picked = shuffle(pool, rng).slice(0, want);
    if (picked.length < want) {
      console.log(`！${label} 仅有 ${picked.length} 道（请求 ${want} 道）`);
    }
    selected.push(...picked);
  }

  console.log(`题库目录: ${DIR}`);
  console.log(`全库 ${all.length} 道 | 本次抽查 ${selected.length} 道 | seed=${SEED}（复现：--seed=${SEED}）`);
  console.log();

  selected.forEach((question, i) => printQuestion(question, i + 1, selected.length));

  const noAnswer = selected.filter(q => !(q.answer || '').trim());
  console.log(LINE);
  console.log(`抽查完成：${selected.length} 道，其中无官方答案 ${noAnswer.length} 道。`);
  if (noAnswer.length) {
    console.log(`无官方答案：${noAnswer.map(q => q.id).join('、')}`);
  }
  console.log('提示：Windows 终端若显示乱码，先执行 chcp 65001。');
} catch (error) {
  console.error(`抽查失败：${error.message}`);
  process.exitCode = 1;
}
