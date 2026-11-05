// 临时：生成本次 14 省 publish 的精确暂存清单（_stage-manifest.txt）
const cp = require('child_process');
const fs = require('fs');

const raw = cp.execSync('git -c core.quotepath=false status --porcelain', {
  encoding: 'utf8',
  maxBuffer: 1 << 26,
});
const entries = raw
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => ({ code: line.slice(0, 2).trim(), path: line.slice(3).replace(/^"|"$/g, '') }));

const isData = (p) => /^public\/data\/questions\/[^/]+\.json$/.test(p);
const isPlan = (p) => /^guokao-reports\/publish-[a-z]+-plan\.md$/.test(p);
const isDoc = (p) =>
  p === 'PROGRESS.md' ||
  p === 'guokao-reports/省考-v2-known-losses.md' ||
  p === 'scripts/publish-merge-provinces.cjs';

const include = entries.filter((e) => isData(e.path) || isPlan(e.path) || isDoc(e.path));
const exclude = entries.filter((e) => !include.includes(e));

const lines = [];
lines.push(`# 拟暂存 ${include.length} 个文件`);
lines.push('');
for (const e of include.sort((a, b) => a.path.localeCompare(b.path))) {
  lines.push(`${e.code}\t${e.path}`);
}
lines.push('');
lines.push(`# 不暂存 ${exclude.length} 项（临时产物 / 源数据 / 历史转换报告）`);
for (const e of exclude.sort((a, b) => a.path.localeCompare(b.path))) {
  lines.push(`${e.code}\t${e.path}`);
}
fs.writeFileSync('_stage-manifest.txt', lines.join('\n') + '\n', 'utf8');
console.log(`include=${include.length} exclude=${exclude.length}`);
