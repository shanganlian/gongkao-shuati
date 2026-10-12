import fs from 'fs';
import path from 'path';
import { MOCK_QUESTIONS } from '../src/data/mockData';
import assert from 'assert';

const OUTPUT_DIR = path.resolve('./public/data/questions');

// Randomly select 50 questions
const numSamples = 50;
const samples = [];
for (let i = 0; i < numSamples; i++) {
  const randomIndex = Math.floor(Math.random() * MOCK_QUESTIONS.length);
  samples.push(MOCK_QUESTIONS[randomIndex]);
}

// Load idMap
const idMap = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'idMap.json'), 'utf8'));

let passed = 0;

for (const sample of samples) {
  const filenames = idMap[sample.id];
  assert(filenames && filenames.length > 0, `File not found for question ID: ${sample.id}`);
  
  let targetQ = null;
  let foundFilename = null;
  
  for (const filename of filenames) {
    const chunkData = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, filename), 'utf8'));
    targetQ = chunkData.find((q: any) => q.id === sample.id && q.stem === sample.stem);
    if (targetQ) {
      foundFilename = filename;
      break;
    }
  }
  
  assert(targetQ, `Question ID ${sample.id} with matching stem not found in any mapped chunks: ${filenames.join(',')}`);
  
  assert.strictEqual(targetQ.answer, sample.answer, `Answer mismatch for ${sample.id}`);
  assert.strictEqual(targetQ.explanation, sample.explanation, `Explanation mismatch for ${sample.id}`);
  
  if (sample.options) {
    assert.deepStrictEqual(targetQ.options, sample.options, `Options mismatch for ${sample.id}`);
  }
  
  passed++;
}

console.log(`Validation passed! ${passed}/${numSamples} questions matched perfectly.`);
