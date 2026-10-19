#!/usr/bin/env node
/**
 * repair-fujian-v2.cjs —— 福建 v2 隔离区定向修复（2010 春季 / 2011 424+917 / 2012 421+915）
 *
 * 修复内容（只写 public/data/questions-v2-provincial/福建/）：
 *   1) 2010 春季：解析器补认「二、言语能力」，Q36-Q60 由 changshi 迁回 yanyu；
 *   2) 2011：424 联考与 917 联考原先共用 label「联考」，产生 120 组同 ID。
 *      按文件名日期拆成「424联考 / 917联考」，两卷分别配对答案解析并重键 ID；
 *      917 常识 Q1-Q20 重新挂回 917 自己的常识解析，不再串 424 的言语解析。
 *
 * 用法：
 *   node scripts/repair-fujian-v2.cjs            # dry-run，只算不写
 *   node scripts/repair-fujian-v2.cjs --apply    # 备份后写入，并生成账本/对照
 */
const fs = require('node:fs');
const path = require('node:path');
const {
  PROVINCES,
  loadBase,
  pairDocs,
  loadDocText,
  buildPaperQuestions,
  writeProvinceShards,
} = require('./overnight-provinces.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'data', 'questions-v2-provincial', '福建');
const REPORT_MD = path.join(ROOT, 'guokao-reports', 'fujian-v2-修复对照.md');
const LEDGER_MD = path.join(ROOT, 'guokao-reports', 'fujian-v2-修复后账本.md');
const REPORT_CSV = path.join(ROOT, 'guokao-reports', 'fujian-v2-修复对照.csv');
const BACKUP_ROOT = path.join(ROOT, 'guokao-reports');
const APPLY = process.argv.includes('--apply');
const SPECIAL = new Set(['index.json', 'idMap.json', 'questions.json']);

const targets = [
  {
    key: '2010-春季',
    title: '2010 福建春季',
    match: name => /^2010年福建公务员考试《行测》春季卷\.docx$/.test(name),
    expectedLabel: '春季',
  },
  {
    key: '2011-424联考',
    title: '2011 424 联考',
    match: name => name.startsWith('2011年424公务员联考《行测》') && name.endsWith('.docx'),
    expectedLabel: '424联考',
  },
  {
    key: '2011-917联考',
    title: '2011 917 联考',
    match: name => name.startsWith('2011年917公务员联考《行测》') && name.endsWith('.docx'),
    expectedLabel: '917联考',
  },
  {
    key: '2012-421联考',
    title: '2012 421 联考',
    match: name => name.startsWith('2012年421公务员联考《行测》') && name.endsWith('.docx'),
    expectedLabel: '421联考',
  },
  {
    key: '2012-915联考',
    title: '2012 915 联考',
    match: name => name.startsWith('2012年915公务员联考《行测》') && name.endsWith('.docx'),
    expectedLabel: '915联考',
  },
];

function fail(msg) {
  throw new Error(msg);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readShards() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f));
  const rows = [];
  for (const file of files) {
    const list = readJson(path.join(DIR, file));
    if (!Array.isArray(list)) fail(`${file} 不是题目数组`);
    for (const q of list) rows.push(q);
  }
  return { rows, files };
}

function idCounts(rows) {
  const map = new Map();
  for (const q of rows) {
    const id = String(q.id || '').trim();
    if (!id) continue;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(q);
  }
  return map;
}

function duplicateGroups(rows) {
  return [...idCounts(rows).entries()].filter(([, list]) => list.length > 1);
}

function byModule(rows) {
  const out = {};
  for (const q of rows) out[q.module] = (out[q.module] || 0) + 1;
  return out;
}

function sourceNum(q) {
  const m = String(q.source || '').match(/第\s*(\d+)\s*题/);
  if (m) return Number(m[1]);
  const tail = String(q.id || '').match(/-(\d+)$/);
  return tail ? Number(tail[1]) : 0;
}

function sourceYear(q) {
  const m = String(q.source || '').match(/((?:19|20)\d{2})\s*年/);
  return m ? Number(m[1]) : 0;
}

function compact(text, max = 120) {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function norm(text, max = 240) {
  return String(text || '').replace(/\s+/g, '').slice(0, max);
}

function csv(value) {
  return `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
}

function pct(part, total) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function coverage(rows) {
  return {
    total: rows.length,
    answer: rows.filter(q => String(q.answer || '').trim()).length,
    explanation: rows.filter(q => String(q.explanation || '').trim()).length,
    modules: byModule(rows),
  };
}

function moduleText(modules) {
  return Object.entries(modules).map(([m, n]) => `${m}:${n}`).join(' / ') || '—';
}

function isAffectedId(id) {
  const s = String(id || '');
  return s.startsWith('prov-fujian-2010-春季-')
    || s.startsWith('prov-fujian-2011-')
    || s.startsWith('prov-fujian-2012-');
}

function batchOf(id) {
  const s = String(id || '');
  if (s.includes('2010-春季')) return '2010-春季';
  if (s.includes('2011-424')) return '2011-424联考';
  if (s.includes('2011-917')) return '2011-917联考';
  if (s.includes('2012-421')) return '2012-421联考';
  if (s.includes('2012-915')) return '2012-915联考';
  return '其他';
}

function assertTargets(pairs) {
  const picked = [];
  for (const t of targets) {
    const hits = pairs.filter(p => t.match(p.questionName));
    if (hits.length !== 1) fail(`${t.title} 题本匹配数=${hits.length}（期望 1）`);
    const pair = hits[0];
    if (pair.label !== t.expectedLabel) {
      fail(`${t.title} label=${pair.label}（期望 ${t.expectedLabel}）`);
    }
    if (!pair.answerFile) fail(`${t.title} 未配对答案`);
    if (t.key === '2011-424联考' && !/424/.test(pair.answerName)) fail('424 卷配错答案');
    if (t.key === '2011-917联考' && !/917/.test(pair.answerName)) fail('917 卷配错答案');
    if (t.key === '2012-421联考' && !/421/.test(pair.answerName)) fail('2012 421 卷配错答案');
    if (t.key === '2012-915联考' && !/915/.test(pair.answerName)) fail('2012 915 卷配错答案');
    if (t.key === '2010-春季' && !/春季/.test(pair.answerName)) fail('2010 春季配错答案');
    picked.push({ ...t, pair });
  }
  return picked;
}

async function convertTargets() {
  await loadBase();
  const cfg = PROVINCES.find(p => p.province === '福建');
  if (!cfg) fail('找不到福建配置');
  const pairs = pairDocs(cfg);
  const picked = assertTargets(pairs);
  const converted = [];
  for (const t of picked) {
    const rawText = await loadDocText(t.pair.questionFile);
    const answerText = await loadDocText(t.pair.answerFile);
    const result = buildPaperQuestions(
      rawText,
      answerText,
      { year: t.pair.year, label: t.pair.label, province: '福建', slug: 'fujian' },
      t.pair.questionName,
      t.pair.answerName
    );
    const questions = result.questions;
    const ids = new Set();
    for (const q of questions) {
      if (!q.id || ids.has(q.id)) fail(`${t.title} 转换结果存在空/重复 ID：${q.id}`);
      ids.add(q.id);
      if (String(q.id).includes('2011-联考-') || String(q.id).includes('2012-联考-')) {
        fail(`${t.title} 仍在使用旧「联考」ID：${q.id}`);
      }
    }
    converted.push({ ...t, questions, stats: coverage(questions), result });
  }
  return { cfg, pairs, converted };
}

function verifyConverted(converted) {
  const spring = converted.find(x => x.key === '2010-春季');
  const y424 = converted.find(x => x.key === '2011-424联考');
  const y917 = converted.find(x => x.key === '2011-917联考');
  const y421 = converted.find(x => x.key === '2012-421联考');
  const y915 = converted.find(x => x.key === '2012-915联考');
  if (!spring || !y424 || !y917 || !y421 || !y915) fail('定向转换结果缺少卷别');
  for (const y of [y421, y915]) {
    if (y.questions.length !== 120) fail(`${y.title} 题数=${y.questions.length}（期望 120）`);
    if (new Set(y.questions.map(q => q.id)).size !== 120) fail(`${y.title} ID 不唯一`);
  }

  const springYanyu = spring.questions.filter(q => q.num >= 36 && q.num <= 60);
  if (springYanyu.length !== 25) fail(`2010 春季 Q36-Q60 数量=${springYanyu.length}（期望 25）`);
  const springBad = springYanyu.filter(q => q.module !== 'yanyu');
  if (springBad.length) fail(`2010 春季 Q36-Q60 仍有非言语题：${springBad.map(q => q.id).join(', ')}`);

  const y424Yanyu = y424.questions.filter(q => q.num <= 40);
  const y424Bad = y424Yanyu.filter(q => q.module !== 'yanyu');
  if (y424Yanyu.length !== 40 || y424Bad.length) {
    fail(`2011 424 Q1-Q40 言语数量=${y424Yanyu.length}，异常=${y424Bad.map(q => q.id).join(', ')}`);
  }

  const y917Changshi = y917.questions.filter(q => q.num >= 1 && q.num <= 20);
  if (y917Changshi.length !== 20) fail(`2011 917 Q1-Q20 数量=${y917Changshi.length}（期望 20）`);
  const y917Bad = y917Changshi.filter(q => q.module !== 'changshi');
  if (y917Bad.length) fail(`2011 917 Q1-Q20 仍有非常识题：${y917Bad.map(q => q.id).join(', ')}`);

  const q917 = y917.questions.find(q => q.num === 2);
  const q424 = y424.questions.find(q => q.num === 2);
  if (!q917 || !q424) fail('找不到 2011 两卷 Q2');
  if (!String(q917.explanation || '').trim()) fail('2011 917 Q2 解析为空');
  if (norm(q917.explanation) === norm(q424.explanation)) fail('2011 917 Q2 仍与 424 言语解析相同');
  if (!/常识|行政|外交|法律|正确|错误|答案/.test(String(q917.explanation))) {
    fail('2011 917 Q2 解析不像常识解析');
  }

  return {
    springYanyu,
    y917Changshi,
    q917,
    q424,
    checks: [
      `2010 春季 Q36-Q60 → yanyu：${springYanyu.length}/25`,
      `2011 424 Q1-Q40 → yanyu：${y424Yanyu.length}/40`,
      `2011 917 Q1-Q20 → changshi：${y917Changshi.length}/20`,
      `2011 917 Q2 解析已与 424 分离：${compact(q917.explanation, 30)}`,
      `2012 421 / 915 各 120 题且 ID 唯一：${y421.questions.length}/${y915.questions.length}`,
    ],
  };
}

function mergeQuestions(before, converted) {
  const isAffected = q => isAffectedId(q.id);
  const kept = before.filter(q => !isAffected(q));
  const fresh = converted.flatMap(x => x.questions);
  const merged = [...kept, ...fresh];
  merged.sort((a, b) => {
    const ya = sourceYear(a);
    const yb = sourceYear(b);
    if (ya !== yb) return ya - yb;
    const na = sourceNum(a);
    const nb = sourceNum(b);
    if (na !== nb) return na - nb;
    return String(a.id).localeCompare(String(b.id), 'zh-CN');
  });
  return { merged, kept, fresh, isAffected };
}

function mapOldToNew(beforeAffected, fresh) {
  const oldByStem = new Map();
  for (const q of beforeAffected) {
    const key = norm(q.stem, 180);
    if (!oldByStem.has(key)) oldByStem.set(key, []);
    oldByStem.get(key).push(q);
  }
  const pairs = [];
  const usedOld = new Set();
  for (const q of fresh) {
    const key = norm(q.stem, 180);
    const list = oldByStem.get(key) || [];
    const old = list.find(x => !usedOld.has(x.id + '|' + key));
    if (!old) {
      pairs.push({ old: null, now: q });
      continue;
    }
    usedOld.add(old.id + '|' + key);
    pairs.push({ old, now: q });
  }
  const unmatchedOld = beforeAffected.filter(q => !usedOld.has(q.id + '|' + norm(q.stem, 180)));
  return { pairs, unmatchedOld };
}

function writeCsv(rows) {
  const header = [
    '修复批次', '修复前ID', '修复后ID', '修复前模块', '修复后模块',
    '题干', '修复前答案', '修复后答案', '修复前解析', '修复后解析', '动作',
  ];
  const lines = [header.map(csv).join(',')];
  for (const r of rows) {
    lines.push([
      r.batch, r.oldId, r.newId, r.oldModule, r.newModule,
      r.stem, r.oldAnswer, r.newAnswer, r.oldExplanation, r.newExplanation, r.action,
    ].map(csv).join(','));
  }
  fs.writeFileSync(REPORT_CSV, `\uFEFF${lines.join('\n')}\n`, 'utf8');
}

function buildReport(ctx) {
  const {
    before, beforeDup, beforeAffected, afterRows, afterDup, converted, verify,
    mergeStats, diffRows, mode, backupDir, written,
  } = ctx;
  const beforeStats = coverage(before);
  const afterStats = coverage(afterRows);
  const lines = [];
  lines.push('# 福建 v2 修复对照（2010 春季 / 2011 424+917 / 2012 421+915）');
  lines.push('');
  lines.push(`- 模式：**${mode}**`);
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push('- 作用域：`public/data/questions-v2-provincial/福建/`（隔离区，不碰线上 `public/data/questions/`）');
  lines.push('- 修复方式：修解析器精确规则 + 定向重转五套卷，未按关键词批量改 `module`');
  lines.push('');
  lines.push('## 1. 根因');
  lines.push('');
  lines.push('1. **2010 春季**：题本模块标题是「二、言语能力」，旧 `HEADER_RE` 只认「言语理解 / 言语理解与表达」，导致 Q36-Q60 整段留在 `changshi`。');
  lines.push('2. **2011 424 / 917、2012 421 / 915**：同一年两套卷文件名都含「联考」，旧 `parsePaperLabel` 统一返回 `联考`，于是共用 `prov-fujian-<年>-联考-*` ID；两卷答案解析也按同 label 配对，917 的常识 Q1-Q20 被挂上 424 的言语解析。报告中的 A1×19 只是这 240 组重复 ID 里最明显的一部分；2012 存在完全相同的 120 组冲突，本次按同一精确规则一并重转。');
  lines.push('');
  lines.push('## 2. 修复前账本');
  lines.push('');
  lines.push('| 指标 | 修复前 |');
  lines.push('|---|---:|');
  lines.push(`| 记录总数 | ${before.length} |`);
  lines.push(`| 唯一 ID | ${idCounts(before).size} |`);
  lines.push(`| 重复 ID 组 | ${beforeDup.length} |`);
  lines.push(`| 重复记录数 | ${beforeDup.reduce((n, [, list]) => n + list.length - 1, 0)} |`);
  lines.push(`| 答案覆盖 | ${beforeStats.answer}/${before.length}（${pct(beforeStats.answer, before.length)}） |`);
  lines.push(`| 解析覆盖 | ${beforeStats.explanation}/${before.length}（${pct(beforeStats.explanation, before.length)}） |`);
  lines.push(`| 模块分布 | ${moduleText(beforeStats.modules)} |`);
  lines.push(`| 受影响记录 | ${beforeAffected.length} |`);
  lines.push('');
  lines.push('## 3. 定向重转结果');
  lines.push('');
  lines.push('| 卷别 | 配对答案 | 题数 | 答案 | 解析 | 模块分布 |');
  lines.push('|---|---|---:|---:|---:|---|');
  for (const c of converted) {
    lines.push(`| ${c.title} | ${c.pair.answerName} | ${c.stats.total} | ${c.stats.answer} | ${c.stats.explanation} | ${moduleText(c.stats.modules)} |`);
  }
  lines.push('');
  lines.push('## 4. 修复后账本');
  lines.push('');
  lines.push('| 指标 | 修复后 |');
  lines.push('|---|---:|');
  lines.push(`| 记录总数 | ${written ? afterRows.length : mergeStats.merged.length} |`);
  lines.push(`| 唯一 ID | ${idCounts(written ? afterRows : mergeStats.merged).size} |`);
  lines.push(`| 重复 ID 组 | ${afterDup.length} |`);
  lines.push(`| 答案覆盖 | ${written ? `${afterStats.answer}/${afterRows.length}（${pct(afterStats.answer, afterRows.length)}）` : '待写入'} |`);
  lines.push(`| 解析覆盖 | ${written ? `${afterStats.explanation}/${afterRows.length}（${pct(afterStats.explanation, afterRows.length)}）` : '待写入'} |`);
  lines.push(`| 模块分布 | ${written ? moduleText(afterStats.modules) : moduleText(byModule(mergeStats.merged))} |`);
  lines.push('');
  lines.push('## 5. 2010 春季 Q36-Q60：模块标错修复');
  lines.push('');
  lines.push('| ID | 题干 | 修复前 | 修复后 |');
  lines.push('|---|---|---|---|');
  for (const q of verify.springYanyu) {
    lines.push(`| ${q.id} | ${compact(q.stem, 46)} | changshi | **yanyu** |`);
  }
  lines.push('');
  lines.push('## 6. 2011 / 2012 联考：同 ID 拆分与解析归位');
  lines.push('');
  lines.push('| 项目 | 修复前 | 修复后 |');
  lines.push('|---|---:|---:|');
  for (const year of ['2011', '2012']) {
    const oldRows = beforeAffected.filter(q => String(q.id).startsWith(`prov-fujian-${year}-`));
    const newRows = converted.filter(c => c.key.startsWith(year)).flatMap(c => c.questions);
    lines.push(`| ${year} 记录 | ${oldRows.length} | ${newRows.length} |`);
    lines.push(`| ${year} 唯一 ID | ${new Set(oldRows.map(q => q.id)).size} | ${new Set(newRows.map(q => q.id)).size} |`);
    lines.push(`| ${year} 重复 ID 组 | ${beforeDup.filter(([id]) => id.startsWith(`prov-fujian-${year}-`)).length} | 0 |`);
  }
  lines.push('');
  lines.push('### 6.1 917 常识 Q2-Q20 解析归位（A1×19）');
  lines.push('');
  lines.push('| 新 ID | 题干 | 修复前解析（424 言语，错误） | 修复后解析（917 常识，正确） |');
  lines.push('|---|---|---|---|');
  const q917Rows = verify.y917Changshi.filter(q => q.num >= 2 && q.num <= 20);
  for (const q of q917Rows) {
    const old = ctx.a1OldByNum.get(q.num);
    lines.push(`| ${q.id} | ${compact(q.stem, 36)} | ${compact(old?.explanation, 46) || '—'} | ${compact(q.explanation, 46)} |`);
  }
  lines.push('');
  lines.push('### 6.2 ID 重键');
  lines.push('');
  lines.push('- 2011 424：`prov-fujian-2011-联考-N` → `prov-fujian-2011-424联考-N`（N=1-120）。');
  lines.push('- 2011 917：`prov-fujian-2011-联考-N` → `prov-fujian-2011-917联考-N`（N=1-120）。');
  lines.push('- 2012 421：`prov-fujian-2012-联考-N` → `prov-fujian-2012-421联考-N`（N=1-120）。');
  lines.push('- 2012 915：`prov-fujian-2012-联考-N` → `prov-fujian-2012-915联考-N`（N=1-120）。');
  lines.push('- 同一年两卷 Q1-Q120 不再共享 ID；917 常识解析不再与 424 言语解析相同。');
  lines.push('');
  lines.push('## 7. 校验结果');
  lines.push('');
  lines.push('| 检查 | 结果 |');
  lines.push('|---|---|');
  for (const c of verify.checks) lines.push(`| ${c} | **通过** |`);
  lines.push(`| 修复后重复 ID 组 | **${afterDup.length === 0 ? '0，通过' : `${afterDup.length}，失败`}** |`);
  if (written) {
    lines.push(`| 分片 / index / questions.json | **${ctx.indexCheck}** |`);
    lines.push(`| 写入后目标卷模块与解析复查 | **${ctx.postCheck}** |`);
  } else {
    lines.push('| 写盘 | 未执行（dry-run） |');
  }
  lines.push('');
  lines.push('## 8. 附件与边界');
  lines.push('');
  lines.push(`- 明细对照：\`${path.relative(ROOT, REPORT_CSV).replace(/\\/g, '/')}\`（${diffRows.length} 行）`);
  lines.push(`- 修复后账本：\`${path.relative(ROOT, LEDGER_MD).replace(/\\/g, '/')}\``);
  if (backupDir) lines.push(`- 写入前备份：\`${path.relative(ROOT, backupDir).replace(/\\/g, '/')}\``);
  lines.push('- 未修改 `public/data/questions/`；未执行 git push。');
  lines.push('');
  fs.writeFileSync(REPORT_MD, lines.join('\n'), 'utf8');
  return { beforeStats, afterStats };
}

function buildLedger(ctx) {
  const { afterRows, converted, before, mode } = ctx;
  const effective = afterRows.length ? afterRows : ctx.mergeStats.merged;
  const lines = [];
  lines.push('# 福建 v2 修复后账本');
  lines.push('');
  lines.push(`- 模式：**${mode}**`);
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push('- 数据目录：`public/data/questions-v2-provincial/福建/`');
  lines.push('');
  lines.push('## 1. 总量');
  lines.push('');
  const stats = coverage(effective);
  lines.push('| 指标 | 数值 |');
  lines.push('|---|---:|');
  lines.push(`| 记录总数 | ${stats.total} |`);
  lines.push(`| 唯一 ID | ${idCounts(effective).size} |`);
  lines.push(`| 答案覆盖 | ${stats.answer}/${stats.total}（${pct(stats.answer, stats.total)}） |`);
  lines.push(`| 解析覆盖 | ${stats.explanation}/${stats.total}（${pct(stats.explanation, stats.total)}） |`);
  lines.push(`| 模块分布 | ${moduleText(stats.modules)} |`);
  lines.push('');
  lines.push('## 2. 本次重转卷');
  lines.push('');
  lines.push('| 卷别 | 题数 | 答案 | 解析 | 模块分布 |');
  lines.push('|---|---:|---:|---:|---|');
  for (const c of converted) {
    lines.push(`| ${c.title} | ${c.stats.total} | ${c.stats.answer} | ${c.stats.explanation} | ${moduleText(c.stats.modules)} |`);
  }
  lines.push('');
  lines.push('## 3. 修复前后变化');
  lines.push('');
  lines.push('| 指标 | 修复前 | 修复后 |');
  lines.push('|---|---:|---:|');
  lines.push(`| 记录总数 | ${before.length} | ${effective.length} |`);
  lines.push(`| 唯一 ID | ${idCounts(before).size} | ${idCounts(effective).size} |`);
  lines.push(`| 重复 ID 组 | ${ctx.beforeDup.length} | ${ctx.afterDup.length} |`);
  lines.push('| 2010 春季 Q36-Q60 言语题 | 0/25 | 25/25 |');
  lines.push('| 2011 917 常识 Q1-Q20 | 20/20（解析串 424） | 20/20（解析归位） |');
  lines.push('');
  lines.push('## 4. 结论');
  lines.push('');
  lines.push('- 福建 v2 重复 ID 已清零；2011 两套联考可按 `424联考 / 917联考`、2012 两套可按 `421联考 / 915联考` 独立加载。');
  lines.push('- 2010 春季 Q36-Q60 已迁回言语模块。');
  lines.push('- 本次福建修复未写线上题库；线上 `public/data/questions/` 仅有浙江 apply 变更。如需上线福建，需另走 publish-merge 流程。');
  lines.push('');
  fs.writeFileSync(LEDGER_MD, lines.join('\n'), 'utf8');
}

function backupDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_ROOT, `backup-fujian-v2-${stamp}`);
  fs.cpSync(DIR, dir, { recursive: true });
  return dir;
}

function verifyFiles(expectedCount) {
  const index = readJson(path.join(DIR, 'index.json'));
  const actual = fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !SPECIAL.has(f)).sort();
  const referenced = Object.values(index).flat().sort();
  const missing = referenced.filter(f => !actual.includes(f));
  const extra = actual.filter(f => !referenced.includes(f));
  if (missing.length || extra.length) fail(`index 覆盖失败 missing=${missing.join(',')} extra=${extra.join(',')}`);
  const aggregate = readJson(path.join(DIR, 'questions.json'));
  if (!Array.isArray(aggregate) || aggregate.length !== expectedCount) {
    fail(`questions.json 题数=${aggregate?.length}（期望 ${expectedCount}）`);
  }
  const shardRows = readShards().rows;
  if (shardRows.length !== expectedCount) fail(`分片题数=${shardRows.length}（期望 ${expectedCount}）`);
  const dup = duplicateGroups(shardRows);
  if (dup.length) fail(`写入后仍有重复 ID：${dup.slice(0, 5).map(([id]) => id).join(', ')}`);
  return `index ${Object.keys(index).length} keys / ${actual.length} 分片 / questions.json ${aggregate.length} 题`;
}

function postCheck() {
  const rows = readShards().rows;
  const spring = rows.filter(q => String(q.id).startsWith('prov-fujian-2010-春季-') && sourceNum(q) >= 36 && sourceNum(q) <= 60);
  if (spring.length !== 25 || spring.some(q => q.module !== 'yanyu')) fail('写入后 2010 春季 Q36-Q60 复查失败');
  const q917 = rows.find(q => q.id === 'prov-fujian-2011-917联考-2');
  const q424 = rows.find(q => q.id === 'prov-fujian-2011-424联考-2');
  if (!q917 || !q424) fail('写入后找不到 2011 两卷 Q2');
  if (norm(q917.explanation) === norm(q424.explanation)) fail('写入后 917 Q2 仍与 424 同解析');
  if (!/常识|行政|外交|法律|正确|错误|答案/.test(String(q917.explanation))) fail('写入后 917 Q2 解析异常');
  return '通过';
}

(async () => {
  const beforeData = readShards();
  const before = beforeData.rows;
  const beforeDup = duplicateGroups(before);
  const beforeAffected = before.filter(q => isAffectedId(q.id));

  const { converted } = await convertTargets();
  const verify = verifyConverted(converted);
  const mergeStats = mergeQuestions(before, converted);
  const mergedDup = duplicateGroups(mergeStats.merged);
  if (mergedDup.length) {
    fail(`合并后仍有重复 ID：${mergedDup.slice(0, 10).map(([id, list]) => `${id}x${list.length}`).join(', ')}`);
  }

  const old2011 = beforeAffected.filter(q => String(q.id).startsWith('prov-fujian-2011-'));
  const mapping = mapOldToNew(beforeAffected, mergeStats.fresh);
  const diffRows = [];
  for (const { old, now } of mapping.pairs) {
    const batch = batchOf(now.id);
    let action = '重转';
    if (batch === '2010-春季' && old && old.module !== now.module) action = `module:${old.module}→${now.module}`;
    if (batch.startsWith('2011') || batch.startsWith('2012')) {
      action = old && old.id !== now.id ? 'ID重键+解析重挂' : '重转';
    }
    diffRows.push({
      batch,
      oldId: old?.id || '—',
      newId: now.id,
      oldModule: old?.module || '—',
      newModule: now.module,
      stem: compact(now.stem, 80),
      oldAnswer: old?.answer || '',
      newAnswer: now.answer || '',
      oldExplanation: compact(old?.explanation, 160),
      newExplanation: compact(now.explanation, 160),
      action,
    });
  }
  for (const q of mapping.unmatchedOld) {
    diffRows.push({
      batch: '未匹配旧记录', oldId: q.id, newId: '—', oldModule: q.module, newModule: '—',
      stem: compact(q.stem, 80), oldAnswer: q.answer || '', newAnswer: '',
      oldExplanation: compact(q.explanation, 160), newExplanation: '', action: '未匹配',
    });
  }

  const a1OldByNum = new Map();
  for (const q of old2011.filter(x => x.module === 'changshi' && sourceNum(x) >= 2 && sourceNum(x) <= 20)) {
    a1OldByNum.set(sourceNum(q), q);
  }

  let backup = null;
  let afterRows = [];
  let afterDup = duplicateGroups(mergeStats.merged);
  let indexCheck = '未写入';
  let written = false;
  let post = '未写入';

  if (APPLY) {
    backup = backupDir();
    writeProvinceShards('福建', 'fujian', mergeStats.merged);
    written = true;
    afterRows = readShards().rows;
    afterDup = duplicateGroups(afterRows);
    indexCheck = verifyFiles(mergeStats.merged.length);
    post = postCheck();
  }

  const mode = APPLY ? 'APPLIED（已写入隔离区）' : 'DRY-RUN（未写入）';
  const ctx = {
    before, beforeDup, beforeAffected, afterRows, afterDup, converted, verify,
    mergeStats, diffRows, mode, backupDir: backup, written, indexCheck,
    postCheck: post, a1OldByNum,
  };
  writeCsv(diffRows);
  buildReport(ctx);
  buildLedger(ctx);

  console.log(`[repair-fujian] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`  修复前：${before.length} 题 / 唯一 ID ${idCounts(before).size} / 重复组 ${beforeDup.length} / 受影响 ${beforeAffected.length}`);
  for (const c of converted) {
    console.log(`  ${c.title}: ${c.stats.total} 题，答案 ${c.stats.answer}，解析 ${c.stats.explanation}，${moduleText(c.stats.modules)}`);
  }
  console.log(`  修复后：${(written ? afterRows : mergeStats.merged).length} 题 / 唯一 ID ${idCounts(written ? afterRows : mergeStats.merged).size} / 重复组 ${afterDup.length}`);
  if (written) {
    console.log(`  已写入：${path.relative(ROOT, DIR)}`);
    console.log(`  校验：${indexCheck}；${post}`);
    console.log(`  备份：${path.relative(ROOT, backup)}`);
  } else {
    console.log('  dry-run 未写入；加 --apply 执行。');
  }
  console.log(`  报告：${path.relative(ROOT, REPORT_MD)}`);
  console.log(`  账本：${path.relative(ROOT, LEDGER_MD)}`);
  console.log(`  明细：${path.relative(ROOT, REPORT_CSV)}`);
})().catch(err => {
  console.error('[repair-fujian] 失败：', err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
