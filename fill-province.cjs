const fs = require('fs');
const path = require('path');

// 省份规范化：去掉"省"后缀，保留市
function normalizeProvince(p) {
  if (!p) return '';
  p = p.trim();
  // 去掉"省"字后缀
  if (p.endsWith('省')) p = p.slice(0, -1);
  return p;
}

// 从 id 提取省份：prov-XXX-
function fromId(id) {
  const m = id.match(/^prov-([^-]+)-/);
  return m ? m[1] : '';
}

// 从 source 提取省份：年XXX公务员考试
function fromSource(source) {
  if (!source) return '';
  // 联考
  if (source.includes('联考')) return '联考';
  const m = source.match(/年(.+?)公务员考试/);
  return m ? m[1] : '';
}

// 地域关键词兜底
const keywordMap = [
  { kw: '浙里办', prov: '浙江' },
  { kw: '粤省事', prov: '广东' },
  { kw: '粤', prov: '广东' },
  { kw: '津', prov: '天津' },
  { kw: '沪', prov: '上海' },
  { kw: '渝', prov: '重庆' },
  { kw: '冀', prov: '河北' },
  { kw: '晋', prov: '山西' },
  { kw: '辽', prov: '辽宁' },
  { kw: '吉', prov: '吉林' },
  { kw: '黑', prov: '黑龙江' },
  { kw: '苏', prov: '江苏' },
  { kw: '浙', prov: '浙江' },
  { kw: '皖', prov: '安徽' },
  { kw: '闽', prov: '福建' },
  { kw: '赣', prov: '江西' },
  { kw: '鲁', prov: '山东' },
  { kw: '豫', prov: '河南' },
  { kw: '鄂', prov: '湖北' },
  { kw: '湘', prov: '湖南' },
  { kw: '粤', prov: '广东' },
  { kw: '桂', prov: '广西' },
  { kw: '琼', prov: '海南' },
  { kw: '川', prov: '四川' },
  { kw: '蜀', prov: '四川' },
  { kw: '黔', prov: '贵州' },
  { kw: '贵', prov: '贵州' },
  { kw: '滇', prov: '云南' },
  { kw: '云', prov: '云南' },
  { kw: '藏', prov: '西藏' },
  { kw: '陕', prov: '陕西' },
  { kw: '秦', prov: '陕西' },
  { kw: '甘', prov: '甘肃' },
  { kw: '陇', prov: '甘肃' },
  { kw: '青', prov: '青海' },
  { kw: '宁', prov: '宁夏' },
  { kw: '新', prov: '新疆' },
  { kw: '蒙', prov: '内蒙古' },
];

function fromKeywords(stem) {
  if (!stem) return '';
  for (const item of keywordMap) {
    if (stem.includes(item.kw)) return item.prov;
  }
  return '';
}

const uncertainRows = [];

function inferProvince(q) {
  const idProv = normalizeProvince(fromId(q.id));
  const srcProv = normalizeProvince(fromSource(q.source));

  // 国考：留空
  if (q.category === 'national') return '';

  // 省考：优先 id，其次 source
  if (idProv) {
    if (srcProv && idProv !== srcProv) {
      // 交叉验证失败，记录到 uncertain，优先用 id
      uncertainRows.push({
        id: q.id,
        source: q.source,
        idProvince: idProv,
        sourceProvince: srcProv,
        decision: idProv,
        reason: 'id与source省份不一致',
      });
    }
    return idProv;
  }

  if (srcProv) return srcProv;

  // 兜底：题干关键词
  const kwProv = fromKeywords(q.stem);
  if (kwProv) {
    uncertainRows.push({
      id: q.id,
      source: q.source,
      idProvince: '',
      sourceProvince: '',
      decision: kwProv,
      reason: '题干关键词推断',
    });
    return kwProv;
  }

  // 无法判断
  uncertainRows.push({
    id: q.id,
    source: q.source,
    idProvince: '',
    sourceProvince: '',
    decision: '',
    reason: '无法判断',
  });
  return '';
}

// 处理 JSON 格式的数据文件（realExamQuestions.ts 和 provincialExamQuestions.ts）
function processJsonFile(filePath, varName) {
  const content = fs.readFileSync(filePath, 'utf8');
  // 找到 "= [" 后的 [ 和最后一个 "];" 前的 ] 之间的内容
  const eqIdx = content.indexOf('= [');
  const startIdx = eqIdx + 2; // 跳过 "= [" 指向 [
  const endIdx = content.lastIndexOf(']');
  if (startIdx < 0 || endIdx < 0) {
    console.log('无法解析: ' + filePath);
    return;
  }
  const jsonStr = content.slice(startIdx, endIdx + 1);
  const questions = JSON.parse(jsonStr);

  let filled = 0;
  questions.forEach(q => {
    const prov = inferProvince(q);
    if (prov) {
      q.province = prov;
      filled++;
    }
  });

  // 写回：保留前面的 export 语句，替换数组部分
  const prefix = content.slice(0, startIdx);
  const suffix = content.slice(endIdx + 1);
  const newJson = JSON.stringify(questions);
  fs.writeFileSync(filePath, prefix + newJson + suffix, 'utf8');
  console.log(filePath + ': 回填 ' + filled + '/' + questions.length + ' 题');
}

// 处理 mockData.ts（TS 代码格式，基础题目少，手动加 province）
function processMockData() {
  const filePath = path.join(__dirname, 'src', 'data', 'mockData.ts');
  let content = fs.readFileSync(filePath, 'utf8');

  // 手动给基础题目加 province（source 含"多省公务员联考"→联考，国家公务员→留空）
  // 用正则匹配每个 source 行，在下一行插入 province
  // 简单处理：在 "source": "..." 后添加 ",\n    province: '...'" 不可靠，因为题目格式可能不同
  // 更好的方法：直接在已知的基础题 source 后注入

  const nationalSources = [
    '2025年国家公务员录用考试《行测》行政执法卷',
    '2025年国家公务员录用考试《行测》副省级',
    '2025年国家公务员录用考试《行测》地市级',
  ];

  // 对于每道基础题，根据 source 判断
  // 匹配 source: '...' 或 source: "..."
  const sourceRegex = /source:\s*['"]([^'"]+)['"]/g;
  let match;
  const edits = [];
  while ((match = sourceRegex.exec(content)) !== null) {
    const src = match[1];
    let prov = '';
    if (src.includes('多省公务员联考') || src.includes('联考')) {
      prov = '联考';
    } else if (src.includes('国家公务员')) {
      prov = ''; // 国考留空
    }
    if (prov) {
      // 在 match 位置后插入 province 字段
      const insertPos = match.index + match[0].length;
      // 检查是否已有 province
      const after = content.slice(insertPos, insertPos + 50);
      if (!after.includes('province')) {
        edits.push({ pos: insertPos, prov });
      }
    }
  }

  // 倒序插入
  edits.reverse().forEach(e => {
    const ins = ",\n    province: '" + e.prov + "'";
    content = content.slice(0, e.pos) + ins + content.slice(e.pos);
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('mockData.ts: 基础题已标注 province，' + edits.length + ' 处');
}

// 执行
console.log('开始回填 province 字段...\n');

processJsonFile(
  path.join(__dirname, 'src', 'data', 'realExamQuestions.ts'),
  'REAL_EXAM_QUESTIONS'
);

processJsonFile(
  path.join(__dirname, 'src', 'data', 'provincialExamQuestions.ts'),
  'PROVINCIAL_EXAM_QUESTIONS'
);

processMockData();

// 输出 uncertain.csv
if (uncertainRows.length > 0) {
  const csvPath = path.join(__dirname, 'uncertain.csv');
  const header = 'id,source,idProvince,sourceProvince,decision,reason\n';
  const rows = uncertainRows.map(r =>
    '"' + (r.id || '').replace(/"/g, '""') + '",' +
    '"' + (r.source || '').replace(/"/g, '""') + '",' +
    '"' + (r.idProvince || '') + '",' +
    '"' + (r.sourceProvince || '') + '",' +
    '"' + (r.decision || '') + '",' +
    '"' + (r.reason || '') + '"'
  ).join('\n');
  fs.writeFileSync(csvPath, header + rows + '\n', 'utf8');
  console.log('\nuncertain.csv: ' + uncertainRows.length + ' 条待人工处理记录已生成');
} else {
  console.log('\n无 uncertain 记录');
}

console.log('\n完成！');
