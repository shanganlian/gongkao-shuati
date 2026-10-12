import fs from 'fs';
import path from 'path';
import { MOCK_QUESTIONS } from '../src/data/mockData';

const OUTPUT_DIR = path.resolve('./public/data/questions');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Group questions by category-province-module
const groups: Record<string, any[]> = {};

MOCK_QUESTIONS.forEach(q => {
  const p = q.province || 'none';
  const key = `${q.category}-${p}-${q.module}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(q);
});

const index: Record<string, string[]> = {};
const idMap: Record<string, string[]> = {};

// 2. Chunk groups and write to files
Object.entries(groups).forEach(([key, questions]) => {
  const CHUNK_SIZE = 150; // About 250KB - 300KB per file
  const numChunks = Math.ceil(questions.length / CHUNK_SIZE);
  index[key] = [];

  for (let i = 0; i < numChunks; i++) {
    const chunk = questions.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const filename = `${key}-${i}.json`;
    
    // Add to index
    index[key].push(filename);
    
    // Add to idMap
    chunk.forEach(q => {
      if (!idMap[q.id]) idMap[q.id] = [];
      if (!idMap[q.id].includes(filename)) {
        idMap[q.id].push(filename);
      }
    });

    // Write chunk
    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(chunk)
    );
  }
});

// 3. Write index and idMap
fs.writeFileSync(
  path.join(OUTPUT_DIR, 'index.json'),
  JSON.stringify(index)
);

fs.writeFileSync(
  path.join(OUTPUT_DIR, 'idMap.json'),
  JSON.stringify(idMap)
);

console.log('Migration complete!');
console.log(`Total questions processed: ${MOCK_QUESTIONS.length}`);
console.log(`Total groups: ${Object.keys(groups).length}`);
console.log(`Total chunks generated: ${Object.values(index).flat().length}`);
