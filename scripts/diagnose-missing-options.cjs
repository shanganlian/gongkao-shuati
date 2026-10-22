/**
 * 定向诊断：天津 / 深圳 / 广东「缺选项」被跳过题的成因归类
 *
 * 目的：判定跳过是「图片题漏标 isImageQuestion」（补标记即可）还是
 * 「选项被并进材料 / 题干」的转换 bug（需修 splitStemAndOptions）。
 *
 * 用法：node scripts/diagnose-missing-options.cjs
 * 报告：guokao-reports/缺选项诊断-天津深圳广东.md
 */
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data', 'questions');
const OUT = path.join(__dirname, '..', 'guokao-reports', '缺选项诊断-天津深圳广东.md');
const PROVINCES = ['天津', '深圳', '广东'];
const SUBJECTIVE = ['shenlun', 'gongji'];

// 与 scripts/verify-question-loading.cjs 的 getInvalidReason 保持一致
function getInvalidReason(q) {
  if (!q || typeof q !== 'object') return '题目对象为空';
  if (typeof q.stem !== 'string' || q.stem.trim() === '') return '题干为空';
  if (!SUBJECTIVE.includes(q.module) && q.isImageQuestion !== true) {
    if (!Array.isArray(q.options) || q.options.length === 0) return '缺少选项';
    if (q.options.length < 2) return '选项数量不足';
    if (q.options.some(o => !o || typeof o.text !== 'string' || o.text.trim() === '')) return '选项文本为空';
  }
  return null;
}

// 图片 / 图表特征词（题干）
const IMG_WORDS = [
  '图形', '图表', '如图', '下图', '上图', '所给的四个选项', '四个选项', '图形推理',
  '统计图', '折线图', '柱状图', '饼图', '示意图', '漫画', '地图', '表格', '图标',
  '展开图', '立体图', '截面', '视图', '坐标', '曲线', '趋势', '流程', 'logo',
];
// 题干里残留 A./B./C./D. 选项标记（选项被并进题干的强信号）
const INLINE_OPTS = /[（(]?\s*A\s*[.．、)）]\s*\S[\s\S]{0,300}?B\s*[.．、)）]\s*\S[\s\S]{0,300}?C\s*[.．、)）]\s*\S[\s\S]{0,300}?D\s*[.．、)）]\s*\S/;
// 材料题引导语
const MATERIAL_WORDS = ['根据以下资料', '根据以下材料', '根据上述资料', '根据上述材料', '根据所给资料', '根据材料', '阅读以下', '请根据'];

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'index.json'), 'utf8'));
const cache = new Map();
function loadChunk(f) {
  if (!cache.has(f)) cache.set(f, JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')));
  return cache.get(f);
}

function countWords(text) {
  const s = String(text || '');
  return IMG_WORDS.filter(w => s.includes(w));
}

function features(q) {
  const stem = String(q.stem || '');
  const words = countWords(stem);
  const materialText = typeof q.material === 'string' ? q.material : '';
  return {
    words,
    inline: INLINE_OPTS.test(stem),
    material: materialText.trim().length > 0,
    materialLen: materialText.length,
    materialGuide: MATERIAL_WORDS.some(w => stem.includes(w) || materialText.includes(w)),
    optCount: Array.isArray(q.options) ? q.options.length : -1,
    optionsInMaterial: INLINE_OPTS.test(materialText),
    judge: /判断题|判断正误|是否正确/.test(stem),
    stub: /^暂缺\s*$/.test(stem.trim()),
    answer: !!q.answer,
    explanationLen: String(q.explanation || '').length,
    placeholder: q.isPlaceholder === true,
  };
}

function pct(n, d) {
  return d ? ((n / d) * 100).toFixed(1) + '%' : '-';
}

function clip(s, n = 150) {
  return String(s || '').replace(/\s+/g, ' ').slice(0, n);
}

const lines = [];
const log = s => { lines.push(s); console.log(s); };

log('===== 缺选项跳过诊断：天津 / 深圳 / 广东 =====');
log('');

const all = {};
for (const province of PROVINCES) {
  const keys = Object.keys(index).filter(k => k.startsWith(`provincial-${province}-`));
  const seen = new Set();
  const rows = [];
  for (const key of keys) {
    for (const f of index[key]) {
      for (const q of loadChunk(f)) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        const reason = getInvalidReason(q);
        if (reason) rows.push({ q, reason, file: f, key });
      }
    }
  }
  all[province] = rows;
}

log('## 0. 跳过总量与原因分布');
log('');
log('| 省 | 跳过 | 缺少选项 | 选项数量不足 | 选项文本为空 | 占位题（原卷缺失） |');
log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const province of PROVINCES) {
  const rows = all[province];
  const by = r => rows.filter(x => x.reason === r).length;
  log(`| ${province} | ${rows.length} | ${by('缺少选项')} | ${by('选项数量不足')} | ${by('选项文本为空')} | ${rows.filter(x => x.q.isPlaceholder).length} |`);
}
log('');

log('## 1. 图片特征命中率（题干关键词）');
log('');
log('| 省 | 缺选项跳过 | 命中关键词 | 命中率 | 含 A/B/C/D 内联选项 | 内联率 | 有材料 | 材料引导语 |');
log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
const detail = {};
for (const province of PROVINCES) {
  const rows = all[province].filter(x => !x.q.isPlaceholder);
  const feats = rows.map(x => ({ ...x, f: features(x.q) }));
  const hit = feats.filter(x => x.f.words.length > 0);
  const inline = feats.filter(x => x.f.inline);
  detail[province] = { rows: feats, hit, inline };
  log(`| ${province} | ${feats.length} | ${hit.length} | ${pct(hit.length, feats.length)} | ${inline.length} | ${pct(inline.length, feats.length)} | ${feats.filter(x => x.f.material).length} | ${feats.filter(x => x.f.materialGuide).length} |`);
}
log('');

log('## 1b. 非占位跳过题归类（真实缺陷）');
log('');
log('| 省 | 非占位跳过 | 选项落在 material | 判断题（无 ABCD） | 题干「暂缺」 | 其他 | 真·图片特征 |');
log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const province of PROVINCES) {
  const feats = detail[province].rows;
  const inMat = feats.filter(x => x.f.optionsInMaterial);
  const judge = feats.filter(x => x.f.judge && !x.f.optionsInMaterial);
  const stub = feats.filter(x => x.f.stub && !x.f.judge && !x.f.optionsInMaterial);
  const rest = feats.filter(x => !inMat.includes(x) && !judge.includes(x) && !stub.includes(x));
  detail[province].inMat = inMat;
  log(`| ${province} | ${feats.length} | ${inMat.length} | ${judge.length} | ${stub.length} | ${rest.length} | ${detail[province].hit.length} |`);
}
log('');

log('## 1c. 占位题（原卷文本缺失）按年份分布');
log('');
log('| 省 | 年份 | 占位题 |');
log('| --- | --- | ---: |');
for (const province of PROVINCES) {
  const rows = all[province].filter(x => x.q.isPlaceholder);
  const byYear = {};
  for (const x of rows) {
    const m = String(x.q.id).match(/^prov-[^-]+-(\d{4})-/);
    const y = m ? m[1] : '未知';
    byYear[y] = (byYear[y] || 0) + 1;
  }
  for (const [y, n] of Object.entries(byYear).sort()) {
    log(`| ${province} | ${y} | ${n} |`);
  }
}
log('');

log('## 2. 关键词命中分布（按模块）');
log('');
log('| 省 | 模块 | 跳过 | 命中关键词 | 命中率 | 内联选项 |');
log('| --- | --- | ---: | ---: | ---: | ---: |');
for (const province of PROVINCES) {
  const feats = detail[province].rows;
  const mods = [...new Set(feats.map(x => x.q.module))];
  for (const m of mods) {
    const sub = feats.filter(x => x.q.module === m);
    const hit = sub.filter(x => x.f.words.length > 0);
    const inline = sub.filter(x => x.f.inline);
    log(`| ${province} | ${m} | ${sub.length} | ${hit.length} | ${pct(hit.length, sub.length)} | ${inline.length} |`);
  }
}
log('');

log('## 2b. 广东资料分析分片核对（此前「831 题中 382 缺选项」的口径）');
log('');
log('| 分片 | 总题 | 占位题 | 渲染跳过 | 跳过（非占位） |');
log('| --- | ---: | ---: | ---: | ---: |');
for (const province of ['广东']) {
  for (const key of Object.keys(index).filter(k => k.startsWith(`provincial-${province}-ziliao`))) {
    const seen = new Set();
    let total = 0, ph = 0, skip = 0, skipReal = 0;
    for (const f of index[key]) {
      for (const q of loadChunk(f)) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        total++;
        if (q.isPlaceholder) ph++;
        if (getInvalidReason(q)) {
          skip++;
          if (!q.isPlaceholder) skipReal++;
        }
      }
    }
    log(`| ${key} | ${total} | ${ph} | ${skip} | ${skipReal} |`);
  }
}
log('');

log('## 3. 对照基线：同省同模块「未跳过」题的图片关键词率');

log('');
log('| 省 | 模块 | 未跳过 | 命中关键词 | 基线命中率 |');
log('| --- | --- | ---: | ---: | ---: |');
for (const province of PROVINCES) {
  const keys = Object.keys(index).filter(k => k.startsWith(`provincial-${province}-`));
  const seen = new Set();
  const okRows = [];
  for (const key of keys) {
    for (const f of index[key]) {
      for (const q of loadChunk(f)) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        if (!getInvalidReason(q)) okRows.push(q);
      }
    }
  }
  const mods = [...new Set(okRows.map(q => q.module))];
  for (const m of mods) {
    const sub = okRows.filter(q => q.module === m);
    const hit = sub.filter(q => countWords(q.stem).length > 0);
    log(`| ${province} | ${m} | ${sub.length} | ${hit.length} | ${pct(hit.length, sub.length)} |`);
  }
}
log('');

log('## 4. 样本：命中关键词的跳过题（前 8 题/省）');
log('');
for (const province of PROVINCES) {
  log(`### ${province}`);
  log('');
  const hit = detail[province].hit.slice(0, 8);
  if (!hit.length) log('（无命中）');
  for (const x of hit) {
    log(`- \`${x.q.id}\` [${x.q.module}] 关键词=${x.f.words.join('/')} 材料=${x.f.material ? x.f.materialLen + '字' : '无'} 答案=${x.f.answer ? '有' : '无'}`);
    log(`  - 题干：${clip(x.q.stem)}`);
    if (x.q.material) log(`  - 材料：${clip(x.q.material, 120)}`);
  }
  log('');
}

log('## 5. 样本：未命中关键词的跳过题（前 8 题/省）');
log('');
for (const province of PROVINCES) {
  log(`### ${province}`);
  log('');
  const miss = detail[province].rows.filter(x => x.f.words.length === 0).slice(0, 8);
  if (!miss.length) log('（无）');
  for (const x of miss) {
    log(`- \`${x.q.id}\` [${x.q.module}] 内联选项=${x.f.inline ? '是' : '否'} 材料=${x.f.material ? x.f.materialLen + '字' : '无'} 答案=${x.f.answer ? '有' : '无'} 解析=${x.f.explanationLen}字`);
    log(`  - 题干：${clip(x.q.stem)}`);
    if (x.q.material) log(`  - 材料：${clip(x.q.material, 120)}`);
  }
  log('');
}

log('## 6. 内联选项样本（选项疑似被并进题干，前 8 题/省）');
log('');
for (const province of PROVINCES) {
  log(`### ${province}`);
  log('');
  const rows = detail[province].inline.slice(0, 8);
  if (!rows.length) log('（无）');
  for (const x of rows) {
    log(`- \`${x.q.id}\` [${x.q.module}] 关键词=${x.f.words.join('/') || '无'} 材料=${x.f.material ? '有' : '无'}`);
    log(`  - 题干：${clip(x.q.stem, 300)}`);
  }
  log('');
}

log('## 6b. 选项落在 material 字段的样本（前 8 题/省）');
log('');
for (const province of PROVINCES) {
  log(`### ${province}`);
  log('');
  const rows = detail[province].inMat.slice(0, 8);
  if (!rows.length) log('（无）');
  for (const x of rows) {
    log(`- \`${x.q.id}\` [${x.q.module}] 材料=${x.f.materialLen}字`);
    log(`  - 题干：${clip(x.q.stem, 200)}`);
    log(`  - material：${clip(x.q.material, 300)}`);
  }
  log('');
}

log('## 6c. 选项块复用检测（material 相同 = 可能张冠李戴）');
log('');
log('| 省 | 选项在 material 的题 | material 与其他题重复 | 解析出 4 个选项键 |');
log('| --- | ---: | ---: | ---: |');
for (const province of PROVINCES) {
  const rows = detail[province].inMat;
  const uniq = new Map();
  for (const x of rows) {
    const key = String(x.q.material || '').replace(/\s+/g, '');
    uniq.set(key, (uniq.get(key) || 0) + 1);
  }
  const shared = rows.filter(x => uniq.get(String(x.q.material || '').replace(/\s+/g, '')) > 1).length;
  const four = rows.filter(x => {
    const keys = String(x.q.material || '').match(/[A-D]\s*[、.．]/g) || [];
    return new Set(keys.map(k => k[0])).size === 4;
  }).length;
  log(`| ${province} | ${rows.length} | ${shared} | ${four} |`);
}
log('');

log('## 7. 判定');

log('');
const verdict = [];
for (const province of PROVINCES) {
  const feats = detail[province].rows;
  const hitRate = feats.length ? detail[province].hit.length / feats.length : 0;
  const inlineRate = feats.length ? detail[province].inline.length / feats.length : 0;
  verdict.push({ province, hitRate, inlineRate, total: feats.length });
  log(`- ${province}：非占位缺选项 ${feats.length} 题，关键词命中率 **${pct(detail[province].hit.length, feats.length)}**，内联选项率 ${pct(detail[province].inline.length, feats.length)}，选项落在 material ${detail[province].inMat.length} 题`);
}
log('');
const high = verdict.filter(v => v.hitRate > 0.7);
const low = verdict.filter(v => v.hitRate <= 0.7);
log(`结论：${high.length ? high.map(v => v.province).join(' / ') + ' 命中率 >70%，倾向「图片题漏标」；' : ''}${low.length ? low.map(v => v.province).join(' / ') + ' 命中率 ≤70%，不满足「图片题漏标」判据；' : ''}`);
log('真实缺陷以「选项被写进 material / 判断题无选项 / 题干暂缺」三类为主，详见 1b、6b。');
log('');

log('## 8. 结论与下一步');
log('');
let skipTotal = 0, phTotal = 0, realTotal = 0, inMatTotal = 0, judgeTotal = 0, stubTotal = 0;
for (const province of PROVINCES) {
  skipTotal += all[province].length;
  phTotal += all[province].filter(x => x.q.isPlaceholder).length;
  realTotal += detail[province].rows.length;
  inMatTotal += detail[province].inMat.length;
  judgeTotal += detail[province].rows.filter(x => x.f.judge && !x.f.optionsInMaterial).length;
  stubTotal += detail[province].rows.filter(x => x.f.stub && !x.f.judge && !x.f.optionsInMaterial).length;
}
log(`1. 三省渲染跳过合计 ${skipTotal} 题，其中 **${phTotal} 题（${pct(phTotal, skipTotal)}）是占位题**（原卷 Word 文本层缺失，题干为「原卷此题在 Word 文本层缺失」），只有 ${realTotal} 题是非占位缺陷。此前「天津 13.82% / 广东 13.65% / 深圳 11.06% 是缺选项」的归因不成立——绝大部分是源册文本缺失。`);
log(`2. 非占位缺陷中：选项落在 material 字段 ${inMatTotal} 题、判断题无选项 ${judgeTotal} 题、题干「暂缺」${stubTotal} 题，其余为源文截断（题干停在半句、源文本身没有选项）。`);
log('3. 图片特征命中率 0%–4.2%（对照基线：同省言语题 0.6%–4.4%），**不支持「图片题漏标」假设**；仅有 1 题（天津 2011 联考资料分析「趋势」）像图表题，但源文确实没有选项文本。');
log('4. 结论：**不要批量补 isImageQuestion**——占位题不是图片题，批量打标会把 1,007 道源册缺口伪装成「图片题暂不支持」，属于数据失真。');
log('5. 唯一可修的转换 bug（15 题）：源 docx 里「双词选项」被拆成多段（`A、天方夜谭` / `想方设法` / `B、…`），`splitStemAndOptions` 只认同一文本块内的 A/B/C/D，导致整块选项被当成 material 绑定到后一题（天津 2012 第 26 题选项挂到第 27 题，`material` 完全相同的 2 题即此例）。修法：扫描时把「A-D 标记行 + 紧随的续行」合并成一个选项块，再挂回**选项未闭合**的上一题；不能盲目把 material 当选项移动（会张冠李戴）。');
log('6. 收益评估：修好该 bug 最多让 15 题恢复可渲染（跳过率 13.82%→13.3% 量级），**不影响 1,007 道占位题**；占位题只能走源册补录（PDF/OCR）或换更全的题本源。建议把 parser 修复与三省重转作为独立小批次，用天津 2012 做回归样例，不阻塞当前已上线的八省。');
log('');

fs.mkdirSync(path.dirname(OUT), { recursive: true });

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log('报告已写入:', OUT);

