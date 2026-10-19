#!/usr/bin/env node
/**
 * publish-merge-v2.cjs —— 方案 A：把 v2 国考分片合并进线上数据目录
 *
 * 前端 loader（src/hooks/useQuestions.ts）固定读取 /data/questions/，因此 publish 不改路径，
 * 而是把 v2 的国家队分片并进同一个数据目录，保持"一个目录、一套索引"：
 *
 *   1) 删除 public/data/questions/ 下全部 national-*.json（旧国考分片，题目 ID 前缀 real-*）
 *      —— 只覆盖同名文件会留下 v1 多出的分片（如 national-none-changshi-6.json），
 *         那些旧题会被新索引继续收录，造成"新旧国考题并存"。
 *   2) 复制 public/data/questions-v2/national-*.json（题目 ID 前缀 gk-*）
 *   3) 按目录内**实际文件**重建 index.json 与 idMap.json，覆盖省考等全部老数据，
 *      保证错题本 / 知识点筛选能反查到分片。
 *
 * 用法：
 *   node scripts/publish-merge-v2.cjs            # dry-run：只写 guokao-reports/publish-plan.md
 *   node scripts/publish-merge-v2.cjs --apply    # 真正合并并重建索引
 *
 * 退出码：0 成功；1 前置检查失败（失败时不会写任何题目数据）。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.env.PUBLISH_ROOT
  ? path.resolve(process.env.PUBLISH_ROOT)
  : path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'data', 'questions-v2');
const DST = path.join(ROOT, 'public', 'data', 'questions');
const REPORT = path.join(ROOT, 'guokao-reports', 'publish-plan.md');
const APPLY = process.argv.includes('--apply');

/** 主观题模块：允许无选项 */
const SUBJECTIVE = new Set(['shenlun', 'gongji']);
/** 分片命名：<category>-<province>-<module>-<chunk>.json */
const SHARD_RE = /^([a-z_]+)-(.+)-([a-z]+)-(\d+)\.json$/;

function fail(msg) {
  console.error(`[publish] 前置检查失败：${msg}`);
  process.exit(1);
}

function listShards(dir) {
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'idMap.json')
    .sort();
}

function parseShardName(name) {
  const m = SHARD_RE.exec(name);
  if (!m) return null;
  return {
    category: m[1],
    province: m[2],
    module: m[3],
    chunk: Number(m[4]),
    key: `${m[1]}-${m[2]}-${m[3]}`,
  };
}

function readShard(dir, name) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
  } catch (err) {
    throw new Error(`${name} 解析失败：${err.message}`);
  }
  if (!Array.isArray(data)) throw new Error(`${name} 不是题目数组`);
  return data;
}

function countQuestions(dir, names) {
  let n = 0;
  for (const name of names) n += readShard(dir, name).length;
  return n;
}

/** 前端可渲染性预检（与 src/lib/questionValidation.ts 同口径） */
function renderStats(questions) {
  const stat = {
    total: questions.length,
    ok: 0,
    image: 0,
    subjective: 0,
    noStem: 0,
    tooFewOptions: 0,
    emptyOptionText: 0,
  };
  for (const q of questions) {
    if (typeof q?.stem !== 'string' || q.stem.trim() === '') {
      stat.noStem += 1;
      continue;
    }
    const module = String(q?.module || '');
    if (SUBJECTIVE.has(module)) {
      stat.subjective += 1;
      stat.ok += 1;
      continue;
    }
    if (q?.isImageQuestion === true) {
      stat.image += 1;
      stat.ok += 1;
      continue;
    }
    const opts = Array.isArray(q?.options) ? q.options : [];
    if (opts.length < 2) {
      stat.tooFewOptions += 1;
      continue;
    }
    if (opts.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) {
      stat.emptyOptionText += 1;
      continue;
    }
    stat.ok += 1;
  }
  return stat;
}


/* ------------------------------------------------------------------ */
/* 计划                                                                */
/* ------------------------------------------------------------------ */

function buildPlan() {
  for (const dir of [SRC, DST]) {
    if (!fs.existsSync(dir)) fail(`目录不存在：${path.relative(ROOT, dir)}`);
    if (!fs.existsSync(path.join(dir, 'index.json'))) {
      fail(`${path.relative(ROOT, dir)} 缺少 index.json，疑似不是数据目录`);
    }
  }

  const src = listShards(SRC).filter(n => n.startsWith('national-'));
  if (!src.length) fail('questions-v2 下没有 national-*.json');

  const badNames = src.filter(n => !parseShardName(n));
  if (badNames.length) fail(`分片命名无法解析：${badNames.join(', ')}`);

  const dstAll = listShards(DST);
  const dstNational = dstAll.filter(n => n.startsWith('national-'));
  const others = dstAll.filter(n => !n.startsWith('national-'));

  const overwrite = src.filter(n => dstNational.includes(n));
  const add = src.filter(n => !dstNational.includes(n));
  const stale = dstNational.filter(n => !src.includes(n));

  const staleSizes = {};
  let staleCount = 0;
  for (const name of stale) {
    staleSizes[name] = readShard(DST, name).length;
    staleCount += staleSizes[name];
  }

  const srcQuestions = [];
  for (const n of src) srcQuestions.push(...readShard(SRC, n));

  const srcIds = new Set();
  const dupInV2 = [];
  for (const q of srcQuestions) {
    const id = String(q?.id ?? '').trim();
    if (!id) continue;
    if (srcIds.has(id)) dupInV2.push(id);
    srcIds.add(id);
  }

  const othersQuestions = [];
  for (const n of others) othersQuestions.push(...readShard(DST, n));
  const otherIds = new Set(othersQuestions.map(q => String(q?.id ?? '').trim()).filter(Boolean));
  const collisions = [...srcIds].filter(id => otherIds.has(id));

  return {
    src,
    dstNational,
    others,
    overwrite,
    add,
    stale,
    srcQuestions,
    staleSizes,
    staleCount,
    overwriteOldCount: countQuestions(DST, overwrite),
    othersCount: othersQuestions.length,
    dupInV2,
    collisions,
  };
}

function buildIndex(names) {
  const groups = new Map();
  for (const name of names) {
    const parsed = parseShardName(name);
    if (!parsed) continue;
    if (!groups.has(parsed.key)) groups.set(parsed.key, []);
    groups.get(parsed.key).push({ name, chunk: parsed.chunk });
  }
  const out = {};
  for (const key of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
    out[key] = groups
      .get(key)
      .sort((a, b) => a.chunk - b.chunk)
      .map(x => x.name);
  }
  return out;
}

function buildIdMap(dir, names) {
  const map = new Map();
  for (const name of names) {
    for (const q of readShard(dir, name)) {
      const id = String(q?.id ?? '').trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      if (!map.get(id).includes(name)) map.get(id).push(name);
    }
  }
  const out = {};
  for (const id of [...map.keys()].sort((a, b) => a.localeCompare(b))) {
    out[id] = map.get(id);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 报告                                                                */
/* ------------------------------------------------------------------ */

function pct(part, whole) {
  if (!whole) return '0%';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function buildReport(plan, final) {
  const md = [];
  md.push('# publish 合并计划（方案 A：并入 /data/questions/）');
  md.push('');
  md.push(`- 模式：**${APPLY ? 'APPLIED（已写入）' : 'dry-run（未写入）'}**`);
  md.push(`- 生成时间：${new Date().toISOString()}`);
  md.push('- 源目录：`public/data/questions-v2/`（国考 v2，ID 前缀 `gk-`）');
  md.push('- 目标目录：`public/data/questions/`（线上目录，省考老数据 + 旧国考 `real-`）');
  md.push('');
  md.push('## 1. 变更清单');
  md.push('');
  md.push('| 动作 | 文件数 | 说明 |');
  md.push('|---|---|---|');
  md.push(`| 覆盖同名旧国考分片 | ${plan.overwrite.length} | 目录里已有同名文件，直接替换 |`);
  md.push(`| 新增国考分片 | ${plan.add.length} | v2 分片更细，比 v1 多 |`);
  md.push(`| 删除旧国考分片 | ${plan.stale.length} | v2 没有对应文件名，不删会残留旧题（${plan.staleCount} 道） |`);
  md.push(`| 未触碰（省考等老数据） | ${plan.others.length} | 文件内容与索引均保持 |`);
  md.push('');
  md.push(`源分片合计 **${plan.src.length}** 个 / **${plan.srcQuestions.length}** 道题。`);
  md.push('');
  if (plan.stale.length) {
    md.push('### 待删除的旧国考分片');
    md.push('');
    md.push('| 文件 | 题目数 |');
    md.push('|---|---|');
    for (const name of plan.stale) {
      md.push(`| \`${name}\` | ${plan.staleSizes[name]} |`);
    }
    md.push('');
  }
  md.push('## 2. 合并后总量');
  md.push('');
  md.push('| 指标 | 合并前 | 合并后 |');
  md.push('|---|---|---|');
  md.push(
    `| 题目数 | ${plan.othersCount + plan.staleCount + plan.overwriteOldCount} | ${final.totalQuestions} |`
  );
  md.push(`| 分片文件数 | ${plan.dstNational.length + plan.others.length} | ${final.files} |`);
  md.push(`| index key 数 | — | ${final.keyCount} |`);
  md.push(`| idMap 条目数 | — | ${final.idCount} |`);
  md.push('');
  md.push('## 3. 前端可渲染性预检');
  md.push('');
  md.push('口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。');
  md.push('');
  md.push('| 指标 | 合并后 | 占比 |');
  md.push('|---|---|---|');
  md.push(`| 可渲染 | ${final.render.ok} | ${pct(final.render.ok, final.render.total)} |`);
  md.push(`| 其中图片题占位 | ${final.render.image} | ${pct(final.render.image, final.render.total)} |`);
  md.push(`| 其中主观题 | ${final.render.subjective} | ${pct(final.render.subjective, final.render.total)} |`);
  md.push(`| 跳过：题干为空 | ${final.render.noStem} | — |`);
  md.push(`| 跳过：选项不足 2 个 | ${final.render.tooFewOptions} | — |`);
  md.push(`| 跳过：选项文本为空 | ${final.render.emptyOptionText} | — |`);
  md.push('');
  md.push('## 4. 一致性检查');
  md.push('');
  md.push(`- v2 内部重复 ID：**${plan.dupInV2.length}**${plan.dupInV2.length ? `（${plan.dupInV2.slice(0, 10).join(', ')}…）` : ''}`);
  md.push(`- v2 与省考老数据 ID 冲突：**${plan.collisions.length}**${plan.collisions.length ? `（${plan.collisions.slice(0, 10).join(', ')}…）` : ''}`);
  md.push(`- index 引用的分片都存在：**${final.indexOk ? '是' : '否'}**`);
  md.push(`- index 未遗漏 / 未多引分片：**${final.indexExact ? '是' : '否'}**`);
  md.push(`- idMap 覆盖全部题目 ID：**${final.idMapOk ? '是' : '否'}**`);
  md.push('');
  if (APPLY) {
    md.push('## 5. 执行记录');
    md.push('');
    md.push(`- 删除旧国考分片：${plan.stale.length ? plan.stale.map(n => `\`${n}\``).join('、') : '无'}`);
    md.push(`- 复制 v2 分片：${plan.src.length} 个`);
    md.push('- 重建 `index.json` 与 `idMap.json`：完成');
    md.push('');
  }
  md.push(`## ${APPLY ? 6 : 5}. 后续验证`);
  md.push('');
  md.push('```powershell');
  md.push('node scripts/validate-questions.cjs --dir public/data/questions-v2');
  md.push('npm run build');
  md.push('```');
  md.push('');
  md.push('- 构建后抽查：国考模块题目 ID 应为 `gk-*`，省考仍为原有 ID。');
  md.push('- 错题本/复习按 `idMap.json` 反查分片，历史 `real-*` 记录不再命中（已确认不做迁移）。');
  md.push('');
  return md.join('\n');
}

/* ------------------------------------------------------------------ */
/* 汇总与执行                                                          */
/* ------------------------------------------------------------------ */

/** 对一组分片做统计；readFn(name) 返回该分片的题目数组 */
function summarize(names, readFn) {
  const questions = [];
  for (const name of names) {
    for (const q of readFn(name)) questions.push(q);
  }

  const index = buildIndex(names);
  const idMap = {};
  const seen = new Set();
  for (const name of names) {
    for (const q of readFn(name)) {
      const id = String(q?.id ?? '').trim();
      if (!id) continue;
      seen.add(id);
      if (!idMap[id]) idMap[id] = [];
      if (!idMap[id].includes(name)) idMap[id].push(name);
    }
  }

  const referenced = new Set(Object.values(index).flat());
  const indexOk = [...referenced].every(name => names.includes(name));
  const indexExact = referenced.size === names.length && names.every(name => referenced.has(name));
  const idMapOk =
    seen.size === Object.keys(idMap).length &&
    [...seen].every(id => Array.isArray(idMap[id]) && idMap[id].length > 0 && idMap[id].every(n => names.includes(n)));

  return {
    files: names.length,
    totalQuestions: questions.length,
    keyCount: Object.keys(index).length,
    idCount: seen.size,
    render: renderStats(questions),
    indexOk,
    indexExact,
    idMapOk,
  };
}

function main() {
  const plan = buildPlan();
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });

  if (APPLY && (plan.dupInV2.length || plan.collisions.length)) {
    fail(`存在重复/冲突 ID（v2 内部 ${plan.dupInV2.length}，与老数据 ${plan.collisions.length}），拒绝写入`);
  }

  const srcSet = new Set(plan.src);
  const readProjected = name => readShard(srcSet.has(name) ? SRC : DST, name);
  const projected = summarize([...plan.others, ...plan.src], readProjected);

  console.log(`[publish] mode=${APPLY ? 'APPLY' : 'dry-run'}`);
  console.log(`  v2 分片 ${plan.src.length} / ${plan.srcQuestions.length} 题`);
  console.log(
    `  覆盖同名 ${plan.overwrite.length}、新增 ${plan.add.length}、删除旧分片 ${plan.stale.length}（旧题 ${plan.staleCount} 道）、未触碰 ${plan.others.length}`
  );
  console.log(
    `  合并后：${projected.files} 文件 / ${projected.totalQuestions} 题 / index ${projected.keyCount} keys / idMap ${projected.idCount} 条`
  );
  console.log(
    `  可渲染 ${projected.render.ok}（图片题占位 ${projected.render.image}，主观题 ${projected.render.subjective}）；` +
      `跳过 空题干 ${projected.render.noStem} / 选项不足 ${projected.render.tooFewOptions} / 空选项文本 ${projected.render.emptyOptionText}`
  );
  console.log(
    `  一致性：index ${projected.indexOk && projected.indexExact ? 'OK' : 'FAIL'}，idMap ${projected.idMapOk ? 'OK' : 'FAIL'}`
  );

  let final = projected;
  if (APPLY) {
    for (const name of plan.stale) {
      fs.unlinkSync(path.join(DST, name));
    }
    for (const name of plan.src) {
      fs.copyFileSync(path.join(SRC, name), path.join(DST, name));
    }

    const names = listShards(DST);
    fs.writeFileSync(path.join(DST, 'index.json'), JSON.stringify(buildIndex(names)), 'utf8');
    fs.writeFileSync(path.join(DST, 'idMap.json'), JSON.stringify(buildIdMap(DST, names)), 'utf8');

    final = summarize(names, name => readShard(DST, name));

    const leftovers = names.filter(n => n.startsWith('national-') && !plan.src.includes(n));
    if (leftovers.length) fail(`写入后仍残留旧国考分片：${leftovers.join(', ')}`);
    if (final.totalQuestions !== projected.totalQuestions) {
      fail(`写入后题目数不一致（预期 ${projected.totalQuestions}，实际 ${final.totalQuestions}）`);
    }
    if (!final.indexOk || !final.indexExact || !final.idMapOk) {
      fail('写入后索引自检失败，请用 git 回滚 public/data/questions/');
    }
    console.log(`[publish] 已写入 ${plan.src.length} 个分片，并重建 index.json / idMap.json`);
  }

  fs.writeFileSync(REPORT, buildReport(plan, final), 'utf8');
  console.log(`  报告：${path.relative(ROOT, REPORT)}`);
  if (!APPLY) console.log('  这是 dry-run，未改动任何题目数据。确认无误后加 --apply。');
}

main();
