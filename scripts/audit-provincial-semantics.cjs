#!/usr/bin/env node
/**
 * 省考行测转换结果自动语义扫描。
 *
 * 只读取 questions-v2-provincial/<省>/questions.json，并把扫描块追加到各省
 * guokao-reports/省考-<省>-转换/ledger.md。不修改题目数据。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { hasStemOptionMark, firstMarkPos } = require('./lib/stem-option-mark.cjs');

const ROOT = path.resolve(__dirname, '..');
const V2_ROOT = path.join(ROOT, 'public', 'data', 'questions-v2-provincial');
const REPORT_ROOT = path.join(ROOT, 'guokao-reports');
const START_MARK = '<!-- SEMANTIC_SCAN_START -->';
const END_MARK = '<!-- SEMANTIC_SCAN_END -->';
const WINDOW = 120;

const YANYU_CORE = ['实词', '成语', '主旨', '细节理解', '混搭填空'];
const YANYU_EXT = [
  '逻辑填空', '选词填空', '词语辨析', '近义词', '实词辨析', '成语辨析',
  '意图判断', '主旨概括', '中心理解', '细节判断', '标题填入', '标题选择',
  '语句排序', '语句填空', '语句衔接', '下文推断', '接语选择', '态度理解',
  '词句理解', '代词指代', '篇章阅读', '病句', '歧义', '横线处', '第一空',
  '第二空', '划横线', '填入划横线', '文段',
];
const YANYU_STRONG = [
  '实词', '混搭填空', '逻辑填空', '选词填空', '词语辨析', '近义词',
  '实词辨析', '成语辨析', '第一空', '第二空', '横线处', '划横线',
  '填入划横线', '细节判断', '中心理解', '主旨概括', '意图判断',
  '标题填入', '标题选择', '语句排序', '语句填空', '语句衔接',
  '下文推断', '接语选择', '态度理解', '词句理解', '代词指代',
  '篇章阅读', '病句', '歧义',
];
const ZILIAO_CORE = ['增长率', '比重', '百分数'];
const ZILIAO_EXT = [
  '增长量', '同比', '环比', '基期', '现期', '资料分析', '材料中',
  '定位表格', '定位图形', '表格材料', '图表材料', '翻番', '平均数',
  '倍数', '进出口', '占全国', '增速',
];
const DATA_STRONG = [
  '判定本题为', '可判定本题', '定位表格', '定位图形', '定位文字材料',
  '资料分析', '基期', '现期', '同比', '环比', '增长量', '比重问题',
  '平均数问题', '倍数问题', '根据公式',
];
const STEM_YANYU_RE = /填入划横线|依次填入|最恰当的一项|没有语病|有语病|歧义|语句排序|排列组合|语序|下文推断|主要说明|意在说明|主旨|符合原文|细节判断|加点词语|划横线|衔接最恰当|填入|根据这段文字|这段文字|理解不正确|理解正确|最符合文意|最符合这段文字|最符合原文|最符合作者意图|符合文意|可以推出|作者意图|主要观点|意在强调|概括最准确|最适合做|最适合这则|最适合这段|作为标题/u;
const STEM_SHULIANG_RE = /概率|几何|圆锥|菱形|三角形|正方形|多少倍|排列|组合|路程|工程|利润|年龄|容斥|植树|牛吃草/u;

const MODULE_NAME = {
  changshi: '常识',
  yanyu: '言语',
  shuliang: '数量',
  panduan: '判断',
  ziliao: '资料',
};

function normalizeText(text) {
  return String(text || '')
    .replace(/[\s\u3000\u00a0]+/g, '')
    .replace(/[\u200b-\u200d\ufeff]/g, '');
}

function paperName(q) {
  const source = String(q.source || '').trim();
  if (source) {
    const stripped = source
      .replace(/第\s*\d+(?:\s*[-—－至]\s*\d+)?\s*题.*$/u, '')
      .trim();
    if (stripped) return stripped;
  }
  const id = String(q.id || '');
  const m = id.match(/^prov-[a-z]+-(.+)-\d+$/);
  return m ? m[1] : '(未知卷)';
}

function percentage(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '—';
}

function mdCell(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function csvCell(value) {
  return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
}

function readQuestions(province) {
  const file = path.join(V2_ROOT, province, 'questions.json');
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(value) ? value : [];
}

function findTokens(text, tokens) {
  return tokens
    .map(token => ({ token, pos: text.indexOf(token) }))
    .filter(item => item.pos >= 0)
    .sort((a, b) => a.pos - b.pos || b.token.length - a.token.length);
}

function excerptAt(text, pos, before = 20, after = 60) {
  if (pos < 0) return String(text || '').slice(0, after);
  return String(text || '').slice(Math.max(0, pos - before), pos + after);
}

function answerDistribution(questions) {
  const papers = new Map();
  for (const q of questions) {
    if (String(q.kind || '') === '申论') continue;
    const paper = paperName(q);
    if (!papers.has(paper)) {
      papers.set(paper, { paper, counts: { A: 0, B: 0, C: 0, D: 0 }, total: 0, invalid: 0 });
    }
    const row = papers.get(paper);
    const match = String(q.answer || '').trim().toUpperCase().match(/^[A-D]/);
    if (!match) {
      row.invalid++;
      continue;
    }
    row.counts[match[0]]++;
    row.total++;
  }

  return [...papers.values()]
    .map(row => {
      const values = Object.values(row.counts);
      const max = Math.max(...values);
      const zeroLetters = Object.entries(row.counts).filter(([, n]) => n === 0).map(([letter]) => letter);
      const maxShare = row.total ? max / row.total : 0;
      let status = '正常';
      let anomaly = false;
      if (row.total < 20) {
        status = '样本不足';
      } else if (zeroLetters.length) {
        status = `严重失衡（缺${zeroLetters.join('/')}）`;
        anomaly = true;
      } else if (maxShare >= 0.65) {
        status = '严重失衡';
        anomaly = true;
      } else if (maxShare >= 0.55) {
        status = '失衡';
        anomaly = true;
      }
      return { ...row, maxShare, zeroLetters, status, anomaly };
    })
    .sort((a, b) => a.paper.localeCompare(b.paper, 'zh-CN'));
}

function scanE07(questions) {
  const rows = [];
  for (const q of questions) {
    if (String(q.kind || '') === '申论') continue;
    const stem = String(q.stem || '');
    const options = Array.isArray(q.options) ? q.options : [];
    if (!hasStemOptionMark(stem, options)) continue;
    const pos = firstMarkPos(stem);
    rows.push({
      id: q.id || '',
      paper: paperName(q),
      module: q.module || '',
      pos,
      excerpt: excerptAt(stem.replace(/\s+/g, ' '), pos),
    });
  }
  return rows;
}

function scanExplanationModules(questions) {
  const strong = [];
  const weak = [];
  for (const q of questions) {
    if (String(q.kind || '') === '申论') continue;
    const module = String(q.module || '');
    const explanation = normalizeText(q.explanation);
    const opening = explanation.slice(0, WINDOW);
    const stem = normalizeText(q.stem);
    const base = {
      id: q.id || '',
      paper: paperName(q),
      module,
      stem: String(q.stem || ''),
      excerpt: opening.slice(0, 100),
    };

    if (module === 'changshi') {
      const allHits = findTokens(opening, [...YANYU_CORE, ...YANYU_EXT]);
      if (!allHits.length) continue;
      const strongTokens = allHits
        .map(item => item.token)
        .filter(token => YANYU_STRONG.includes(token));
      const stemYanyu = STEM_YANYU_RE.test(stem);
      const row = {
        ...base,
        type: 'changshi->yanyu',
        tokens: allHits.map(item => item.token),
        triage: strongTokens.length
          ? (stemYanyu
            ? 'A2 题干/解析均像言语，模块疑似错标'
            : 'A1 解析像言语而题干非典型言语，疑似串题/挂错解析')
          : 'A3 仅正文提及言语词（弱命中）',
      };
      (strongTokens.length ? strong : weak).push(row);
      continue;
    }

    if (module === 'yanyu') {
      const allHits = findTokens(explanation, [...ZILIAO_CORE, ...ZILIAO_EXT]);
      if (!allHits.length) continue;
      const dataStrong = DATA_STRONG.filter(token => opening.includes(token));
      const row = {
        ...base,
        type: 'yanyu->ziliao',
        tokens: allHits.map(item => item.token),
        triage: dataStrong.length
          ? (STEM_SHULIANG_RE.test(stem)
            ? 'B3 数量题误标为言语'
            : 'B1 资料解析误标为言语')
          : 'B2/B4 言语正文提及资料词（弱命中）',
      };
      (dataStrong.length ? strong : weak).push(row);
    }
  }
  return { strong, weak };
}

function groupByPaper(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.paper)) map.set(row.paper, []);
    map.get(row.paper).push(row);
  }
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-CN')));
}

function sampleIds(rows, limit = 8) {
  return [...new Set(rows.map(row => row.id).filter(Boolean))].slice(0, limit).join('、');
}

function makeMarkdown(province, scan) {
  const lines = [
    START_MARK,
    '',
    '## 自动语义扫描（只读）',
    '',
    `- 生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- 数据源：\`public/data/questions-v2-provincial/${province}/questions.json\``,
    '- 边界：本扫描只读题目，不改答案、模块、题干或解析。',
    '- 判定口径：答案分布按“解析来源卷”聚合；有效答案仅统计 A-D。单卷有效答案不少于 20 且某字母占比达到 55% 记为失衡，达到 65% 或出现某字母为 0 记为严重失衡。',
    '',
    '### 1. 答案分布',
    '',
    '| 卷 | A | B | C | D | 有效答案 | 无/非法答案 | 最大占比 | 判定 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of scan.distributions) {
    lines.push(
      `| ${mdCell(row.paper)} | ${row.counts.A} | ${row.counts.B} | ${row.counts.C} | ${row.counts.D} | ` +
      `${row.total} | ${row.invalid} | ${percentage(Math.round(row.maxShare * 10000), 10000)} | ${row.status} |`
    );
  }
  if (!scan.distributions.length) lines.push('| （无题目） | 0 | 0 | 0 | 0 | 0 | 0 | — | 无数据 |');

  const answerAnomalies = scan.distributions.filter(row => row.anomaly);
  lines.push(
    '',
    `- 异常卷：**${answerAnomalies.length}**。${answerAnomalies.length ? `涉及：${answerAnomalies.map(row => row.paper).join('；')}` : '未发现达到阈值的异常卷。'}`,
    '',
    '### 2. 题干含选项标记（E07）',
    '',
    '采用 `scripts/lib/stem-option-mark.cjs`：题干残留 `A、` / `B.` 等选项标记，且不属于纯字母变量枚举。',
    ''
  );
  const e07ByPaper = groupByPaper(scan.e07);
  if (!e07ByPaper.size) {
    lines.push('未命中。');
  } else {
    lines.push('| 卷 | 命中数 | 样例 ID |', '| --- | ---: | --- |');
    for (const [paper, rows] of e07ByPaper) {
      lines.push(`| ${mdCell(paper)} | ${rows.length} | ${mdCell(sampleIds(rows))} |`);
    }
  }
  lines.push('', `- 合计：**${scan.e07.length}** 题命中。`, '');

  lines.push(
    '### 3. 解析模块特征词与题干不符',
    '',
    '沿用福建 2011 联考 Q11 的分层口径：先看解析开头是否出现另一模块的强特征词，再结合题干判断“模块错标”或“解析挂错/串题”。弱命中单独统计，不计入修复量。',
    ''
  );
  const strongByPaper = groupByPaper(scan.moduleMismatch.strong);
  if (!strongByPaper.size) {
    lines.push('未命中高置信候选。');
  } else {
    lines.push('| 卷 | 高置信候选 | 判定分布 | 样例 ID |', '| --- | ---: | --- | --- |');
    for (const [paper, rows] of strongByPaper) {
      const triage = new Map();
      for (const row of rows) triage.set(row.triage, (triage.get(row.triage) || 0) + 1);
      const triageText = [...triage.entries()].map(([key, n]) => `${key}×${n}`).join('；');
      lines.push(`| ${mdCell(paper)} | ${rows.length} | ${mdCell(triageText)} | ${mdCell(sampleIds(rows))} |`);
    }
  }
  lines.push(
    '',
    `- 高置信候选：**${scan.moduleMismatch.strong.length}** 题；弱命中：**${scan.moduleMismatch.weak.length}** 题。`,
    '- 高置信候选仍需对照原卷题号与答案文件后才可修复；其中 A1 类尤其可能是解析串题。',
    '',
    '### 4. 逐条明细',
    '',
    `- 完整机器明细：\`guokao-reports/省考-${province}-转换/semantic-scan.csv\``,
    `- 汇总 JSON：\`guokao-reports/省考-${province}-转换/semantic-scan.json\``,
    '',
    END_MARK,
  );
  return lines.join('\n');
}

function writeSemanticReports(province, scan) {
  const reportDir = path.join(REPORT_ROOT, `省考-${province}-转换`);
  fs.mkdirSync(reportDir, { recursive: true });

  const csvRows = [[
    '省份', '卷', '题ID', '模块', '扫描类型', '级别', '判定', '命中词', '题干', '解析开头',
  ]];
  for (const row of scan.distributions) {
    csvRows.push([
      province, row.paper, '', '', 'ANSWER_DISTRIBUTION', row.anomaly ? 'ANOMALY' : 'INFO',
      row.status, `A=${row.counts.A};B=${row.counts.B};C=${row.counts.C};D=${row.counts.D}`,
      '', '',
    ]);
  }
  for (const row of scan.e07) {
    csvRows.push([
      province, row.paper, row.id, row.module, 'E07_STEM_OPTION_MARK', 'ERROR',
      '题干含选项标记', '', row.excerpt, '',
    ]);
  }
  for (const row of scan.moduleMismatch.strong) {
    csvRows.push([
      province, row.paper, row.id, row.module, row.type, 'HIGH_CONFIDENCE',
      row.triage, row.tokens.join('、'), row.stem, row.excerpt,
    ]);
  }
  for (const row of scan.moduleMismatch.weak) {
    csvRows.push([
      province, row.paper, row.id, row.module, row.type, 'WEAK',
      row.triage, row.tokens.join('、'), row.stem, row.excerpt,
    ]);
  }
  const csv = csvRows.map(row => row.map(csvCell).join(',')).join('\r\n');
  fs.writeFileSync(path.join(reportDir, 'semantic-scan.csv'), `\uFEFF${csv}\r\n`, 'utf8');

  const json = {
    province,
    generatedAt: new Date().toISOString(),
    thresholds: {
      answerDistribution: '有效答案>=20，且最大字母占比>=55%；最大占比>=65%或字母缺项为严重失衡',
      explanationWindow: WINDOW,
    },
    counts: {
      questions: scan.questions,
      papers: scan.distributions.length,
      answerAnomalyPapers: scan.distributions.filter(row => row.anomaly).length,
      e07: scan.e07.length,
      explanationHighConfidence: scan.moduleMismatch.strong.length,
      explanationWeak: scan.moduleMismatch.weak.length,
    },
    answerDistribution: scan.distributions,
    e07: scan.e07,
    explanationHighConfidence: scan.moduleMismatch.strong,
    explanationWeak: scan.moduleMismatch.weak,
  };
  fs.writeFileSync(
    path.join(reportDir, 'semantic-scan.json'),
    JSON.stringify(json, null, 2),
    'utf8'
  );

  const ledgerFile = path.join(reportDir, 'ledger.md');
  let ledger = fs.existsSync(ledgerFile)
    ? fs.readFileSync(ledgerFile, 'utf8')
    : `# 省考-${province}-转换 账本\n`;
  const block = makeMarkdown(province, scan);
  const start = ledger.indexOf(START_MARK);
  const end = ledger.indexOf(END_MARK);
  if (start >= 0 && end >= start) {
    ledger = `${ledger.slice(0, start)}${block}${ledger.slice(end + END_MARK.length)}`;
  } else {
    ledger = `${ledger.trimEnd()}\n\n${block}\n`;
  }
  fs.writeFileSync(ledgerFile, ledger, 'utf8');

  return json;
}

function scanProvince(province) {
  const questions = readQuestions(province);
  const scan = {
    questions: questions.length,
    distributions: answerDistribution(questions),
    e07: scanE07(questions),
    moduleMismatch: scanExplanationModules(questions),
  };
  return writeSemanticReports(province, scan);
}

function scanProvinces(provinces) {
  const results = new Map();
  for (const province of provinces) {
    try {
      const result = scanProvince(province);
      results.set(province, result);
      console.log(
        `[semantic] ${province}: 题数=${result.counts.questions} ` +
        `答案异常卷=${result.counts.answerAnomalyPapers} E07=${result.counts.e07} ` +
        `解析强候选=${result.counts.explanationHighConfidence}`
      );
    } catch (error) {
      console.error(`[semantic] ${province} 扫描失败：${error && error.stack ? error.stack : error}`);
      results.set(province, {
        province,
        error: error && error.message ? error.message : String(error),
        counts: {},
      });
    }
  }
  return results;
}

function listConvertedProvinces() {
  if (!fs.existsSync(V2_ROOT)) return [];
  return fs
    .readdirSync(V2_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(province => fs.existsSync(path.join(V2_ROOT, province, 'questions.json')))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

if (require.main === module) {
  const provinces = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  scanProvinces(provinces.length ? provinces : listConvertedProvinces());
}

module.exports = {
  scanProvince,
  scanProvinces,
  listConvertedProvinces,
};
