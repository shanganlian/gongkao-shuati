// 临时：核对青海 changshi-2（被 --drop-uncovered 删除）的内容是否在新分片中仍存在
const fs = require('fs');
const cp = require('child_process');

function arr(x) {
  return Array.isArray(x) ? x : x.questions;
}
function readNew(file) {
  return arr(JSON.parse(fs.readFileSync('public/data/questions/' + file, 'utf8')));
}
function readOld(file) {
  const raw = cp.execSync('git show HEAD:public/data/questions/' + file, {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return arr(JSON.parse(raw));
}
const norm = (s) => (s || '').replace(/\s+/g, '').slice(0, 40);

const oldNames = [0, 1, 2].map((n) => `provincial-青海-changshi-${n}.json`);
const newNames = [0, 1].map((n) => `provincial-青海-changshi-${n}.json`);

let oldTotal = 0;
const oldQs = [];
for (const f of oldNames) {
  const q = readOld(f);
  oldTotal += q.length;
  oldQs.push(...q);
  console.log('OLD', f, q.length);
}
const newQs = newNames.flatMap(readNew);
console.log('OLD total', oldTotal, '| NEW total', newQs.length);

const newStems = new Set(newQs.map((q) => norm(q.stem)));
const oldStems = new Set(oldQs.map((q) => norm(q.stem)));
let hit = 0;
for (const s of oldStems) if (newStems.has(s)) hit++;
console.log('old distinct stems', oldStems.size, '| matched in new', hit);

const dropQ = readOld('provincial-青海-changshi-2.json');
let hit2 = 0;
for (const q of dropQ) if (newStems.has(norm(q.stem))) hit2++;
console.log('dropped changshi-2 stems matched in new:', hit2, '/', dropQ.length);
