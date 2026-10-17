/**
 * 修复 stem 为空的题目：从 title 中按 "A、/A./A．/A /A)" 等变体拆出选项重建 options，
 * title 剩余部分回填 stem；拆不了的记录到 repair_failed.csv。
 *
 * 默认 dry-run（只生成报告，不修改题库文件）。
 * 写回数据：node scripts/repair-empty-stem.cjs --apply
 *
 * 输出：
 *   repair_report.csv   全部 38 条的逐条处理结果（含 status / 新 stem / 新 options）
 *   repair_failed.csv   修复失败的题目清单
 *   repair_success.csv  修复成功的题目清单
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const ROOT = path.join(__dirname, '..');
const APPLY = process.argv.includes('--apply');

const OUT_REPORT = path.join(ROOT, 'repair_report.csv');
const OUT_FAILED = path.join(ROOT, 'repair_failed.csv');
const OUT_SUCCESS = path.join(ROOT, 'repair_success.csv');

const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

function csvEscape(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return '"' + s.replace(/"/g, '""').replace(/\r?\n/g, '\\n') + '"';
}

/**
 * 在文本中定位选项标记（A、/A./A．/A /A)/A：/A:），要求标记前是行首、空白或分隔符（·・:：），
 * 避免把英文单词里的字母误判为选项。
 * 返回 [{key, start, end}]，按出现顺序且 key 必须递增（A→B→C…）。
 */
function findMarkers(text) {
  const found = [];
  let searchFrom = 0;
  for (const key of KEYS) {
    const re = new RegExp(`(^|[\\s\\u3000·・:：])${key}\\s*(?:[、.．:：)）]|(?=\\s))`, 'g');
    re.lastIndex = searchFrom;
    const m = re.exec(text);
    if (!m) break;
    const markerStart = m.index + m[1].length; // 跳过前置分隔符
    const markerEnd = m.index + m[0].length;
    found.push({ key, start: markerStart, end: markerEnd });
    searchFrom = markerEnd;
  }
  return found;
}

/** 清理选项文本：去掉残留的前导标点/空白 */
function cleanOptionText(t) {
  return String(t || '')
    .replace(/^[\s\u3000、.．:：)）]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 从 title 拆分选项并回填 stem。
 * title 形如 "数量·A、16 B、27 C、38 D、49"
 * 返回 { ok, stem, options, reason }
 */
function repairFromTitle(q) {
  const title = typeof q.title === 'string' ? q.title : '';
  if (!title.trim()) return { ok: false, reason: 'title 为空' };

  const markers = findMarkers(title);
  if (markers.length < 2) {
    return { ok: false, reason: `title 中未找到至少 2 个选项标记（找到 ${markers.length} 个）` };
  }

  // 选项区之前的文本 = 题干
  const stemPart = title.slice(0, markers[0].start).trim();
  // 去掉 "数量·" / "判断·" / "常识·" 这类模块前缀
  const stem = stemPart.replace(/^(数量|判断|常识|言语|资料|申论|公基)\s*[·・:：]\s*/, '').trim();

  const options = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const raw = title.slice(cur.end, next ? next.start : title.length);
    options.push({ key: cur.key, text: cleanOptionText(raw) });
  }

  // 校验：选项文本不能为空
  const emptyOpts = options.filter(o => !o.text);
  if (emptyOpts.length > 0) {
    return {
      ok: false,
      reason: `选项 ${emptyOpts.map(o => o.key).join('/')} 文本为空`,
      stem,
      options
    };
  }

  // 校验：选项文本里不应再含选项标记（说明拆分错位）
  for (const o of options) {
    if (findMarkers(o.text).length > 0) {
      return { ok: false, reason: `选项 ${o.key} 内仍含选项标记，拆分错位`, stem, options };
    }
  }

  // 校验：题干不能为空（题干原始数据已丢失的情况）
  if (!stem) {
    return {
      ok: false,
      reason: '题干为空（title 中只有选项，题干原始数据已丢失）',
      stem,
      options
    };
  }

  return { ok: true, stem, options };
}

function main() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'idMap.json')
    .sort();

  const report = [];
  const failed = [];
  const success = [];
  const fileChanges = {}; // file -> Map(index -> newQuestion)

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
    } catch (e) {
      console.error(`[解析失败] ${file}: ${e.message}`);
      continue;
    }
    if (!Array.isArray(data)) continue;

    data.forEach((q, idx) => {
      if (!q || typeof q !== 'object') return;
      const stem = typeof q.stem === 'string' ? q.stem : '';
      if (stem.trim() !== '') return; // 只处理空 stem

      const res = repairFromTitle(q);
      const row = {
        file,
        index: idx,
        id: q.id || '',
        module: q.module || '',
        title: q.title || '',
        oldOptions: JSON.stringify(q.options || null),
        status: res.ok ? 'FIXED' : 'FAILED',
        reason: res.reason || '',
        newStem: res.stem || '',
        newOptions: res.options ? JSON.stringify(res.options) : ''
      };
      report.push(row);
      if (res.ok) {
        success.push(row);
        if (!fileChanges[file]) fileChanges[file] = new Map();
        fileChanges[file].set(idx, { ...q, stem: res.stem, options: res.options });
      } else {
        failed.push(row);
      }
    });
  }

  const header = ['file', 'index', 'id', 'module', 'title', 'oldOptions', 'status', 'reason', 'newStem', 'newOptions'];
  const toCsv = rows => [header.join(',')].concat(rows.map(r => header.map(h => csvEscape(r[h])).join(','))).join('\r\n');

  fs.writeFileSync(OUT_REPORT, '\uFEFF' + toCsv(report), 'utf8');
  fs.writeFileSync(OUT_FAILED, '\uFEFF' + toCsv(failed), 'utf8');
  fs.writeFileSync(OUT_SUCCESS, '\uFEFF' + toCsv(success), 'utf8');

  console.log('===== 修复结果（' + (APPLY ? 'APPLY 写回' : 'DRY-RUN 仅报告') + '）=====');
  console.log(`空 stem 题目总数: ${report.length}`);
  console.log(`可修复(FIXED): ${success.length}`);
  console.log(`修复失败(FAILED): ${failed.length}`);
  console.log('\n-- 失败原因分布 --');
  const reasons = {};
  failed.forEach(r => {
    const k = r.reason.replace(/选项 [A-F\/]+ 文本为空/, '选项文本为空');
    reasons[k] = (reasons[k] || 0) + 1;
  });
  Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v} 条: ${k}`));

  if (APPLY) {
    let changedFiles = 0;
    for (const [file, map] of Object.entries(fileChanges)) {
      const filePath = path.join(DATA_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [idx, nq] of map) data[idx] = nq;
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      changedFiles++;
    }
    console.log(`\n已写回 ${changedFiles} 个分片文件。`);
  } else {
    console.log('\n（dry-run，未修改任何题库文件；确认后加 --apply 写回）');
  }
  console.log(`\n报告: ${OUT_REPORT}\n成功: ${OUT_SUCCESS}\n失败: ${OUT_FAILED}`);
}

main();
