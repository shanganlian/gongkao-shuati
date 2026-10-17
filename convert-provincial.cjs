const fs = require('fs');
const path = require('path');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'provincial-questions.json'), 'utf-8'));

const difficultyMap = {
  changshi: '基础', yanyu: '中等', shuliang: '拔高',
  panduan: '中等', ziliao: '中等', shenlun: '拔高'
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
  return {
    id: `prov-${q.province}-${q.year}-${q.paperLabel || 'x'}-${q.num}`,
    category: 'provincial',
    module: q.module,
    title: makeTitle(q.stem, q.module),
    stem: q.stem,
    options: q.options && q.options.length > 0 ? q.options : undefined,
    answer: q.answer || '',
    explanation: q.analysis || '',
    difficulty: difficultyMap[q.module] || '中等',
    source: `${q.year}年${q.province}公务员考试${q.module === 'shenlun' ? '《申论》' : '《行测》'}${q.paperLabel || ''}`
  };
});

const validQuestions = questions.filter(q => q.stem && q.stem.length > 5 && (q.answer || q.module === 'shenlun'));

console.log(`Total raw: ${raw.length}`);
console.log(`Valid (with answer): ${validQuestions.length}`);
console.log(`With options: ${validQuestions.filter(q => q.options).length}`);
console.log(`With explanation: ${validQuestions.filter(q => q.explanation).length}`);

const byModule = {};
for (const q of validQuestions) {
  byModule[q.module] = (byModule[q.module] || 0) + 1;
}
console.log('By module:', byModule);

const output = `import { Question } from '../types';

export const PROVINCIAL_EXAM_QUESTIONS: Question[] = ${JSON.stringify(validQuestions)};
`;

const outPath = path.join(__dirname, 'src', 'data', 'provincialExamQuestions.ts');
fs.writeFileSync(outPath, output, 'utf-8');
const stats = fs.statSync(outPath);
console.log(`\nSaved to src/data/provincialExamQuestions.ts (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
