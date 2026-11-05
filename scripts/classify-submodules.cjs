#!/usr/bin/env node
/**
 * classify-submodules.cjs —— 题库二级分类（子模块）批量标注
 *
 * 用法：
 *   node scripts/classify-submodules.cjs --province 北京 --module changshi
 *   node scripts/classify-submodules.cjs --province 北京 --module changshi --apply --review-sample 50
 *   node scripts/classify-submodules.cjs --province all --module all --limit 20
 *   node scripts/classify-submodules.cjs --province 北京 --module changshi --apply --force
 *
 * 默认只调用模型并出报告，不写题库；加 --apply 才把 subModule / subModule_confidence 写回分片。
 * 断点缓存在 guokao-reports/.cache/，同一 prompt 版本 + 模型下重跑不会重复计费。
 *
 * 字段口径：
 *   subModule              二级分类名，必须来自 shared/sub-modules.json
 *   subModule_confidence   high | low，low 表示模型拿不准、进入人工复核清单
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const SOURCE_NATIONAL_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2');
const SOURCE_PROVINCIAL_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const REPORT_DIR = path.join(ROOT, 'guokao-reports');
const CACHE_DIR = path.join(REPORT_DIR, '.cache');
const SUB_MODULE_MAP = require(path.join(ROOT, 'shared', 'sub-modules.json'));
const PROMPT_VERSION = 'submodule-v2';
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const ARGV = process.argv.slice(2);

const MODULE_LABELS = {
  changshi: '常识判断',
  yanyu: '言语理解',
  panduan: '判断推理',
  shuliang: '数量关系',
  ziliao: '资料分析'
};

const SUB_MODULE_DESC = {
  法律: '宪法、行政法、刑法、民法、诉讼法、法理学、公务员法等法律规范、具体法条与法律适用',
  科技: '物理、化学、生物、医学、信息技术、能源、航天、军事科技、科技史等科学原理与技术',
  人文历史: '中国古代史、近现代史、世界史、文学、文化、哲学、艺术、成语典故、传统节日等',
  地理国情: '自然地理、中国地理、世界地理、行政区划、地形气候、资源环境、国土国情等',
  政治时政: '马克思主义哲学、政治经济学、毛泽东思想、中国特色社会主义理论、党史党建、政府职能与行政管理、公共服务、时事政策、国际关系等',
  经济管理: '微观/宏观经济学、金融、财政、税收、市场机制、企业经营管理等经济与管理知识',
  生活常识: '日常生活、健康养生、食品安全、安全急救、环保、交通、体育、家庭理财等',
  逻辑填空: '选词填空、成语/实词/虚词辨析、语境填空',
  片段阅读: '主旨概括、意图判断、细节理解、态度观点、标题填入等片段型阅读',
  语句表达: '语句排序、语句衔接、病句辨析、歧义句、修辞表达',
  篇章阅读: '给出一整篇材料后连续设问的篇章型阅读',
  图形推理: '图形规律、位置/样式/数量/属性/空间重构等图形题',
  定义判断: '给出定义后判断选项是否符合定义',
  类比推理: '词项之间的逻辑关系类比',
  逻辑判断: '翻译推理、真假推理、削弱加强、前提假设、日常结论等',
  行程工程: '行程问题、工程问题、流水行船、火车过桥等',
  经济利润: '利润、成本、折扣、浓度、分段计费等经济类计算',
  排列概率: '排列组合、概率、抽屉原理、容斥原理等计数问题',
  几何: '平面几何、立体几何、几何构造、坐标与图形计算',
  计算杂题: '数列、最值、平均数、余数、年龄、日期、其他无明确归类的计算题',
  文字材料: '材料以纯文字/公文/新闻叙述呈现',
  表格材料: '材料以统计表格呈现',
  图形材料: '材料以柱状图、折线图、饼图等图形呈现',
  综合材料: '材料同时包含文字与表格/图形，或多种呈现形式混排'
};

const SYNONYMS = {
  法律常识: '法律', 法律知识: '法律', 宪法: '法律', 行政法: '法律', 民法: '法律', 刑法: '法律', 法理学: '法律',
  科技常识: '科技', 科学技术: '科技', 物理: '科技', 化学: '科技', 生物: '科技', 医学: '科技', 科技史: '科技',
  历史: '人文历史', 历史人文: '人文历史', 人文: '人文历史', 文学: '人文历史', 文化: '人文历史', 艺术: '人文历史',
  地理: '地理国情', 国情: '地理国情', 自然地理: '地理国情', 中国地理: '地理国情',
  政治: '政治时政', 时政: '政治时政', 政治常识: '政治时政', 马克思主义: '政治时政', 党史: '政治时政',
  经济: '经济管理', 经济常识: '经济管理', 金融: '经济管理', 财税: '经济管理', 管理: '经济管理',
  生活: '生活常识', 生活知识: '生活常识', 健康: '生活常识', 安全: '生活常识',
  选词填空: '逻辑填空', 成语填空: '逻辑填空', 阅读理解: '片段阅读', 主旨概括: '片段阅读',
  语句排序: '语句表达', 语句衔接: '语句表达', 病句辨析: '语句表达',
  图形: '图形推理', 定义: '定义判断', 类比: '类比推理', 逻辑: '逻辑判断',
  行程问题: '行程工程', 工程问题: '行程工程', 行程: '行程工程', 工程: '行程工程',
  利润: '经济利润', 浓度: '经济利润', 排列组合: '排列概率', 概率: '排列概率',
  几何问题: '几何', 计算: '计算杂题', 杂题: '计算杂题',
  文字: '文字材料', 表格: '表格材料', 综合: '综合材料'
};

function hasFlag(name) {
  return ARGV.includes(name);
}

function argValue(name, fallback = '') {
  for (let i = 0; i < ARGV.length; i += 1) {
    if (ARGV[i] === name && ARGV[i + 1] && !ARGV[i + 1].startsWith('--')) return ARGV[i + 1];
    if (ARGV[i].startsWith(`${name}=`)) return ARGV[i].slice(name.length + 1);
  }
  return fallback;
}

function intArg(name, fallback) {
  const n = Number(argValue(name, String(fallback)));
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function listArg(name, fallback = 'all') {
  return String(argValue(name, fallback))
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function usage() {
  console.log(`用法：node scripts/classify-submodules.cjs [选项]

  --province <省|all>       省份，默认 all；也支持 --provinces 北京,天津
  --module <模块|all>       changshi/yanyu/panduan/shuliang/ziliao/all，默认 all
  --apply                   写回分片（默认只出报告）
  --sync-source             写回后同步到 questions-v2-provincial 源分片（防止下次发布覆盖）
  --sync-only               不调模型，只把线上已有的 subModule 同步到源分片
  --force                   忽略已有 subModule 和断点缓存，全部重跑
  --retry-low               只重跑 subModule_confidence=low 的题
  --limit <N>               最多处理 N 题（用于小样测试）
  --concurrency <N>         并发数，默认 6
  --retries <N>             单题失败重试次数，默认 3
  --review-sample <N>       输出 N 题人工核对抽样，默认 0
  --model <name>            DeepSeek 模型，默认 deepseek-flash
  --price-hit <USD/M>       输入缓存命中单价，默认按模型
  --price-miss <USD/M>      输入缓存未命中单价，默认按模型
  --price-output <USD/M>    输出单价，默认按模型
  --usd-cny <rate>          USD→CNY 汇率，默认 7.1
  --no-backup               --apply 时不备份原分片
  --help                    显示帮助`);
}

if (hasFlag('--help')) {
  usage();
  process.exit(0);
}

const PROVINCES = listArg('--province', argValue('--provinces', 'all'));
const MODULES = listArg('--module', 'all');
const APPLY = hasFlag('--apply');
const SYNC_SOURCE = hasFlag('--sync-source') || hasFlag('--sync-only');
const SYNC_ONLY = hasFlag('--sync-only');
const FORCE = hasFlag('--force');
const RETRY_LOW = hasFlag('--retry-low');
const NO_BACKUP = hasFlag('--no-backup');
const LIMIT = Math.max(0, intArg('--limit', 0));
const CONCURRENCY = Math.max(1, Math.min(32, intArg('--concurrency', 6)));
const RETRIES = Math.max(0, Math.min(8, intArg('--retries', 3)));
const REVIEW_SAMPLE = Math.max(0, intArg('--review-sample', 0));
const MODEL = argValue('--model', process.env.DEEPSEEK_MODEL || 'deepseek-flash');
const USD_CNY = Number(argValue('--usd-cny', '7.1')) || 7.1;

const MODEL_PRICES = {
  'deepseek-flash': { hit: 0.006, miss: 0.3, output: 1.2 },
  'deepseek-chat': { hit: 0.006, miss: 0.3, output: 1.2 },
  'deepseek-v4-pro': { hit: 0.044, miss: 1.32, output: 3.96 }
};
const DEFAULT_PRICE = MODEL_PRICES[MODEL] || MODEL_PRICES['deepseek-flash'];
const PRICE = {
  hit: Number(argValue('--price-hit', String(DEFAULT_PRICE.hit))),
  miss: Number(argValue('--price-miss', String(DEFAULT_PRICE.miss))),
  output: Number(argValue('--price-output', String(DEFAULT_PRICE.output)))
};

function fail(msg) {
  console.error(`[submodule] 失败：${msg}`);
  process.exit(1);
}

function num(n) {
  return Number(n || 0).toLocaleString('en-US');
}

function clip(text, max) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY.trim();
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return '';
  const text = fs.readFileSync(envPath, 'utf8');
  const m = text.match(/^DEEPSEEK_API_KEY\s*=\s*(.+)$/m);
  if (!m) return '';
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function parseShardName(name) {
  const m = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/.exec(name);
  if (!m) return null;
  return { category: m[1], province: m[2], module: m[3], chunk: Number(m[4]) };
}

function matches(list, value) {
  return list.includes('all') || list.includes(value);
}

function collectShards() {
  if (!fs.existsSync(QUESTIONS_DIR)) fail(`缺少目录：${QUESTIONS_DIR}`);
  const shards = [];
  for (const name of fs.readdirSync(QUESTIONS_DIR)) {
    if (name === 'index.json' || name === 'idMap.json' || name === 'questions.json') continue;
    const parsed = parseShardName(name);
    if (!parsed) continue;
    if (!SUB_MODULE_MAP[parsed.module]) continue;
    if (!matches(MODULES, parsed.module)) continue;
    if (!matches(PROVINCES, parsed.province)) continue;
    shards.push({ name, ...parsed });
  }
  shards.sort((a, b) => a.name.localeCompare(b.name));
  return shards;
}

function canonicalSubModule(raw, module) {
  const allowed = SUB_MODULE_MAP[module] || [];
  const s = String(raw || '').replace(/[\s"'“”‘’「」]/g, '');
  if (!s) return '';
  if (allowed.includes(s)) return s;
  const mapped = SYNONYMS[s];
  if (mapped && allowed.includes(mapped)) return mapped;
  for (const name of allowed) {
    if (s.includes(name)) return name;
  }
  return '';
}

function loadShardQuestions(shard) {
  const full = path.join(QUESTIONS_DIR, shard.name);
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(`${shard.name} 解析失败：${err.message}`);
  }
  if (!Array.isArray(arr)) throw new Error(`${shard.name} 不是题目数组`);
  return arr;
}

function collectRecords(shards) {
  const records = [];
  for (const shard of shards) {
    const arr = loadShardQuestions(shard);
    arr.forEach((q, index) => {
      if (!q || typeof q !== 'object') return;
      if (q.module && q.module !== shard.module) return;
      const contentHash = crypto
        .createHash('sha1')
        .update([q.stem || '', q.material || '', q.answer || '', JSON.stringify(q.options || [])].join('\n'))
        .digest('hex')
        .slice(0, 12);
      records.push({
        key: `${shard.name}#${index}#${q.id || ''}#${contentHash}`,
        shard: shard.name,
        index,
        module: shard.module,
        province: shard.province,
        q
      });
    });
  }
  return records;
}

function buildMessages(rec) {
  const q = rec.q;
  const module = rec.module;
  const allowed = SUB_MODULE_MAP[module] || [];
  const catalog = allowed.map(name => `- ${name}：${SUB_MODULE_DESC[name] || name}`).join('\n');
  const options = Array.isArray(q.options) && q.options.length
    ? q.options.map(opt => `${opt.key || ''}. ${opt.text || ''}`).join('\n')
    : '（无可用选项文本）';
  const material = q.material ? `材料：${clip(stripHtml(q.material), 1600)}` : '';
  const imageHint = q.imageUrl ? `图片材料：${clip(q.imageUrl, 200)}（只能根据题干/选项文字判断，图片内容不可见）` : '';
  const explanation = q.explanation ? `解析摘录：${clip(stripHtml(q.explanation), 500)}` : '';
  const stem = String(q.stem || '').trim();
  if (!stem && !material && !imageHint) return null;

  const boundary = module === 'changshi'
    ? `常识判断边界补充：
- 政府职能、行政管理、公共服务、政策、时政 → 政治时政（不要因为出现“管理”就归经济管理）
- 具体法律条文、权利义务、违法责任、诉讼、行政复议 → 法律
- 经济概念、金融、财税、市场、企业经营管理 → 经济管理；若题目考的是具体法律规定，则归法律
- 科学原理、技术、医学原理、环保科学 → 科技；日常健康、安全急救、生活窍门 → 生活常识
- 历史、文学、文化、哲学、艺术 → 人文历史；自然地理、国情、资源环境 → 地理国情`
    : module === 'ziliao'
      ? '资料分析按“材料呈现形式”分类，不按问法分类；文字+表格/图形同时出现归综合材料。'
      : '';
  const system = `你是公务员考试题库的二级分类器。任务：根据题目内容，从给定子类中选出唯一一个最匹配的子类。
硬性规则：
1. 只能从“可选子类”里选择一个，禁止多选、禁止自造名称。
2. 如果题目跨两类、信息不足、题干/选项明显残缺，或你拿不准，必须把 confidence 设为 "low"，但仍要给出一个最可能的子类。
3. 不要因为选项里出现某个词就机械归类，以题目考查的核心知识点为准。
4. 只输出 JSON，不要输出 Markdown、解释段落或多余字段。
${boundary}
输出格式示例：{"subModule":"法律","confidence":"high","reason":"考查个人所得税免税范围"}
字段说明：subModule 为子类名；confidence 只能是 high 或 low；reason 不超过30字。`;

  const user = `模块：${MODULE_LABELS[module] || module}
可选子类：
${catalog}

题干：${clip(stem, 2400)}
${material}
${imageHint}
选项：
${options}
正确答案：${q.answer || '（缺失）'}
${explanation}

请分类，并输出 JSON。`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function scopeLabel() {
  return `${PROVINCES.join('+') || 'all'}-${MODULES.join('+') || 'all'}`.replace(/[\\/:*?"<>|]/g, '_');
}

function cachePath() {
  return path.join(CACHE_DIR, `submodule-${scopeLabel()}.jsonl`);
}

function loadCheckpoint() {
  const file = cachePath();
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row.promptVersion !== PROMPT_VERSION || row.model !== MODEL) continue;
      if (FORCE) continue;
      if (RETRY_LOW && row.result?.confidence === 'low') continue;
      map.set(row.key, row.result);
    } catch (err) { /* 忽略损坏行 */ }
  }
  return map;
}

function appendCheckpoint(key, result) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const row = {
    promptVersion: PROMPT_VERSION,
    model: MODEL,
    key,
    result,
    savedAt: new Date().toISOString()
  };
  fs.appendFileSync(cachePath(), `${JSON.stringify(row)}\n`, 'utf8');
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回 JSON 对象');
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeResult(parsed, rec) {
  const subModule = canonicalSubModule(parsed?.subModule, rec.module);
  if (!subModule) {
    const bad = String(parsed?.subModule || '').slice(0, 40);
    throw Object.assign(new Error(`子类不在允许列表：${bad || '空'}`), { retryable: true });
  }
  const confidence = parsed?.confidence === 'low' ? 'low' : 'high';
  return {
    subModule,
    confidence,
    reason: clip(parsed?.reason || '', 80),
    raw: parsed
  };
}

function usageNumbers(usage) {
  const hit = Number(usage?.prompt_cache_hit_tokens || 0);
  const totalPrompt = Number(usage?.prompt_tokens || 0);
  const miss = Number(usage?.prompt_cache_miss_tokens || Math.max(0, totalPrompt - hit));
  return {
    promptTokens: totalPrompt || hit + miss,
    completionTokens: Number(usage?.completion_tokens || 0),
    cacheHitTokens: hit,
    cacheMissTokens: miss,
    totalTokens: Number(usage?.total_tokens || totalPrompt + Number(usage?.completion_tokens || 0))
  };
}

async function requestOnce(rec, apiKey, messages, useJsonMode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const body = {
      model: MODEL,
      messages,
      // deepseek-flash 默认开启 thinking，会把 max_tokens 吃掉导致 content 为空/JSON 截断
      thinking: { type: 'disabled' },
      temperature: 0,
      max_tokens: 200
    };
    if (useJsonMode) body.response_format = { type: 'json_object' };
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`DeepSeek HTTP ${res.status}：${clip(text, 180)}`);
      err.retryable = res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500;
      throw err;
    }
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw Object.assign(new Error('DeepSeek 响应不是 JSON'), { retryable: true });
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      const err = new Error('DeepSeek 返回内容为空');
      err.retryable = true;
      err.code = 'EMPTY_CONTENT';
      throw err;
    }
    let parsed;
    try {
      parsed = parseJsonLoose(content);
    } catch (err) {
      const bad = new Error(`模型输出无法解析为 JSON：${clip(content, 120)}`);
      bad.retryable = true;
      bad.code = 'BAD_JSON';
      throw bad;
    }
    const result = normalizeResult(parsed, rec);
    result.usage = usageNumbers(payload.usage);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function classifyRecord(rec, apiKey) {
  const messages = buildMessages(rec);
  if (!messages) throw new Error('题干、材料、图片均为空');
  let lastErr = null;
  let useJsonMode = true;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      return await requestOnce(rec, apiKey, messages, useJsonMode);
    } catch (err) {
      lastErr = err;
      // DeepSeek JSON 模式偶发返回空内容/坏 JSON：退回普通模式，靠 prompt 约束 JSON 再解析
      if (err?.code === 'EMPTY_CONTENT' || err?.code === 'BAD_JSON') useJsonMode = false;
      const retryable = err?.retryable !== false;
      if (attempt >= RETRIES || !retryable) break;
      const wait = Math.min(8000, 600 * 2 ** attempt) + Math.floor(Math.random() * 350);
      await new Promise(resolve => setTimeout(resolve, wait));
    }
  }
  throw lastErr || new Error('未知错误');
}

async function runPool(items, limit, worker) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(lanes);
}

function csvCell(value) {
  const s = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function effectiveResult(rec, resultByKey) {
  const result = resultByKey.get(rec.key);
  if (result) return result;
  const existing = canonicalSubModule(rec.q.subModule, rec.module);
  if (!existing) return null;
  return {
    subModule: existing,
    confidence: rec.q.subModule_confidence === 'low' ? 'low' : 'high',
    reason: '已有字段'
  };
}

function buildDistribution(records, resultByKey) {
  const out = {};
  for (const rec of records) {
    const result = effectiveResult(rec, resultByKey);
    if (!result) continue;
    const moduleLabel = MODULE_LABELS[rec.module] || rec.module;
    if (!out[moduleLabel]) {
      out[moduleLabel] = { total: 0, subModules: {} };
    }
    out[moduleLabel].total += 1;
    out[moduleLabel].subModules[result.subModule] = (out[moduleLabel].subModules[result.subModule] || 0) + 1;
  }
  return out;
}

function pickSample(entries, target) {
  if (target <= 0 || entries.length === 0) return [];
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.rec.module}:${entry.result.subModule}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const ordered = [...groups.entries()].map(([key, list]) => ({
    key,
    list: list.sort((a, b) => {
      const ha = crypto.createHash('sha1').update(a.rec.key).digest('hex');
      const hb = crypto.createHash('sha1').update(b.rec.key).digest('hex');
      return ha.localeCompare(hb);
    }),
    size: list.length,
    picked: 0
  }));
  const total = Math.min(target, entries.length);
  const selected = [];
  while (selected.length < total) {
    const candidates = ordered.filter(group => group.picked < group.size);
    if (candidates.length === 0) break;
    candidates.sort((a, b) => (a.picked / a.size) - (b.picked / b.size));
    const group = candidates[0];
    const entry = group.list[group.picked];
    group.picked += 1;
    selected.push(entry);
  }
  return selected.sort((a, b) => a.rec.key.localeCompare(b.rec.key));
}

function backupAndWriteShards(changes, stamp) {
  const backupDir = path.join(REPORT_DIR, 'submodule-backups', stamp);
  if (!NO_BACKUP) fs.mkdirSync(backupDir, { recursive: true });
  let written = 0;
  for (const [shardName, items] of changes) {
    const full = path.join(QUESTIONS_DIR, shardName);
    const original = fs.readFileSync(full, 'utf8');
    const arr = JSON.parse(original);
    let changed = 0;
    for (const item of items) {
      const target = arr[item.rec.index];
      if (!target || target.id !== item.rec.q.id) {
        throw new Error(`${shardName} 第 ${item.rec.index + 1} 题索引漂移，已中止写入`);
      }
      target.subModule = item.result.subModule;
      target.subModule_confidence = item.result.confidence;
      changed += 1;
    }
    if (!changed) continue;
    if (!NO_BACKUP) fs.copyFileSync(full, path.join(backupDir, shardName));
    fs.writeFileSync(full, JSON.stringify(arr, null, 2), 'utf8');
    written += changed;
  }
  return { written, backupDir: NO_BACKUP ? '' : backupDir };
}

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsonFiles(full, acc);
    else if (entry.name.endsWith('.json') && entry.name !== 'index.json') acc.push(full);
  }
  return acc;
}

/**
 * 把线上 target 分片里已有的 subModule 按题目 ID 同步回源目录。
 * 源目录是下次 publish-merge-provinces 的输入；不同步的话发布会把子类字段覆盖掉。
 */
function syncSourceFromTarget(stamp) {
  const targetMap = new Map();
  for (const shard of collectShards()) {
    for (const q of loadShardQuestions(shard)) {
      const subModule = canonicalSubModule(q.subModule, q.module);
      if (!q.id || !subModule) continue;
      targetMap.set(q.id, {
        module: q.module,
        subModule,
        confidence: q.subModule_confidence === 'low' ? 'low' : 'high'
      });
    }
  }
  if (!targetMap.size) return { files: 0, questions: 0, backupDir: '', backupDirs: [] };

  // 国考源分片在 questions-v2/，省考源分片在 questions-v2-provincial/<省份>/；
  // 两边都要同步，否则下一次 publish-merge 会把子类字段覆盖掉。
  const sources = [];
  if (fs.existsSync(SOURCE_NATIONAL_ROOT)) {
    sources.push({ root: SOURCE_NATIONAL_ROOT, label: 'source-national', flat: true });
  }
  if (fs.existsSync(SOURCE_PROVINCIAL_ROOT)) {
    sources.push({ root: SOURCE_PROVINCIAL_ROOT, label: 'source-provincial', flat: false });
  }

  let files = 0;
  let questions = 0;
  const backupDirs = [];
  for (const source of sources) {
    let scanDirs = [];
    if (source.flat) {
      scanDirs = [source.root];
    } else if (PROVINCES.includes('all')) {
      scanDirs = fs.readdirSync(source.root, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => path.join(source.root, e.name));
    } else {
      scanDirs = PROVINCES.map(p => path.join(source.root, p));
    }

    const backupDir = path.join(REPORT_DIR, 'submodule-backups', stamp, source.label);
    let sourceFiles = 0;
    for (const dir of scanDirs) {
      for (const full of walkJsonFiles(dir)) {
        let arr;
        try {
          arr = JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch (err) {
          continue;
        }
        if (!Array.isArray(arr)) continue;
        let changed = 0;
        for (const q of arr) {
          if (!q || !q.id) continue;
          const hit = targetMap.get(q.id);
          if (!hit) continue;
          if (q.module && hit.module && q.module !== hit.module) continue;
          if (q.subModule === hit.subModule && q.subModule_confidence === hit.confidence) continue;
          q.subModule = hit.subModule;
          q.subModule_confidence = hit.confidence;
          changed += 1;
        }
        if (!changed) continue;
        if (!NO_BACKUP) {
          const rel = path.relative(source.root, full);
          const dest = path.join(backupDir, rel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(full, dest);
        }
        fs.writeFileSync(full, JSON.stringify(arr, null, 2), 'utf8');
        files += 1;
        sourceFiles += 1;
        questions += changed;
      }
    }
    if (sourceFiles > 0 && !NO_BACKUP) backupDirs.push(backupDir);
  }
  return {
    files,
    questions,
    backupDir: backupDirs.join('；'),
    backupDirs
  };
}

async function main() {
  const startedAt = Date.now();
  if (SYNC_ONLY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const info = syncSourceFromTarget(stamp);
    console.log(`[submodule] 源目录同步：${num(info.files)} 个文件 / ${num(info.questions)} 道题；备份：${info.backupDir || '未备份'}`);
    return;
  }
  const shards = collectShards();
  if (!shards.length) fail(`没有找到匹配分片（省份=${PROVINCES.join(',')}，模块=${MODULES.join(',')}）`);
  const records = collectRecords(shards);
  if (!records.length) fail('匹配分片里没有题目');

  const resultByKey = new Map();
  const needs = [];
  const checkpoint = loadCheckpoint();
  let existingCount = 0;
  let invalidExisting = 0;
  for (const rec of records) {
    const existing = canonicalSubModule(rec.q.subModule, rec.module);
    const validExisting = existing && existing === rec.q.subModule;
    const isLow = rec.q.subModule_confidence === 'low';
    if (validExisting && !FORCE && !(RETRY_LOW && isLow)) {
      resultByKey.set(rec.key, {
        subModule: existing,
        confidence: isLow ? 'low' : 'high',
        reason: checkpoint.get(rec.key)?.reason || '已有字段'
      });
      existingCount += 1;
      continue;
    }
    if (rec.q.subModule && !validExisting) invalidExisting += 1;
    needs.push(rec);
  }

  const toRun = LIMIT > 0 ? needs.slice(0, LIMIT) : needs;
  const apiKey = toRun.length ? loadApiKey() : '';
  if (toRun.length && !apiKey) fail('未找到 DEEPSEEK_API_KEY（环境变量或 .env）');

  const failures = [];
  const usage = { promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheMissTokens: 0, totalTokens: 0 };
  let apiCalls = 0;
  let succeeded = 0;
  let cacheHits = 0;

  console.log(`[submodule] 范围：${scopeLabel()} / 分片 ${shards.length} 个 / 题目 ${num(records.length)} 道`);
  console.log(`[submodule] 已有分类 ${num(existingCount)} 道 / 待处理 ${num(toRun.length)} 道 / 模型 ${MODEL} / 并发 ${CONCURRENCY}`);

  await runPool(toRun, CONCURRENCY, async (rec) => {
    const cached = checkpoint.get(rec.key);
    if (cached) {
      resultByKey.set(rec.key, cached);
      cacheHits += 1;
      const done = cacheHits + succeeded + failures.length;
      if (done % 25 === 0 || done === toRun.length) console.log(`[submodule] 进度 ${done}/${toRun.length}（缓存 ${cacheHits}）`);
      return;
    }
    apiCalls += 1;
    try {
      const result = await classifyRecord(rec, apiKey);
      resultByKey.set(rec.key, result);
      appendCheckpoint(rec.key, result);
      for (const key of Object.keys(usage)) usage[key] += Number(result.usage?.[key] || 0);
      succeeded += 1;
    } catch (err) {
      failures.push({
        key: rec.key,
        id: rec.q.id || '',
        province: rec.province,
        module: rec.module,
        error: clip(err?.message || String(err), 300)
      });
    }
    const done = cacheHits + succeeded + failures.length;
    if (done % 25 === 0 || done === toRun.length) {
      console.log(`[submodule] 进度 ${done}/${toRun.length}（成功 ${succeeded} / 失败 ${failures.length} / 缓存 ${cacheHits}）`);
    }
  });

  const elapsedMs = Date.now() - startedAt;
  const levels = ['changshi', 'yanyu', 'panduan', 'shuliang', 'ziliao'];
  const distribution = buildDistribution(records, resultByKey);
  for (const module of levels) {
    const label = MODULE_LABELS[module];
    const bucket = distribution[label];
    if (!bucket) continue;
    const parts = Object.entries(bucket.subModules).map(([name, count]) => `${name} ${num(count)}`).join(' / ');
    console.log(`[submodule] ${label}：${num(bucket.total)} 题（${parts}）`);
  }

  const lowEntries = [];
  const classifiedEntries = [];
  for (const rec of records) {
    const result = effectiveResult(rec, resultByKey);
    if (!result) continue;
    classifiedEntries.push({ rec, result });
    if (result.confidence === 'low') lowEntries.push({ rec, result });
  }
  const sampleEntries = pickSample(classifiedEntries, REVIEW_SAMPLE);
  const cost = {
    usdPeak: (usage.cacheHitTokens / 1e6) * PRICE.hit + (usage.cacheMissTokens / 1e6) * PRICE.miss + (usage.completionTokens / 1e6) * PRICE.output,
    usdOffPeak: ((usage.cacheHitTokens / 1e6) * PRICE.hit + (usage.cacheMissTokens / 1e6) * PRICE.miss + (usage.completionTokens / 1e6) * PRICE.output) / 2,
    per1000UsdPeak: 0,
    per1000CnyPeak: 0
  };
  cost.per1000UsdPeak = apiCalls ? (cost.usdPeak / apiCalls) * 1000 : 0;
  cost.per1000CnyPeak = cost.per1000UsdPeak * USD_CNY;

  const report = {
    generatedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    model: MODEL,
    scope: { provinces: PROVINCES, modules: MODULES, shards: shards.map(s => s.name) },
    counts: {
      matched: records.length,
      existing: existingCount,
      invalidExisting,
      needs: needs.length,
      attempted: toRun.length,
      apiCalls,
      cacheHits,
      succeeded,
      failed: failures.length,
      notRun: needs.length - toRun.length,
      classified: classifiedEntries.length,
      lowConfidence: lowEntries.length
    },
    timing: {
      elapsedMs,
      perQuestionMs: apiCalls ? elapsedMs / apiCalls : 0,
      per1000Ms: apiCalls ? (elapsedMs / apiCalls) * 1000 : 0,
      per1000Minutes: apiCalls ? ((elapsedMs / apiCalls) * 1000) / 60000 : 0,
      per1000MinutesAtConcurrency: apiCalls ? (((elapsedMs / apiCalls) * 1000) / 60000) / CONCURRENCY : 0,
      observedPer1000Minutes: toRun.length ? (elapsedMs / toRun.length) * 1000 / 60000 : 0,
      // 小样本按“单请求 × 并发”估算；样本足够大时直接用本次墙钟外推
      estimatedPer1000Minutes: apiCalls
        ? (apiCalls >= 50
          ? (elapsedMs / toRun.length) * 1000 / 60000
          : (((elapsedMs / apiCalls) * 1000) / 60000) / CONCURRENCY)
        : 0
    },
    usage,
    price: { ...PRICE, usdCny: USD_CNY },
    cost,
    distribution,
    failures,
    sourceSync: null,
    lowConfidence: lowEntries.map(({ rec, result }) => ({
      id: rec.q.id || '',
      province: rec.province,
      module: rec.module,
      subModule: result.subModule,
      confidence: result.confidence,
      reason: result.reason || '',
      stem: clip(rec.q.stem, 300),
      shard: rec.shard
    })),
    reviewSample: sampleEntries.map(({ rec, result }) => ({
      id: rec.q.id || '',
      province: rec.province,
      module: rec.module,
      subModule: result.subModule,
      confidence: result.confidence,
      reason: result.reason || '',
      stem: rec.q.stem || '',
      options: (rec.q.options || []).map(opt => `${opt.key}.${opt.text}`).join('；'),
      answer: rec.q.answer || '',
      explanation: rec.q.explanation || '',
      shard: rec.shard
    }))
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(REPORT_DIR, `submodule-${scopeLabel()}-${stamp}`);
  const jsonPath = `${base}.json`;
  const mdPath = `${base}.md`;
  const lowCsvPath = `${base}-low-confidence.csv`;
  const sampleCsvPath = `${base}-review-sample.csv`;

  let applyInfo = null;
  if (APPLY) {
    const changes = new Map();
    for (const rec of toRun) {
      const result = resultByKey.get(rec.key);
      if (!result) continue;
      if (!changes.has(rec.shard)) changes.set(rec.shard, []);
      changes.get(rec.shard).push({ rec, result });
    }
    applyInfo = backupAndWriteShards(changes, stamp);
    report.applied = applyInfo;
    console.log(`[submodule] 已写回 ${num(applyInfo.written)} 道；备份：${applyInfo.backupDir || '未备份'}`);
  }
  if (SYNC_SOURCE) {
    const synced = syncSourceFromTarget(stamp);
    report.sourceSync = synced;
    console.log(`[submodule] 源目录同步：${num(synced.files)} 个文件 / ${num(synced.questions)} 道题；备份：${synced.backupDir || '未备份'}`);
  }

  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const md = [];
  md.push(`# 二级分类${APPLY ? '写回' : '试跑'}报告`);
  md.push('');
  md.push(`- 生成时间：${report.generatedAt}`);
  md.push(`- 范围：${PROVINCES.join('、')} / ${MODULES.map(m => MODULE_LABELS[m] || m).join('、')}`);
  md.push(`- 模型：${MODEL}（${PROMPT_VERSION}）`);
  md.push(`- 分片：${shards.length} 个；匹配题目：${num(records.length)} 道`);
  md.push(`- 已有分类：${num(existingCount)} 道；待处理：${num(needs.length)} 道；本次实际处理：${num(toRun.length)} 道`);
  md.push(`- 本次成功：${num(succeeded)} 道；缓存命中：${num(cacheHits)} 道；失败：${num(failures.length)} 道；低置信：${num(lowEntries.length)} 道`);
  if (report.sourceSync) md.push(`- 源目录同步：${num(report.sourceSync.files)} 个文件 / ${num(report.sourceSync.questions)} 道题`);
  md.push(`- 耗时：${(elapsedMs / 1000).toFixed(1)} 秒；单请求平均 ${(report.timing.perQuestionMs / 1000).toFixed(1)} 秒；按并发 ${CONCURRENCY} 估算每千题约 ${report.timing.estimatedPer1000Minutes.toFixed(1)} 分钟`);
  md.push(`- 费用：本次 $${cost.usdPeak.toFixed(4)}（峰值价，约 ¥${(cost.usdPeak * USD_CNY).toFixed(3)}）；每千题约 $${cost.per1000UsdPeak.toFixed(4)}（约 ¥${cost.per1000CnyPeak.toFixed(2)}）`);
  md.push('');
  md.push('## 子类分布');
  md.push('');
  md.push('| 模块 | 子类 | 题量 |');
  md.push('|---|---|---:|');
  for (const [moduleLabel, bucket] of Object.entries(distribution)) {
    for (const [subLabel, count] of Object.entries(bucket.subModules)) {
      md.push(`| ${moduleLabel} | ${subLabel} | ${num(count)} |`);
    }
  }
  md.push('');
  md.push('## 低置信题');
  md.push('');
  if (!lowEntries.length) {
    md.push('无。');
  } else {
    md.push(`共 ${num(lowEntries.length)} 道，完整清单见 \`${path.basename(lowCsvPath)}\`。`);
    md.push('');
    md.push('| 题目 ID | 子类 | 理由 |');
    md.push('|---|---|---|');
    for (const { rec, result } of lowEntries.slice(0, 50)) {
      md.push(`| ${rec.q.id || ''} | ${result.subModule} | ${String(result.reason || '').replace(/\|/g, '/')} |`);
    }
  }
  md.push('');
  md.push('## 人工核对抽样');
  md.push('');
  md.push(sampleEntries.length
    ? `已抽取 ${sampleEntries.length} 题，填写 \`${path.basename(sampleCsvPath)}\` 的「人工判定」列后运行 \`node scripts/evaluate-submodule-sample.cjs --file "${path.basename(sampleCsvPath)}"\`。`
    : '未抽取（--review-sample 0）。');
  md.push('');
  md.push('## 输出文件');
  md.push('');
  md.push(`- JSON：\`${path.basename(jsonPath)}\``);
  md.push(`- 低置信 CSV：\`${path.basename(lowCsvPath)}\``);
  md.push(`- 抽样 CSV：\`${path.basename(sampleCsvPath)}\``);
  fs.writeFileSync(mdPath, `${md.join('\n')}\n`, 'utf8');

  fs.writeFileSync(lowCsvPath, toCsv(
    ['id', 'province', 'module', 'subModule', 'confidence', 'reason', 'stem', 'options', 'answer', 'explanation', 'shard'],
    lowEntries.map(({ rec, result }) => [
      rec.q.id || '', rec.province, rec.module, result.subModule, result.confidence, result.reason || '',
      rec.q.stem || '', (rec.q.options || []).map(opt => `${opt.key}.${opt.text}`).join('；'),
      rec.q.answer || '', rec.q.explanation || '', rec.shard
    ])
  ), 'utf8');

  fs.writeFileSync(sampleCsvPath, toCsv(
    ['序号', 'id', '省份', '模块', '模型子类', '置信度', '题干', '选项', '正确答案', '解析', '人工判定', '是否正确(是/否)', '备注', 'shard'],
    sampleEntries.map(({ rec, result }, index) => [
      index + 1, rec.q.id || '', rec.province, rec.module, result.subModule, result.confidence,
      rec.q.stem || '', (rec.q.options || []).map(opt => `${opt.key}.${opt.text}`).join('；'),
      rec.q.answer || '', rec.q.explanation || '', '', '', '', rec.shard
    ])
  ), 'utf8');

  console.log(`[submodule] 完成：成功 ${num(succeeded)} / 失败 ${num(failures.length)} / 低置信 ${num(lowEntries.length)}`);
  console.log(`[submodule] 速度：单请求平均 ${(report.timing.perQuestionMs / 1000).toFixed(1)} 秒；按并发 ${CONCURRENCY} 估算每千题约 ${report.timing.estimatedPer1000Minutes.toFixed(1)} 分钟；费用：每千题约 $${cost.per1000UsdPeak.toFixed(4)}（约 ¥${cost.per1000CnyPeak.toFixed(2)}，峰值价）`);
  console.log(`[submodule] 报告：${jsonPath}`);
  console.log(`[submodule] 低置信清单：${lowCsvPath}`);
  if (REVIEW_SAMPLE > 0) console.log(`[submodule] 人工抽样：${sampleCsvPath}`);
  if (!APPLY) console.log('[submodule] 未写题库；确认后加 --apply 写回。');
  if (failures.length) process.exitCode = 1;
}

main().catch(err => fail(err?.stack || String(err)));
