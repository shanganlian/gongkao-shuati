import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'public/data/questions');
const failedCsvPath = path.join(process.cwd(), 'repair_failed_v2.csv');

const MARKER_REGEX_STR = '\\b([A-F])(?:[\\.、．:：\\)）]|\\s+)';
const ANY_MARKER_REGEX = new RegExp(MARKER_REGEX_STR);
const A_MARKER_REGEX = new RegExp('\\bA(?:[\\.、．:：\\)）]|\\s+)');
const B_MARKER_REGEX = new RegExp('\\bB(?:[\\.、．:：\\)）]|\\s+)');

function parseOptions(text) {
  const keys = ['A', 'B', 'C', 'D', 'E', 'F'];
  const indices = [];
  
  let searchStartIndex = 0;
  for (const key of keys) {
    const regex = new RegExp(`\\b${key}(?:[\\.、．:：\\)）]|\\s+)`, 'g');
    regex.lastIndex = searchStartIndex;
    const match = regex.exec(text);
    if (match) {
      indices.push({ key, index: match.index, matchLength: match[0].length });
      searchStartIndex = match.index + match[0].length;
    } else {
      break;
    }
  }

  if (indices.length < 2) return null;

  const options = [];
  for (let i = 0; i < indices.length; i++) {
    const current = indices[i];
    const next = indices[i + 1];
    const start = current.index + current.matchLength;
    const end = next ? next.index : text.length;
    const optText = text.substring(start, end).trim();
    options.push({
      key: current.key,
      text: optText
    });
  }

  return options;
}

function processQuestion(q) {
  const isSubjective = q.module === 'shenlun' || q.module === 'gongji' || q.type === '主观题';

  let fullText = q.stem || '';
  if (q.options && q.options.length > 0) {
    for (const opt of q.options) {
      const optMarkerRegex = new RegExp(`\\b${opt.key}(?:[\\.、．:：\\)）]|\\s+)`);
      if (optMarkerRegex.test(opt.text)) {
        fullText += ' ' + opt.text;
      } else {
        fullText += ` ${opt.key}、${opt.text}`;
      }
    }
  }

  let aMatch = null;
  const aRegexGlobal = new RegExp(A_MARKER_REGEX.source, 'g');
  const bRegexGlobal = new RegExp(B_MARKER_REGEX.source, 'g');
  
  let match;
  while ((match = aRegexGlobal.exec(fullText)) !== null) {
    bRegexGlobal.lastIndex = match.index;
    if (bRegexGlobal.exec(fullText)) {
      aMatch = match;
      break;
    }
  }

  let realStem = q.stem || '';
  let optionsText = '';

  if (aMatch) {
    realStem = fullText.substring(0, aMatch.index).trim();
    optionsText = fullText.substring(aMatch.index);
  } else {
    realStem = q.stem || '';
    if (q.options && q.options.length > 0) {
      for (const opt of q.options) {
        const optMarkerRegex = new RegExp(`\\b${opt.key}(?:[\\.、．:：\\)）]|\\s+)`);
        if (optMarkerRegex.test(opt.text)) {
          optionsText += opt.text + ' ';
        } else {
          optionsText += `${opt.key}、${opt.text} `;
        }
      }
    }
  }

  if (!optionsText.trim()) {
    return { success: true, q: { ...q, stem: realStem } }; 
  }

  const newOptions = parseOptions(optionsText);
  
  if (!newOptions) {
    return { success: false, reason: 'Failed to parse at least A and B', q };
  }

  if (!isSubjective && (newOptions.length < 2 || newOptions.length > 6)) {
    return { success: false, reason: `Invalid options length: ${newOptions.length}`, q };
  }

  for (const opt of newOptions) {
    if (ANY_MARKER_REGEX.test(opt.text)) {
      return { success: false, reason: `Option ${opt.key} contains marker`, q };
    }
  }

  return { success: true, q: { ...q, stem: realStem, options: newOptions } };
}

function run() {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'idMap.json');
  let failed = [];
  let fixedCount = 0;

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const questions = JSON.parse(content);
    let changed = false;
    let newQuestions = [];

    for (const q of questions) {
      const isSubjective = q.module === 'shenlun' || q.module === 'gongji' || q.type === '主观题';
      const hasStemMarker = A_MARKER_REGEX.test(q.stem || '');
      const hasTextMarker = q.options && q.options.some(o => ANY_MARKER_REGEX.test(o.text));
      
      if (!isSubjective && q.options && q.options.length >= 2 && q.options.length <= 6 && !hasStemMarker && !hasTextMarker) {
        newQuestions.push(q);
        continue;
      }
      
      if (isSubjective && (!q.options || q.options.length === 0) && !hasStemMarker) {
        newQuestions.push(q);
        continue;
      }

      const res = processQuestion(q);
      if (res.success) {
        changed = true;
        fixedCount++;
        newQuestions.push(res.q);
      } else {
        changed = true; // We are removing it from the array, so it's a change
        failed.push({
          id: q.id,
          reason: res.reason,
          stem: q.stem,
          options: JSON.stringify(q.options)
        });
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(newQuestions, null, 2));
    }
  }

  if (failed.length > 0) {
    const csvHeader = 'id,reason,stem,options\n';
    const csvBody = failed.map(f => `"${f.id}","${f.reason}","${(f.stem||'').replace(/"/g, '""')}","${(f.options||'').replace(/"/g, '""')}"`).join('\n');
    fs.writeFileSync(failedCsvPath, csvHeader + csvBody);
  } else {
    if (fs.existsSync(failedCsvPath)) fs.unlinkSync(failedCsvPath);
  }

  console.log(`Fix complete. Successfully fixed: ${fixedCount}. Failed and removed: ${failed.length}.`);
  if (failed.length > 0) console.log(`Failed records saved to ${failedCsvPath}`);
}

run();