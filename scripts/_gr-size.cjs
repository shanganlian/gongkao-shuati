// 临时：统计 guokao-reports 下未跟踪文件的体积 / 数量 / 大文件
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const list = cp
  .execSync('git -c core.quotepath=false ls-files --others --exclude-standard guokao-reports', {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  })
  .split(/\r?\n/)
  .filter(Boolean);

let total = 0;
const big = [];
const byExt = {};
const byDir = {};
for (const rel of list) {
  const st = fs.statSync(rel);
  total += st.size;
  if (st.size > 2 * 1024 * 1024) big.push([rel, (st.size / 1024 / 1024).toFixed(1) + 'MB']);
  const ext = (path.extname(rel) || '(none)').toLowerCase();
  byExt[ext] = (byExt[ext] || 0) + 1;
  const parts = rel.split('/');
  const dir = parts.length > 2 ? parts.slice(0, 2).join('/') : '(根)';
  byDir[dir] = byDir[dir] || { n: 0, size: 0 };
  byDir[dir].n += 1;
  byDir[dir].size += st.size;
}
console.log('files', list.length, 'total MB', (total / 1024 / 1024).toFixed(1));
console.log('byExt', JSON.stringify(byExt));
console.log('big(>2MB)', JSON.stringify(big));
console.log('--- by dir (top 40 by size) ---');
Object.entries(byDir)
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 40)
  .forEach(([d, v]) => console.log(d, v.n, (v.size / 1024).toFixed(0) + 'KB'));
