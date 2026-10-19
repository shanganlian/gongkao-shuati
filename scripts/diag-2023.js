import fs from 'node:fs';
const t = fs.readFileSync('guokao-reports/raw/2023年国家公考《申论》真题及答案（地市卷）.docx.txt', 'utf8').replace(/\r/g, '');
const a = t.indexOf('三、作答要求');
const b = t.indexOf('一、参考答案');
const part = t.slice(a, b > a ? b : t.length);
const paras = part.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
const out = [];
paras.forEach((p, i) => {
  out.push(`${i} score=${/[（(]\s*\d+\s*分\s*[）)]/.test(p)} len=${p.length} :: ${p.slice(0, 70).replace(/\n/g, ' ')}`);
});
out.push(`PARTS=${paras.length} A=${a} B=${b}`);
fs.writeFileSync('guokao-reports/diag-2023-shenlun.txt', out.join('\n'), 'utf8');
console.log('done');
