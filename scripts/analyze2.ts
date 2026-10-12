import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve('./public/data/questions');
const index = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'index.json'), 'utf8'));

const allProvinces = new Set<string>();
let badOptionsCount = 0;
let badExamples: any[] = [];

Object.keys(index).forEach(key => {
  const prov = key.split('-')[1];
  if (prov !== 'none') allProvinces.add(prov);
  
  index[key].forEach((filename: string) => {
    const chunk = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, filename), 'utf8'));
    chunk.forEach((q: any) => {
      if (q.options && q.options.length === 1 && q.options[0].text.match(/[BＢ][\.．、]/)) {
        badOptionsCount++;
        if (badExamples.length < 2) badExamples.push(q);
      }
    });
  });
});

console.log('All provinces:', Array.from(allProvinces).sort().join(', '));
console.log('Total bad options:', badOptionsCount);
console.log('Examples:', JSON.stringify(badExamples, null, 2));
