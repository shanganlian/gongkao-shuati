const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const BASE_DIR = 'C:\\Users\\CLM\\Desktop\\34省考真题合集';

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
    return '';
  }
}

function parseQuestions(questionText, year, province, paperLabel) {
  const questions = [];
  const lines = questionText.split('\n');
  
  let currentModule = '';
  let currentQuestion = null;
  
  const moduleRegex = /^[一二三四五六七八九十]+[、.．]\s*(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)/;
  const moduleRegex2 = /^第[一二三四五六七八九十]+部分\s*(常识判断|言语理解与表达|言语理解|数量关系|判断推理|资料分析)/;
  
  const qNumRegex = /^(\d{1,3})([\.、．])?$/;
  const qStartRegex = /^(\d{1,3})[\.、．]\s*(.+)/;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    let modMatch = line.match(moduleRegex);
    if (!modMatch) modMatch = line.match(moduleRegex2);
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
        year, province, paperLabel, examType: '省考'
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
        year, province, paperLabel, examType: '省考'
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

function parseExplanations(answerText) {
  const keyMap = {};
  const explanations = {};
  
  const blockRegex = /第[【\[]\s*(\d+)\s*[】\]]\s*题[\s\S]*?(?=第[【\[]\s*\d+\s*[】\]]\s*题|$)/g;
  let m;
  while ((m = blockRegex.exec(answerText)) !== null) {
    const num = parseInt(m[1]);
    const block = m[0];
    
    const ansMatch = block.match(/正确答案[:：]\s*[【\[]\s*([A-D])\s*[】\]]/);
    if (ansMatch) keyMap[num] = ansMatch[1];
    
    const expMatch = block.match(/解析\s*([\s\S]+)$/);
    if (expMatch) {
      let exp = expMatch[1].trim();
      const ansIdx = exp.indexOf('故正确答案为');
      if (ansIdx > 0) exp = exp.substring(0, ansIdx).trim();
      explanations[num] = exp;
    }
  }
  
  if (Object.keys(explanations).length === 0) {
    const lines = answerText.split('\n');
    let currentNum = null;
    let currentText = [];
    
    for (const line of lines) {
      const qMatch = line.match(/^(\d{1,3})[、.．]\s*(.*)$/);
      if (qMatch) {
        if (currentNum !== null) {
          const text = currentText.join('\n').trim();
          explanations[currentNum] = text;
          const ansMatch = text.match(/故正确答案为\s*([A-D])/) || text.match(/正确答案[:：]\s*[【\[]?\s*([A-D])/);
          if (ansMatch) keyMap[currentNum] = ansMatch[1];
        }
        currentNum = parseInt(qMatch[1]);
        currentText = [qMatch[2]];
      } else if (currentNum !== null) {
        currentText.push(line);
      }
    }
    if (currentNum !== null) {
      const text = currentText.join('\n').trim();
      explanations[currentNum] = text;
      const ansMatch = text.match(/故正确答案为\s*([A-D])/) || text.match(/正确答案[:：]\s*[【\[]?\s*([A-D])/);
      if (ansMatch) keyMap[currentNum] = ansMatch[1];
    }
  }
  
  return { keyMap, explanations };
}

function parseShenlunQuestions(text, year, province, paperLabel) {
  const questions = [];
  
  const qRegex = /【问题([一二三四五六七八九十]+)】([\s\S]*?)(?=【问题[一二三四五六七八九十]+】|参考答案|作答要求|$)/g;
  let m;
  while ((m = qRegex.exec(text)) !== null) {
    const numStr = m[1];
    const content = m[2].trim();
    if (!content || content.length < 5) continue;
    
    const categoryMap = {
      '归纳概括': '归纳概括', '概括': '归纳概括', '总结': '归纳概括',
      '谈谈': '综合分析', '分析': '综合分析', '理解': '综合分析', '启示': '综合分析',
      '对策': '提出对策', '建议': '提出对策', '解决': '提出对策',
      '草拟': '贯彻执行', '撰写': '贯彻执行', '写一篇': '贯彻执行', '写一份': '贯彻执行',
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
      year, province, paperLabel, examType: '省考'
    });
  }
  
  if (questions.length === 0) {
    const qRegex2 = /(?:^|\n)([一二三四五六七八九十]+)[、.．]\s*([^\n]{10,300}?[？?])/g;
    while ((m = qRegex2.exec(text)) !== null) {
      questions.push({
        num: cnToNum(m[1]),
        module: 'shenlun',
        moduleName: '申论',
        stem: m[2].trim(),
        options: [],
        answer: '',
        analysis: '',
        category: '归纳概括',
        year, province, paperLabel, examType: '省考'
      });
    }
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

function getAllFilePairs() {
  const provinces = fs.readdirSync(BASE_DIR).filter(f => f.endsWith('公务员考试真题') || f.endsWith('公务员真题--'));
  const pairs = [];
  
  for (const prov of provinces) {
    const provPath = path.join(BASE_DIR, prov);
    if (!fs.statSync(provPath).isDirectory()) continue;
    
    const province = prov.replace(/公务员考试真题|公务员真题--/g, '').trim();
    
    const xingcePath = path.join(provPath, '3-行测');
    if (fs.existsSync(xingcePath)) {
      const qPath = path.join(xingcePath, '1-题本', 'word');
      const aPath = path.join(xingcePath, '2-答案及解析', 'word');
      
      if (fs.existsSync(qPath) && fs.existsSync(aPath)) {
        const qFiles = fs.readdirSync(qPath).filter(f => f.endsWith('.docx'));
        const aFiles = fs.readdirSync(aPath).filter(f => f.endsWith('.docx'));
        
        for (const qf of qFiles) {
          const yearMatch = qf.match(/(\d{4})年/);
          if (!yearMatch) continue;
          const year = parseInt(yearMatch[1]);
          if (year < 2018) continue;
          
          let label = '';
          if (/A[类卷]/.test(qf)) label = 'A卷';
          else if (/B[类卷]/.test(qf)) label = 'B卷';
          else if (/C[类卷]/.test(qf)) label = 'C卷';
          else if (/县级/.test(qf)) label = '县级';
          else if (/乡镇/.test(qf)) label = '乡镇';
          else if (/市级/.test(qf)) label = '市级';
          else if (/省级/.test(qf)) label = '省级';
          else if (/行政执法/.test(qf)) label = '行政执法';
          
          let bestAnswer = null;
          let bestScore = -1;
          for (const af of aFiles) {
            const afYear = af.match(/(\d{4})年/);
            if (!afYear || parseInt(afYear[1]) !== year) continue;
            let score = 0;
            if (label && af.includes(label)) score += 10;
            if (af.includes(province) || af.includes('省')) score += 2;
            if (score > bestScore) { bestScore = score; bestAnswer = af; }
          }
          
          if (bestAnswer) {
            pairs.push({
              questionFile: path.join(qPath, qf),
              answerFile: path.join(aPath, bestAnswer),
              year, province, label, type: '行测'
            });
          }
        }
      }
    }
    
    const shenlunPath = path.join(provPath, '2-申论', 'word');
    if (fs.existsSync(shenlunPath)) {
      const sFiles = fs.readdirSync(shenlunPath).filter(f => f.endsWith('.docx'));
      for (const sf of sFiles) {
        const yearMatch = sf.match(/(\d{4})年/);
        if (!yearMatch) continue;
        const year = parseInt(yearMatch[1]);
        if (year < 2018) continue;
        
        let label = '';
        if (/A[类卷]/.test(sf)) label = 'A卷';
        else if (/B[类卷]/.test(sf)) label = 'B卷';
        else if (/C[类卷]/.test(sf)) label = 'C卷';
        else if (/县级/.test(sf)) label = '县级';
        else if (/乡镇/.test(sf)) label = '乡镇';
        else if (/市级/.test(sf)) label = '市级';
        else if (/省级/.test(sf)) label = '省级';
        else if (/行政执法/.test(sf)) label = '行政执法';
        
        pairs.push({
          shenlunFile: path.join(shenlunPath, sf),
          year, province, label, type: '申论'
        });
      }
    }
  }
  
  return pairs;
}

async function processAll() {
  const pairs = getAllFilePairs();
  console.log(`Found ${pairs.length} files to process`);
  
  const allQuestions = [];
  
  for (const pair of pairs) {
    if (pair.type === '行测') {
      const qText = await extractText(pair.questionFile);
      const aText = await extractText(pair.answerFile);
      
      if (!qText || !aText) continue;
      
      const questions = parseQuestions(qText, pair.year, pair.province, pair.label);
      const { keyMap, explanations } = parseExplanations(aText);
      
      for (const q of questions) {
        q.answer = keyMap[q.num] || '';
        q.analysis = explanations[q.num] || '';
        if (!q.answer && q.analysis) {
          const m = q.analysis.match(/故正确答案为\s*([A-D])/) || q.analysis.match(/正确答案[:：]\s*[【\[]?\s*([A-D])/);
          if (m) q.answer = m[1];
        }
        allQuestions.push(q);
      }
      console.log(`行测 ${pair.province} ${pair.year} ${pair.label}: ${questions.length}题, 答案${questions.filter(q=>q.answer).length}, 解析${questions.filter(q=>q.analysis).length}`);
    } else {
      const text = await extractText(pair.shenlunFile);
      if (!text) continue;
      
      const qs = parseShenlunQuestions(text, pair.year, pair.province, pair.label);
      for (const q of qs) allQuestions.push(q);
      console.log(`申论 ${pair.province} ${pair.year} ${pair.label}: ${qs.length}题`);
    }
  }
  
  console.log(`\nTotal: ${allQuestions.length}`);
  console.log(`With answer: ${allQuestions.filter(q => q.answer).length}`);
  console.log(`With analysis: ${allQuestions.filter(q => q.analysis).length}`);
  console.log(`With options: ${allQuestions.filter(q => q.options.length > 0).length}`);
  
  const byProvince = {};
  for (const q of allQuestions) {
    byProvince[q.province] = (byProvince[q.province] || 0) + 1;
  }
  console.log('By province:', byProvince);
  
  const outputPath = path.join(__dirname, 'provincial-questions.json');
  fs.writeFileSync(outputPath, JSON.stringify(allQuestions, null, 2), 'utf-8');
  console.log(`Saved to: ${outputPath}`);
}

processAll().catch(e => console.error(e));
