import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'public/data/questions');

const OPTION_MARKER_REGEX = /\b[B-F](?:[\.、．:：\)）]|\s+)/;
const OPTION_A_MARKER_REGEX = /\bA(?:[\.、．:：\)）]|\s+)/;

let typeA = [];
let typeB = [];
let typeC = [];

function scan() {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'idMap.json');
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const questions = JSON.parse(content);
    
    for (const q of questions) {
      // Type A: options is empty, but stem contains "A." or "A、"
      if ((!q.options || q.options.length === 0) && OPTION_A_MARKER_REGEX.test(q.stem)) {
        typeA.push(q);
      }
      // Type B: options has 1-2 elements, text contains "B." etc.
      else if (q.options && q.options.length > 0 && q.options.length <= 2) {
        let hasSticky = false;
        for (const opt of q.options) {
          if (OPTION_MARKER_REGEX.test(opt.text)) {
            hasSticky = true;
            break;
          }
        }
        if (hasSticky) {
          typeB.push(q);
        }
      }
      // Type C: options has >=3 elements, but some text contains markers
      else if (q.options && q.options.length >= 3) {
        let hasSticky = false;
        for (const opt of q.options) {
          // Be slightly more strict for Type C to avoid false positives like "A" inside text
          if (OPTION_MARKER_REGEX.test(opt.text)) {
            hasSticky = true;
            break;
          }
        }
        if (hasSticky) {
          typeC.push(q);
        }
      }
    }
  }

  console.log(`Type A (Options empty, stem has A.): ${typeA.length}`);
  if (typeA.length > 0) {
    console.log('Sample Type A:');
    console.log(JSON.stringify(typeA[0], null, 2));
  }

  console.log(`\nType B (Options 1-2, text has B/C/D.): ${typeB.length}`);
  if (typeB.length > 0) {
    console.log('Sample Type B:');
    console.log(JSON.stringify(typeB[0], null, 2));
  }

  console.log(`\nType C (Options >=3, text has markers): ${typeC.length}`);
  if (typeC.length > 0) {
    console.log('Sample Type C:');
    console.log(JSON.stringify(typeC[0], null, 2));
  }
}

scan();
