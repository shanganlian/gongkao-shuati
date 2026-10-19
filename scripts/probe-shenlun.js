#!/usr/bin/env node
/** 只读探针：查看 raw 文本的申论题干/答案标题结构 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'guokao-reports', 'raw');
const needles = process.argv.slice(2);
const files = fs.readdirSync(RAW).filter(f => (needles.length ? needles.every(n => f.includes(n)) : true));

const MARK = /^[ \t]*(?:[（(]\s*(?:[一二三四五六七八九十]{1,3}|\d{1,2})\s*[）)]|\d{1,2}\s*[、.．]|[一二三四五六七八九十]{1,3}\s*[、.．])\s*/;
const ANS = /^.*(?:参考答案|【试题|解析|答案).*$/;
const out = [];
const say = (...a) => out.push(a.join(' '));

for (const f of files) {
  const text = fs.readFileSync(path.join(RAW, f), 'utf8');
  say(`\n===== ${f} (${text.length} chars) =====`);
  const lines = text.split('\n');
  const start = lines.findIndex(l => /作答要求|作答题目|问题部分|申论要求/.test(l));
  say(`HEAD_LINE=${start + 1} ${start >= 0 ? lines[start].trim() : 'NONE'}`);
  if (start >= 0) {
    const shown = lines.slice(start, start + 25).map(l => l.trim()).filter(Boolean);
    say('--- q head ---');
    for (const l of shown) say(l.slice(0, 180));
  }
  say('--- markers ---');
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (MARK.test(l) && l.length < 120) {
      say(`${i + 1}: ${l.slice(0, 120)}`);
      if (++n >= 12) break;
    }
  }
  say('--- answer headings ---');
  n = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (/^[ \t]*(?:【试题|【问题|\d{1,2}\s*[、.．]\s*参考答案|[一二三四五六七八九十]{1,3}\s*[、.．]\s*参考答案|参考答案)/.test(l)) {
      say(`${i + 1}: ${l.slice(0, 120)}`);
      if (++n >= 10) break;
    }
  }
}

const outFile = path.join(ROOT, 'guokao-reports', 'probe-shenlun.txt');
fs.writeFileSync(outFile, out.join('\n'), 'utf8');
console.log(outFile);
