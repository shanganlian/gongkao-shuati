const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'all-questions.json'), 'utf-8'));

const difficultyMap = {
  changshi: '基础',
  yanyu: '中等',
  shuliang: '拔高',
  panduan: '中等',
  ziliao: '中等',
  shenlun: '拔高'
};

function extractKeyPoints(analysis) {
  if (!analysis) return [];
  const points = [];
  const sentences = analysis.split(/[。\n]/).filter(s => s.trim().length > 5);
  for (const s of sentences.slice(0, 3)) {
    const cleaned = s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩\d、.．\s]+/, '').trim();
    if (cleaned.length > 4 && cleaned.length < 40) {
      points.push(cleaned);
    }
  }
  return points;
}

function makeTitle(stem, module) {
  const clean = stem.replace(/\s+/g, ' ').trim();
  const short = clean.substring(0, 28);
  const moduleName = {changshi:'常识',yanyu:'言语',shuliang:'数量',panduan:'判断',ziliao:'资料',shenlun:'申论'}[module] || '行测';
  return `${moduleName}·${short}${clean.length > 28 ? '…' : ''}`;
}

const questions = raw.map((q, idx) => {
  const id = `real-${q.year}-${q.paperLabel || 'x'}-${q.num}`;
  return {
    id,
    category: 'national',
    module: q.module,
    title: makeTitle(q.stem, q.module),
    stem: q.stem,
    options: q.options && q.options.length > 0 ? q.options : undefined,
    answer: q.answer || '',
    explanation: q.analysis || '',
    keyPoints: extractKeyPoints(q.analysis),
    thinkingTip: `【${q.moduleName || q.module}】紧扣题干核心信息，结合${q.year}年国考命题趋势分析。`,
    difficulty: difficultyMap[q.module] || '中等',
    source: `${q.year}年国家公务员考试${q.module === 'shenlun' ? '《申论》' : '《行测》'}${q.paperLabel || ''}`
  };
});

const validQuestions = questions.filter(q => q.stem && q.stem.length > 5);

console.log(`Total raw: ${raw.length}`);
console.log(`Valid questions: ${validQuestions.length}`);
console.log(`With answer: ${validQuestions.filter(q => q.answer).length}`);
console.log(`With options: ${validQuestions.filter(q => q.options).length}`);
console.log(`With explanation: ${validQuestions.filter(q => q.explanation).length}`);

const byModule = {};
for (const q of validQuestions) {
  byModule[q.module] = (byModule[q.module] || 0) + 1;
}
console.log('By module:', byModule);

const byYear = {};
for (const q of raw) {
  byYear[q.year] = (byYear[q.year] || 0) + 1;
}
console.log('By year:', byYear);

const output = `import { Question } from '../types';

export const REAL_EXAM_QUESTIONS: Question[] = ${JSON.stringify(validQuestions, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'src', 'data', 'realExamQuestions.ts'), output, 'utf-8');
console.log(`\nSaved ${validQuestions.length} questions to src/data/realExamQuestions.ts`);
