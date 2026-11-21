#!/usr/bin/env node
/**
 * 空选项图推题：补全 options 为 4 个 A/B/C/D 占位选项
 *
 * 第一阶段纪律（2026-11-21）：
 *   - 默认 dry-run，只盘点 + 输出清单，不写任何文件；
 *   - 只有 options 为空数组/缺失 且 imageUrl 指向的图片文件真实存在 的题才进入候选；
 *   - docs/图推配图补录清单-2026-11-16.md 里的缺口题（28 题）一律不动；
 *   - 只补 options 这一个字段，其余字段、字段顺序、缩进、文件末尾换行保持原样。
 *
 * 写回格式（与既有题完全一致）：
 *   questions 的 options 元素统一是 { key, text } 对象，字符串数组会让前端
 *   PracticeArena 的 opt.key / opt.text 渲染直接失效。既有的「图形推理 + 已配图」
 *   题（gk-2003-A卷-22 / gk-2005-一卷-54 / gk-2005-二卷-54 / gk-2006-一卷-55，共 4 题）
 *   全部写作 [{"key":"A","text":""}, ...]，因此默认 --text-mode=empty 与之对齐；
 *   --text-mode=key 会写 text:"A"（对齐 2022–2024 非配图批次的 380 道图推题）。
 *
 * 用法：
 *   node scripts/fill-figure-options.cjs                      # dry-run（默认）
 *   node scripts/fill-figure-options.cjs --dry-run
 *   node scripts/fill-figure-options.cjs --year 2010          # 只盘点某年
 *   node scripts/fill-figure-options.cjs --only gk-2010-未标注-58,gk-2010-未标注-59
 *   node scripts/fill-figure-options.cjs --text-mode key      # text 写 "A" 而不是 ""
 *   node scripts/fill-figure-options.cjs --scope image        # 不限 subModule=图形推理
 *   node scripts/fill-figure-options.cjs --apply              # 落盘（审完清单再执行）
 *
 * 输出：
 *   - 控制台：模块×年份统计、112 道候选逐题清单、缺口清单核对、WARN/ERROR
 *   - scripts/out/fill-figure-options-<日期>-<dryrun|apply>.txt   完整报告（UTF-8）
 *   - scripts/out/fill-figure-options-<日期>-<dryrun|apply>.csv   全部空选项题逐题明细（UTF-8 BOM，Excel 可开）
 *     （带 --year / --only 时文件名追加 -yearXXXX / -onlyN，避免覆盖全量报告）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hasStemOptionMark } = require('./lib/stem-option-mark.cjs');

const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_DIR = path.join(ROOT, 'public', 'data', 'questions');
const PUBLIC_DIR = path.join(ROOT, 'public');
const INDEX_FILE = path.join(QUESTIONS_DIR, 'index.json');
const DEFAULT_GAPS = path.join(ROOT, 'docs', '图推配图补录清单-2026-11-16.md');
const OUT_DIR = path.join(ROOT, 'scripts', 'out');
const TARGET_KEYS = ['A', 'B', 'C', 'D'];
const DATE = new Date().toLocaleDateString('sv-SE');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply') && !argv.includes('--dry-run');

function argValue(name, fallback) {
  const hit = argv.find((item) => item === `--${name}` || item.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const idx = argv.indexOf(hit);
  const inline = hit.includes('=') ? hit.split('=').slice(1).join('=') : null;
  return inline !== null ? inline : argv[idx + 1] || fallback;
}

const YEAR_FILTER = argValue('year', null);
const ONLY_IDS = (argValue('only', null) || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TEXT_MODE = argValue('text-mode', 'empty');
const SCOPE = argValue('scope', 'figure');
const GAPS_FILE = argValue('gaps', DEFAULT_GAPS);

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function yearOf(id) {
  const m = /(?:^|-)((?:19|20)\d{2})(?=-|$)/.exec(String(id));
  return m ? Number(m[1]) : null;
}

function numberOf(id) {
  const m = /-(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : null;
}

function paperOf(id) {
  const parts = String(id).split('-');
  const idx = parts.findIndex((p) => /^(?:19|20)\d{2}$/.test(p));
  return idx < 0 ? '' : parts.slice(idx + 1, -1).join('-');
}

function targetOptions() {
  return TARGET_KEYS.map((key) => ({ key, text: TEXT_MODE === 'key' ? key : '' }));
}

function matchesTarget(q) {
  const opts = q && q.options;
  if (!Array.isArray(opts) || opts.length !== TARGET_KEYS.length) return false;
  return opts.every((opt, i) => {
    if (!opt || typeof opt !== 'object') return false;
    const expectedText = TEXT_MODE === 'key' ? TARGET_KEYS[i] : '';
    return opt.key === TARGET_KEYS[i] && typeof opt.text === 'string' && opt.text === expectedText;
  });
}

// ------------------------------------------------------------ 读题库（分片）

function readIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    fail(`找不到题库索引：${rel(INDEX_FILE)}`);
    return null;
  }
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${rel(INDEX_FILE)} 不是合法 JSON：${err.message}`);
    return null;
  }
}

function listShards(index) {
  const names = [];
  const seen = new Set();
  for (const key of Object.keys(index)) {
    const list = Array.isArray(index[key]) ? index[key] : [];
    for (const name of list) {
      if (typeof name !== 'string' || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names.sort();
}

// ------------------------------------------------------------ 缺口清单

function parseGapRegistry(file) {
  if (!fs.existsSync(file)) {
    fail(`找不到缺口清单：${rel(file)}（缺口题必须受保护，脚本拒绝在缺少清单时继续）`);
    return null;
  }
  const ids = new Map();
  let inDetail = false;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inDetail = /缺口明细/.test(line);
      continue;
    }
    if (!inDetail || !line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const label = cells[1] || '';
    const rawNum = cells[2] || '';
    if (!/^\d{1,3}$/.test(rawNum)) continue;
    const m = /^国考\s*((?:19|20)\d{2})《行测》\s*(.*)$/.exec(label);
    if (!m) continue;
    const year = Number(m[1]);
    const paperRaw = m[2].trim();
    const paper = paperRaw === '' ? '未标注' : paperRaw;
    const number = Number(rawNum);
    const id = `gk-${year}-${paper}-${number}`;
    if (!ids.has(id)) ids.set(id, { id, year, paper, number });
  }
  if (!ids.size) fail(`缺口清单里没有解析出任何题号：${rel(file)}`);
  return ids;
}

// ------------------------------------------------------------ 主流程

function main() {
  if (!['empty', 'key'].includes(TEXT_MODE)) {
    fail(`--text-mode 只支持 empty / key（当前 ${TEXT_MODE}）`);
  }
  if (!['figure', 'image'].includes(SCOPE)) {
    fail(`--scope 只支持 figure / image（当前 ${SCOPE}）`);
  }

  const index = readIndex();
  if (!index) return summary(null);
  const gaps = parseGapRegistry(GAPS_FILE);
  if (!gaps) return summary(null);

  const shards = new Map();
  const entries = [];
  const idSeen = new Map();
  for (const file of listShards(index)) {
    const full = path.join(QUESTIONS_DIR, file);
    if (!fs.existsSync(full)) {
      fail(`索引引用的分片不存在：${file}`);
      continue;
    }
    const raw = fs.readFileSync(full, 'utf8');
    let arr;
    try {
      arr = JSON.parse(raw);
    } catch (err) {
      fail(`${file} 不是合法 JSON：${err.message}`);
      continue;
    }
    if (!Array.isArray(arr)) {
      fail(`${file} 顶层不是数组，跳过`);
      continue;
    }
    shards.set(file, { raw, arr });
    for (const q of arr) {
      if (!q || typeof q !== 'object' || typeof q.id !== 'string') continue;
      if (idSeen.has(q.id)) {
        fail(`题目 id 重复：${q.id}（${idSeen.get(q.id)} 与 ${file}）`);
        continue;
      }
      idSeen.set(q.id, file);
      entries.push({ q, file });
    }
  }

  // ---- 统计 options 为空/缺失 ----
  const stats = { total: entries.length, empty: 0, emptyArray: 0, missingField: 0, withUrl: 0, withoutUrl: 0 };
  const groups = new Map();
  const rows = [];

  for (const { q, file } of entries) {
    const opts = q.options;
    if (Array.isArray(opts) && opts.length > 0) continue;
    const missingField = !Array.isArray(opts);
    const imageUrl = typeof q.imageUrl === 'string' && q.imageUrl.trim() !== '' ? q.imageUrl.trim() : null;
    const module = q.module || '(无模块)';
    const year = yearOf(q.id);
    const subModule = q.subModule || '(无子模块)';

    stats.empty += 1;
    if (missingField) stats.missingField += 1;
    else stats.emptyArray += 1;
    if (imageUrl) stats.withUrl += 1;
    else stats.withoutUrl += 1;

    const gkey = `${module}|${year === null ? '(无年份)' : year}`;
    const g = groups.get(gkey) || { module, year, total: 0, withUrl: 0 };
    g.total += 1;
    if (imageUrl) g.withUrl += 1;
    groups.set(gkey, g);

    rows.push({
      id: q.id,
      year,
      module,
      subModule,
      number: numberOf(q.id),
      paper: paperOf(q.id),
      file,
      optionsState: missingField ? 'options 字段缺失' : 'options=[]',
      imageUrl,
      isImageQuestion: q.isImageQuestion === true,
      answer: q.answer ?? '',
      action: 'skip',
      reason: '',
      q,
    });
  }

  // ---- 逐题判定 ----
  const changes = [];
  const skipped = {};
  const skip = (row, reason) => {
    row.action = 'skip';
    row.reason = reason;
    skipped[reason] = (skipped[reason] || 0) + 1;
  };

  for (const row of rows) {
    const { q } = row;
    if (YEAR_FILTER && String(row.year) !== String(YEAR_FILTER)) {
      skip(row, '筛选外（--year）');
      continue;
    }
    if (ONLY_IDS.length && !ONLY_IDS.includes(row.id)) {
      skip(row, '筛选外（--only）');
      continue;
    }
    if (gaps.has(row.id)) {
      row.action = 'skip';
      row.reason = '缺口清单保护（清单一律不动）';
      skipped[row.reason] = (skipped[row.reason] || 0) + 1;
      if (row.imageUrl) {
        fail(`${row.id} 在缺口清单里却已带 imageUrl（${row.imageUrl}）→ 清单与题库不一致，先刷新清单再补选项`);
      }
      continue;
    }
    if (!row.imageUrl) {
      skip(row, '无 imageUrl');
      continue;
    }
    const diskPath = path.join(PUBLIC_DIR, row.imageUrl.replace(/^[\\/]+/, ''));
    if (!fs.existsSync(diskPath)) {
      row.action = 'error';
      row.reason = '图片文件不存在';
      fail(`${row.id} 的 imageUrl 指向的文件不存在：public${row.imageUrl}`);
      continue;
    }
    if (fs.statSync(diskPath).size === 0) {
      row.action = 'error';
      row.reason = '图片文件为空';
      fail(`${row.id} 的图片是空文件：public${row.imageUrl}`);
      continue;
    }
    if (row.isImageQuestion !== true) {
      warn(`${row.id} 有配图但 isImageQuestion 不是 true，跳过（先补标记再补选项）`);
      skip(row, '非图片题（isImageQuestion≠true）');
      continue;
    }
    if (SCOPE === 'figure' && row.subModule !== '图形推理') {
      warn(`${row.id} subModule=${row.subModule}（非图形推理），跳过（--scope image 可放开）`);
      skip(row, `非图形推理（${row.subModule}）`);
      continue;
    }
    if (!/^[A-D]$/.test(String(row.answer))) {
      warn(`${row.id} answer=${JSON.stringify(row.answer)} 不是单个 A–D，跳过`);
      skip(row, '答案不是单个 A–D');
      continue;
    }
    if (matchesTarget(q)) {
      row.action = 'unchanged';
      row.reason = '已是目标格式（幂等）';
      changes.push(row);
      continue;
    }

    const stem = typeof q.stem === 'string' ? q.stem : '';
    const target = targetOptions();
    if (hasStemOptionMark(stem, []) && !hasStemOptionMark(stem, target)) {
      warn(
        `${row.id} 写回 4 个选项后，validate-questions.cjs 的 E07（题干残留 A/B/C/D 选项标记）` +
          '会因 options.length>=2 被豁免，校验器将不再报此题 —— 请人工确认题干',
      );
    }

    row.action = 'write';
    row.reason = 'options 空 + 图片存在';
    changes.push(row);
  }

  // ---- 落盘（仅 --apply 且无 ERROR） ----
  const writes = changes.filter((r) => r.action === 'write');
  const touchFiles = [...new Set(writes.map((r) => r.file))].sort();
  let writtenFiles = 0;
  let writtenQuestions = 0;

  if (APPLY && errors.length === 0) {
    const writeById = new Map(writes.map((r) => [r.id, r]));
    for (const file of touchFiles) {
      const { raw, arr } = shards.get(file);
      let dirty = 0;
      for (const q of arr) {
        if (!q || !writeById.has(q.id)) continue;
        q.options = targetOptions();
        dirty += 1;
      }
      if (!dirty) continue;
      const ending = raw.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(path.join(QUESTIONS_DIR, file), JSON.stringify(arr, null, 2) + ending, 'utf8');
      writtenFiles += 1;
      writtenQuestions += dirty;
    }
  }

  return summary({
    stats,
    groups,
    rows,
    changes,
    writes,
    touchFiles,
    skipped,
    gaps,
    writtenFiles,
    writtenQuestions,
    shardCount: shards.size,
  });
}



// ------------------------------------------------------------ 报告

function summary(result) {
  const lines = [];
  const out = (s = '') => lines.push(s);

  out('== 空选项图推题补全 options ==');
  out(`模式         : ${APPLY ? 'apply（落盘）' : 'dry-run（只读，未写任何文件）'}`);
  out('题库口径     : public/data/questions/index.json（分片题库，无单一 questions.json）');
  out(`缺口清单     : ${rel(GAPS_FILE)}（${result ? result.gaps.size : '0'} 题，一律不动）`);
  out(
    '写回范围     : options 为空 + imageUrl 指向的图片真实存在 + isImageQuestion=true' +
      (SCOPE === 'figure' ? ' + subModule=图形推理' : ''),
  );
  out(`写回格式     : ${JSON.stringify(targetOptions())}`);
  if (YEAR_FILTER) out(`年份筛选     : ${YEAR_FILTER}`);
  if (ONLY_IDS.length) out(`题目筛选     : ${ONLY_IDS.join(', ')}`);
  out('');

  if (result) {
    const { stats, groups, rows, writes, touchFiles, skipped, shardCount } = result;

    out('-- 一、总览 --');
    out(`分片数               : ${num(shardCount)}`);
    out(`题目总数（id 去重）  : ${num(stats.total)}`);
    out(`options 为空/缺失    : ${num(stats.empty)}（空数组 ${num(stats.emptyArray)}、字段缺失 ${num(stats.missingField)}）`);
    out(`  有 imageUrl        : ${num(stats.withUrl)}`);
    out(`  无 imageUrl        : ${num(stats.withoutUrl)}`);
    out('');

    const groupRows = [...groups.values()].sort((a, b) => {
      if (a.module !== b.module) return a.module.localeCompare(b.module);
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return a.year - b.year;
    });
    out('-- 二、options 为空/缺失：模块 × 年份 --');
    out('| 模块 | 年份 | 空选项题数 | 有 imageUrl | 无 imageUrl |');
    out('|---|---|---:|---:|---:|');
    for (const g of groupRows) {
      out(`| ${g.module} | ${g.year === null ? '(无年份)' : g.year} | ${g.total} | ${g.withUrl} | ${g.total - g.withUrl} |`);
    }
    out(`| **合计** | | **${stats.empty}** | **${stats.withUrl}** | **${stats.withoutUrl}** |`);
    out('');

    const withUrlRows = rows.filter((r) => r.imageUrl);
    const bySub = new Map();
    for (const r of withUrlRows) {
      const k = `${r.module}/${r.subModule}`;
      bySub.set(k, (bySub.get(k) || 0) + 1);
    }
    out(`-- 三、有 imageUrl 的空选项题：模块/子模块（${withUrlRows.length} 题）--`);
    for (const [k, v] of [...bySub.entries()].sort()) out(`  ${k}  ${v}`);
    out('');

    out(`-- 四、逐题盘点：有 imageUrl 的空选项题（${withUrlRows.length} 题）--`);
    out('序号  id                           年份  模块/子模块     题号  判定                        imageUrl');
    withUrlRows.forEach((r, i) => {
      const label = r.action === 'write' ? '将写回' : r.action === 'skip' ? `跳过：${r.reason}` : r.action;
      out(
        `${String(i + 1).padStart(3)}  ${r.id.padEnd(28)} ${String(r.year ?? '-').padEnd(5)} ` +
          `${`${r.module}/${r.subModule}`.padEnd(15)} ${String(r.number ?? '-').padEnd(4)} ${label.padEnd(26)} ${r.imageUrl}`,
      );
    });
    out('');


    const byId = new Map(rows.map((r) => [r.id, r]));
    const missingInBank = [];
    out(`-- 五、缺口清单核对（${result.gaps.size} 题，一律不动）--`);
    const gapList = [...result.gaps.values()].sort(
      (a, b) => a.year - b.year || a.paper.localeCompare(b.paper) || a.number - b.number,
    );
    for (const gap of gapList) {
      const row = byId.get(gap.id);
      if (!row) {
        missingInBank.push(gap.id);
        out(`  ${gap.id}  题库中未找到该 id（清单与题库不一致）`);
        continue;
      }
      if (row.imageUrl) {
        out(`  ${gap.id}  已带 imageUrl（${row.imageUrl}）← 清单过期，请先刷新清单`);
        continue;
      }
      out(`  ${gap.id}  无 imageUrl、options 空 → 保护跳过`);
    }
    if (missingInBank.length) {
      warn(
        `缺口清单里有 ${missingInBank.length} 题在题库中找不到：` +
          `${missingInBank.slice(0, 5).join(', ')}${missingInBank.length > 5 ? ' …' : ''}`,
      );
    }
    out('');

    out(`-- 六、将改动清单（${writes.length} 题）--`);
    out('状态    id                           年份  模块/子模块     题号  分片                            options 变化');
    for (const r of writes) {
      out(
        `  ${'将写回'}  ${r.id.padEnd(28)} ${String(r.year ?? '-').padEnd(5)} ` +
          `${`${r.module}/${r.subModule}`.padEnd(15)} ${String(r.number ?? '-').padEnd(4)} ` +
          `${r.file.padEnd(31)} ${r.optionsState} → ${JSON.stringify(targetOptions())}`,
      );
    }
    out(`合计：${writes.length} 题，涉及分片 ${touchFiles.length} 个`);
    for (const f of touchFiles) out(`  ${f}  ${writes.filter((r) => r.file === f).length} 题`);
    out('');

    out('-- 七、跳过统计 --');
    for (const k of Object.keys(skipped).sort()) out(`  ${k}  ${skipped[k]}`);
    out('  说明：「无 imageUrl」为正常缺口，前端走 MissingFigurePlaceholder，不在本批范围。');
    out('');
  }


  if (warnings.length) {
    out(`-- WARN（${warnings.length}）--`);
    warnings.forEach((item) => out(`  ! ${item}`));
    out('');
  }
  if (errors.length) {
    out(`-- ERROR（${errors.length}）--`);
    errors.forEach((item) => out(`  ✗ ${item}`));
    out('');
  }

  const suffix = [APPLY ? 'apply' : 'dryrun', YEAR_FILTER ? `year${YEAR_FILTER}` : '', ONLY_IDS.length ? `only${ONLY_IDS.length}` : '']
    .filter(Boolean)
    .join('-');
  const baseName = `fill-figure-options-${DATE}-${suffix}`;
  const txtPath = path.join(OUT_DIR, `${baseName}.txt`);
  const csvPath = path.join(OUT_DIR, `${baseName}.csv`);
  out(`报告文件     : ${rel(txtPath)}`);
  out(`逐题明细 CSV : ${rel(csvPath)}（全部 ${result ? result.rows.length : 0} 道空选项题，含「是否有 imageUrl」列）`);
  out('');

  if (errors.length) {
    out('结论：存在 ERROR，未写入任何分片。');
  } else if (APPLY) {
    out(`结论：通过，已写入 ${result.writtenFiles} 个分片、${result.writtenQuestions} 道题的 options（只改这一个字段）。`);
  } else {
    out(`结论：dry-run 通过（未写任何文件）。加 --apply 落盘；本批将改动 ${result ? result.writes.length : 0} 题。`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csvHead = 'id,年份,模块,子模块,题号,分片,options状态,是否有imageUrl,imageUrl,判定,说明';
  const csvRows = result
    ? result.rows.map((r) =>
        [
          r.id,
          r.year ?? '',
          r.module,
          r.subModule,
          r.number ?? '',
          r.file,
          r.optionsState,
          r.imageUrl ? '是' : '否',
          r.imageUrl ?? '',
          r.action,
          r.reason,
        ]
          .map(esc)
          .join(','),
      )
    : [];
  fs.writeFileSync(txtPath, lines.join('\n') + '\n', 'utf8');
  fs.writeFileSync(csvPath, '\uFEFF' + [csvHead, ...csvRows].join('\n') + '\n', 'utf8');

  process.stdout.write(lines.join('\n') + '\n');
  return errors.length ? 1 : 0;
}

process.exit(main());

