// 临时：生成「排除 backup 目录 + `_` 开头临时文件」的暂存清单与分类统计
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

const isTemp = (p) =>
  /(^|\/)_[^/]*$/.test(p) || // `_` 开头的临时文件 / 脚本
  /^backup-/.test(p) ||
  /\.bak\.docx$/.test(p);

const keep = entries.filter((e) => !isTemp(e.path));
const drop = entries.filter((e) => isTemp(e.path));

const byCode = {};
for (const e of keep) byCode[e.code] = (byCode[e.code] || 0) + 1;

const dataFiles = keep.filter((e) => e.path.startsWith('public/data/questions/'));
const shardFiles = dataFiles.filter((e) => !/index\.json$|idMap\.json$/.test(e.path));
const other = keep.filter((e) => !e.path.startsWith('public/data/questions/'));

const provinces = {};
for (const e of shardFiles) {
  const m = /^public\/data\/questions\/provincial-(.+?)-[a-z]+-\d+\.json$/.exec(e.path);
  const key = m ? m[1] : '(非省考分片)';
  provinces[key] = provinces[key] || { M: 0, D: 0, '??': 0, A: 0 };
  provinces[key][e.code] = (provinces[key][e.code] || 0) + 1;
}

const lines = [];
lines.push('== 统计 ==');
lines.push(`全部条目 ${entries.length} | 拟暂存 ${keep.length} | 排除临时 ${drop.length}`);
lines.push(`按状态: ${Object.entries(byCode).map(([k, v]) => `${k}=${v}`).join('  ')}`);
lines.push(`题库分片 ${shardFiles.length} | index/idMap ${dataFiles.length - shardFiles.length} | 其他 ${other.length}`);
lines.push('');
lines.push('== 分省分片（M=改动 D=删除 ??=新增）==');
for (const [p, c] of Object.entries(provinces).sort((a, b) => b[1].M + b[1]['??'] - (a[1].M + a[1]['??']))) {
  lines.push(`${p}\tM=${c.M}\tD=${c.D}\t??=${c['??']}`);
}
lines.push('');
lines.push('== 非分片文件 ==');
for (const e of [...dataFiles.filter((x) => !shardFiles.includes(x)), ...other]) {
  lines.push(`${e.code}\t${e.path}`);
}
lines.push('');
lines.push('== 排除的临时文件 ==');
for (const e of drop) lines.push(`${e.code}\t${e.path}`);

fs.writeFileSync('_stage-final.txt', lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
