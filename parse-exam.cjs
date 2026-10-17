const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const QUESTION_DIR = 'C:\\Users\\CLM\\Desktop\\国考真题（2000--2026)\\4-行测\\1-行测-真题\\word';
const ANSWER_DIR = 'C:\\Users\\CLM\\Desktop\\国考真题（2000--2026)\\4-行测\\2-行测-答案及解析\\word';
const SHENLUN_DIR = 'C:\\Users\\CLM\\Desktop\\国考真题（2000--2026)\\5-申论\\word';

const MODULE_MAP = {
  '常识判断': 'changshi',
  '言语理解': 'yanyu',
  '言语理解与表达': 'yanyu',
  '数量关系': 'shuliang',
  '判断推理': 'panduan',
  '资料分析': 'ziliao'
};

function normalizeText(text) {
  return text
    .replace(/\u3000/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

async function extractText(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeText(result.value);
  } catch (e) {
    console.error('Extract error:', filePath, e.message);
    return '';
  }
}

function extractAnswerFromAnalysis(text) {
  const patterns = [
    /正确答案[：:]\s*([A-D])/,
    /故正确答案为\s*([A-D])/,
    /选择\s*([A-D])\s*选项/,
    /答案[：:]\s*([A-D])/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return '';
}

function parseAnswerKey(answerText) {
  const keyMap = {};
  const quickMatch = answerText.match(/快速对答案[\s\S]*?(?=\【\d+\】解析|\d+[、.]\s*本题|$)/);
  if (quickMatch) {
    const section = quickMatch[0];
    const rangeRegex = /【(\d+)[-~—](\d+)】\s*([A-D]+)/g;
    let m;
    while ((m = rangeRegex.exec(section)) !== null) {
      const start = parseInt(m[1]);
      const end = parseInt(m[2]);
      const answers = m[3].replace(/\s/g, '');
      for (let i = 0; i < answers.length && (start + i) <= end; i++) {
        keyMap[start + i] = answers[i];
      }
    }
  }
  return keyMap;
}

function parseExplanations(answerText) {
  const explanations = {};
  
  const expRegex1 = /【(\d+)】解析([\s\S]*?)(?=【\d+】解析|$)/g;
  let m;
  while ((m = expRegex1.exec(answerText)) !== null) {
    const num = parseInt(m[1]);
    explanations[num] = m[2].trim();
  }
  
  if (Object.keys(explanations).length === 0) {
    const lines = answerText.split('\n');
    let currentNum = null;
    let currentText = [];
    
    for (const line of lines) {
      const qMatch = line.match(/^(\d{1,3})[、.．]\s*(.*)$/);
      if (qMatch) {
        if (currentNum !== null) {
          explanations[currentNum] = currentText.join('\n').trim();
        }
        currentNum = parseInt(qMatch[1]);
        currentText = [qMatch[2]];
      } else if (currentNum !== null) {
        currentText.push(line);
      }
    }
    if (currentNum !== null) {
      explanations[currentNum] = currentText.join('\n').trim();
    }
  }
  
  return explanations;
}

function parseQuestions(questionText, year, examType, paperLabel) {
  const questions = [];
  const lines = questionText.split('\n');
  
  let currentModule = '';
  let currentQuestion = null;
  
  const moduleRegex = /^[一二三四五六七八九十]+[、.．]\s*(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)/;
  
  const qNumRegex = /^(\d{1,3})([\.、．])?$/;
  const qStartRegex = /^(\d{1,3})[\.、．]\s*(.+)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const modMatch = line.match(moduleRegex);
    if (modMatch) {
      currentModule = modMatch[1];
      continue;
    }
    
    let qMatch = line.match(qStartRegex);
    if (qMatch) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        num: parseInt(qMatch[1]),
        module: MODULE_MAP[currentModule] || 'changshi',
        moduleName: currentModule,
        stem: qMatch[2],
        options: [],
        year, examType, paperLabel
      };
      continue;
    }
    
    qMatch = line.match(qNumRegex);
    if (qMatch) {
      if (currentQuestion) questions.push(currentQuestion);
      currentQuestion = {
        num: parseInt(qMatch[1]),
        module: MODULE_MAP[currentModule] || 'changshi',
        moduleName: currentModule,
        stem: '',
        options: [],
        year, examType, paperLabel
      };
      continue;
    }
    
    if (currentQuestion) {
      const optRegex = /^([A-D])[\s]*[、.．]?\s*(.+)$/;
      const optMatch = line.match(optRegex);
      if (optMatch && currentQuestion.stem.length > 0) {
        currentQuestion.options.push({ key: optMatch[1], text: optMatch[2] });
      } else {
        const multiOptRegex = /([A-D])\s*[、.．]\s*([^A-D]+?)(?=[A-D]\s*[、.．]|$)/g;
        let mm;
        let foundOpts = false;
        while ((mm = multiOptRegex.exec(line)) !== null) {
          if (mm[2].trim().length > 0 && currentQuestion.stem.length > 0) {
            currentQuestion.options.push({ key: mm[1], text: mm[2].trim() });
            foundOpts = true;
          }
        }
        if (!foundOpts) {
          if (currentQuestion.options.length === 0) {
            currentQuestion.stem += (currentQuestion.stem ? '\n' : '') + line;
          } else {
            const lastOpt = currentQuestion.options[currentQuestion.options.length - 1];
            lastOpt.text += '\n' + line;
          }
        }
      }
    }
  }
  
  if (currentQuestion) questions.push(currentQuestion);
  return questions.filter(q => q.stem.length > 0 || q.options.length > 0);
}

function getFilePairs() {
  const qFiles = fs.readdirSync(QUESTION_DIR).filter(f => f.endsWith('.docx'));
  const aFiles = fs.readdirSync(ANSWER_DIR).filter(f => f.endsWith('.docx'));
  
  const pairs = [];
  for (const qf of qFiles) {
    const yearMatch = qf.match(/(\d{4})年/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    if (year < 2018) continue;
    
    let label = '副省级';
    if (/地市级|市地级/.test(qf)) label = '地市级';
    if (/行政执法/.test(qf)) label = '行政执法';
    if (/A卷|（一）/.test(qf)) label = 'A卷';
    if (/B卷|（二）/.test(qf)) label = 'B卷';
    
    let bestAnswer = null;
    let bestScore = -1;
    for (const af of aFiles) {
      const afYear = af.match(/(\d{4})年/) ? parseInt(af.match(/(\d{4})年/)[1]) : 0;
      if (afYear !== year) continue;
      let score = 0;
      if (/地市级|市地级/.test(af) && label === '地市级') score += 10;
      if (/行政执法/.test(af) && label === '行政执法') score += 10;
      if (/副省|省级/.test(af) && label === '副省级') score += 10;
      if (score > bestScore) { bestScore = score; bestAnswer = af; }
    }
    
    if (bestAnswer) {
      pairs.push({
        questionFile: path.join(QUESTION_DIR, qf),
        answerFile: path.join(ANSWER_DIR, bestAnswer),
        year, label, name: qf
      });
    }
  }
  return pairs;
}

function parseShenlunQuestions(text, year, paperLabel) {
  const questions = [];
  
  const qRegex = /【问题([一二三四五六七八九十]+)】([\s\S]*?)(?=【问题[一二三四五六七八九十]+】|参考答案|$)/g;
  let m;
  while ((m = qRegex.exec(text)) !== null) {
    const numStr = m[1];
    const content = m[2].trim();
    if (!content) continue;
    
    const categoryMap = {
      '归纳概括': '归纳概括',
      '概括': '归纳概括',
      '总结': '归纳概括',
      '谈谈': '综合分析',
      '分析': '综合分析',
      '理解': '综合分析',
      '启示': '综合分析',
      '对策': '提出对策',
      '建议': '提出对策',
      '解决': '提出对策',
      '草拟': '贯彻执行',
      '撰写': '贯彻执行',
      '写一篇': '贯彻执行',
      '写一份': '贯彻执行',
      '文章': '文章写作'
    };
    
    let category = '归纳概括';
    for (const [key, val] of Object.entries(categoryMap)) {
      if (content.includes(key)) { category = val; break; }
    }
    
    questions.push({
      num: cnToNum(numStr),
      module: 'shenlun',
      moduleName: '申论',
      stem: content,
      options: [],
      answer: '',
      analysis: '',
      category,
      year, examType: '国考', paperLabel
    });
  }
  
  const aRegex = /【问题([一二三四五六七八九十]+)参考答案】([\s\S]*?)(?=【问题[一二三四五六七八九十]+参考答案】|$)/g;
  const answerMap = {};
  while ((m = aRegex.exec(text)) !== null) {
    answerMap[cnToNum(m[1])] = m[2].trim();
  }
  
  for (const q of questions) {
    if (answerMap[q.num]) {
      q.answer = answerMap[q.num];
      q.analysis = '申论主观题，请参考参考答案要点进行对照评分。';
    }
  }
  
  return questions;
}

function cnToNum(cn) {
  const map = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
  if (cn.length === 1) return map[cn] || 0;
  if (cn === '十') return 10;
  if (cn.startsWith('十')) return 10 + (map[cn[1]] || 0);
  if (cn.endsWith('十')) return (map[cn[0]] || 0) * 10;
  return (map[cn[0]] || 0) * 10 + (map[cn[2]] || 0);
}

async function processShenlun() {
  const files = fs.readdirSync(SHENLUN_DIR).filter(f => f.endsWith('.docx'));
  const all = [];
  
  for (const f of files) {
    const yearMatch = f.match(/(\d{4})年/);
    const year = yearMatch ? parseInt(yearMatch[1]) : 0;
    if (year < 2018) continue;
    
    let label = '副省级';
    if (/地市级|市地级/.test(f)) label = '地市级';
    if (/行政执法/.test(f)) label = '行政执法';
    
    console.log(`Processing 申论: ${year} ${label}`);
    const text = await extractText(path.join(SHENLUN_DIR, f));
    if (!text) continue;
    
    const qs = parseShenlunQuestions(text, year, label);
    console.log(`  Parsed ${qs.length} questions, answers: ${qs.filter(q=>q.answer).length}`);
    all.push(...qs);
  }
  
  return all;
}

async function processAll() {
  const pairs = getFilePairs();
  console.log(`Found ${pairs.length} pairs to process`);
  
  const allQuestions = [];
  
  for (const pair of pairs) {
    console.log(`Processing: ${pair.year} ${pair.label}`);
    
    const qText = await extractText(pair.questionFile);
    const aText = await extractText(pair.answerFile);
    
    if (!qText || !aText) {
      console.log(`  Skipped: missing text`);
      continue;
    }
    
    const questions = parseQuestions(qText, pair.year, '国考', pair.label);
    const keyMap = parseAnswerKey(aText);
    const explanations = parseExplanations(aText);
    
    for (const q of questions) {
      q.answer = keyMap[q.num] || '';
      q.analysis = explanations[q.num] || '';
      if (!q.answer && q.analysis) {
        q.answer = extractAnswerFromAnalysis(q.analysis);
      }
      allQuestions.push(q);
    }
    
    console.log(`  Parsed ${questions.length} questions, answers: ${questions.filter(q=>q.answer).length}, analysis: ${questions.filter(q=>q.analysis).length}`);
  }
  
  console.log(`\nTotal: ${allQuestions.length}`);
  console.log(`With answer: ${allQuestions.filter(q => q.answer).length}`);
  console.log(`With analysis: ${allQuestions.filter(q => q.analysis).length}`);
  console.log(`With options: ${allQuestions.filter(q => q.options.length > 0).length}`);
  
  console.log('\n=== Processing 申论 ===');
  const shenlunQs = await processShenlun();
  allQuestions.push(...shenlunQs);
  
  console.log(`\nFinal total: ${allQuestions.length}`);
  console.log(`With answer: ${allQuestions.filter(q => q.answer).length}`);
  console.log(`With analysis: ${allQuestions.filter(q => q.analysis).length}`);
  console.log(`With options: ${allQuestions.filter(q => q.options.length > 0).length}`);
  
  const outputPath = path.join(__dirname, 'all-questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2), 'utf-8');
  console.log(`Saved to: ${outputPath}`);
}

processAll().catch(e => console.error(e));
