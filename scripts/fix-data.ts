import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./public/data/questions');
const OUTPUT_FAILED = path.resolve('./repair_failed.csv');

// Write CSV header
fs.writeFileSync(OUTPUT_FAILED, 'question_id,filename,stem,original_options\n', 'utf8');

let repairedOptionsCount = 0;
let mergedProvinceCount = 0;
let failedRepairs = 0;
let repairedExamples: any[] = [];

// Read index to get all files
const index = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'index.json'), 'utf8'));

// We need to rebuild index and idMap because province changes might change the filename (grouping)!
// Actually, if we change the province, the file it belongs to SHOULD change!
// If a question was in "provincial-广州-yanyu-0.json", it should move to "provincial-广东-yanyu-X.json".
// This requires a full re-grouping of ALL questions!

// 1. Read ALL questions from ALL chunks
const allQuestions: any[] = [];
Object.values(index).flat().forEach((filename: any) => {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filepath)) {
    const chunk = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    allQuestions.push(...chunk);
    // Delete the old chunk to avoid leftover files
    fs.unlinkSync(filepath);
  }
});

// 2. Process all questions
allQuestions.forEach(q => {
  // Fix province
  if (q.province === '广州' || q.province === '深圳') {
    q.province = '广东';
    mergedProvinceCount++;
  }

  // Fix options
  if (q.options && q.options.length === 1) {
    const text = q.options[0].text;
    
    // Check if it contains B., C., etc. (Full-width and half-width support)
    const bMatch = text.match(/\s*[BＢ][\.．、]\s*/);
    const cMatch = text.match(/\s*[CＣ][\.．、]\s*/);
    const dMatch = text.match(/\s*[DＤ][\.．、]\s*/);

    if (bMatch && cMatch && dMatch) {
      let optA = text.substring(0, bMatch.index).trim();
      let optB = text.substring(bMatch.index + bMatch[0].length, cMatch.index).trim();
      let optC = text.substring(cMatch.index + cMatch[0].length, dMatch.index).trim();
      let optD = text.substring(dMatch.index + dMatch[0].length).trim();

      optA = optA.replace(/^[AＡ][\.．、]\s*/, "");

      const newOptions = [
        { key: 'A', text: optA },
        { key: 'B', text: optB },
        { key: 'C', text: optC },
        { key: 'D', text: optD }
      ];

      q.options = newOptions;
      repairedOptionsCount++;

      if (repairedExamples.length < 100) {
        repairedExamples.push({
          id: q.id,
          original: text,
          fixed: newOptions
        });
      }
    } else if (text.match(/[BＢ][\.．、]/)) {
      failedRepairs++;
      const csvLine = `"${q.id}","unknown","${q.stem?.replace(/"/g, '""')}","${text.replace(/"/g, '""')}"\n`;
      fs.appendFileSync(OUTPUT_FAILED, csvLine, 'utf8');
    }
  }
});

// 3. Regroup and write chunks
const groups: Record<string, any[]> = {};
allQuestions.forEach(q => {
  const p = q.province || 'none';
  const key = `${q.category}-${p}-${q.module}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(q);
});

const newIndex: Record<string, string[]> = {};
const newIdMap: Record<string, string[]> = {};

Object.entries(groups).forEach(([key, questions]) => {
  const CHUNK_SIZE = 150;
  const numChunks = Math.ceil(questions.length / CHUNK_SIZE);
  newIndex[key] = [];

  for (let i = 0; i < numChunks; i++) {
    const chunk = questions.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const filename = `${key}-${i}.json`;
    
    newIndex[key].push(filename);
    
    chunk.forEach(q => {
      if (!newIdMap[q.id]) newIdMap[q.id] = [];
      if (!newIdMap[q.id].includes(filename)) {
        newIdMap[q.id].push(filename);
      }
    });

    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(chunk)
    );
  }
});

fs.writeFileSync(path.join(OUTPUT_DIR, 'index.json'), JSON.stringify(newIndex));
fs.writeFileSync(path.join(OUTPUT_DIR, 'idMap.json'), JSON.stringify(newIdMap));

console.log(`Repaired options for ${repairedOptionsCount} questions.`);
console.log(`Merged ${mergedProvinceCount} questions to '广东'.`);
console.log(`Failed to repair ${failedRepairs} questions (see repair_failed.csv).`);

fs.writeFileSync(path.resolve('./repaired_samples.json'), JSON.stringify(repairedExamples, null, 2), 'utf8');
console.log('Sampled 100 repaired questions to repaired_samples.json for manual verification.');
