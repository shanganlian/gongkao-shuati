#!/usr/bin/env node
/** 临时：解析 14 省 publish dry-run 计划书（guokao-reports/publish-<slug>-plan.md） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'guokao-reports');
const LIST = [
  ['重庆', 'chongqing'], ['广西', 'guangxi'], ['广州', 'guangzhou'], ['贵州', 'guizhou'],
  ['河南', 'henan'], ['吉林', 'jilin'], ['江苏', 'jiangsu'], ['辽宁', 'liaoning'],
  ['内蒙古', 'neimenggu'], ['青海', 'qinghai'], ['山东', 'shandong'], ['四川', 'sichuan'],
  ['西藏', 'xizang'], ['新疆', 'xinjiang'],
];
const num = s => Number(String(s).replace(/[^\d]/g, ''));
function cell(md, label) {
  // 匹配首个以 label 开头的表格行，返回单元格数组（去掉首尾空）
  const re = new RegExp('^\\|\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^|]*\\|(.*)\\|$', 'm');
  const m = re.exec(md);
  if (!m) return null;
  return m[1].split('|').map(s => s.trim());
}
const rows = [];
const problems = [];
for (const [province, slug] of LIST) {
  const file = path.join(REPORTS, `publish-${slug}-plan.md`);
  if (!fs.existsSync(file)) { problems.push(`${province}: 缺少 plan 报告`); continue; }
  const md = fs.readFileSync(file, 'utf8');
  const mode = /模式：\*\*(.+?)\*\*/.exec(md)?.[1] || '?';
  const block = /阻塞项：\*\*(.+?)\*\*/.exec(md)?.[1] || '?';
  const cov = cell(md, `覆盖同名旧${province}分片`) || [];
  const add = cell(md, `新增${province}分片`) || [];
  const del = cell(md, `删除多余旧${province}分片`) || [];
  const keep = cell(md, '保留 v2 未覆盖的旧主观题分片') || [];
  const before = cell(md, '合并前线上合计') || [];
  const after = cell(md, '合并后（实际分片推演）') || [];
  const newRow = cell(md, `${province}新数据（v2）`) || [];
  const oldRow = cell(md, `${province}旧数据（被替换 / 删除部分）`) || [];
  const fileCons = /文件数：`([^`]+)`，推演值 \d+ → \*\*(通过|失败)\*\*/.exec(md);
  const qCons = /题目数：`([^`]+)`，推演值 [\d,]+ → \*\*(通过|失败)\*\*/.exec(md);
  const totalCons = /合并后总题数 = 当前 [\d,]+ − 旧[^=]+= \*\*([\d,]+)\*\*；推演结果 \*\*([\d,]+)\*\*，一致 (✅|❌)/.exec(md);
  const boundRows = [...md.matchAll(/^\|\s*[^|]*(越界|变更文件全部命中|变更清单重复文件|未触碰分片混入|替换 \/ 删除旧分片混入)[^|]*\|([^|]*)\|/gm)];
  const boundOk = boundRows.every(m => /通过|忽略/.test(m[2]));
  const boundFail = boundRows.filter(m => !/通过|忽略/.test(m[2])).map(m => m[0].slice(0, 40));
  const total = num(newRow[0] ?? '');
  const okQ = num(newRow[1] ?? '');
  const imgQ = num(newRow[3] ?? '');
  const skipNoStem = num(newRow[4] ?? '');
  const skipTooFew = num(newRow[5] ?? '');
  const skipEmpty = num(newRow[6] ?? '');
  const skip = skipNoStem + skipTooFew + skipEmpty;
  const r = {
    province, slug, mode, block,
    coverFiles: num(cov[0] ?? ''), coverOld: num((cov[1] ?? '').split('/')[1] ?? ''),
    coverNew: num((cov[1] ?? '').split('/')[0] ?? ''),
    addFiles: num(add[0] ?? ''), addNew: num(add[1] ?? ''),
    delFiles: num(del[0] ?? ''), delOld: num(del[1] ?? ''),
    keepFiles: num(keep[0] ?? ''), keepOld: num(keep[1] ?? ''),
    srcFiles: null,
    beforeFiles: num(before[0] ?? ''), beforeQ: num(before[1] ?? ''),
    afterFiles: num(after[0] ?? ''), afterQ: num(after[1] ?? ''),
    fileCons: fileCons ? `${fileCons[1]} → ${fileCons[2]}` : '?',
    qCons: qCons ? `${qCons[1]} → ${qCons[2]}` : '?',
    totalCons: totalCons ? `${totalCons[1]} = ${totalCons[2]} ${totalCons[3]}` : '?',
    boundOk,
    total, okQ, imgQ, skip, skipRate: total ? ((skip / total) * 100).toFixed(2) + '%' : '?',
    oldTotal: num(oldRow[1] ?? ''), oldOk: num(oldRow[2] ?? ''),
    rangeOk: /越界检查/.test(md) ? boundOk : false,
  };
  r.srcFiles = r.coverFiles + r.addFiles;
  rows.push(r);
  if (block !== '无') problems.push(`${province}: 阻塞项=${block}`);
  if (!boundOk) problems.push(`${province}: 越界/清单检查未通过（${boundFail.join(' ; ')}）`);
  if (!fileCons || fileCons[2] !== '通过') problems.push(`${province}: 文件数守恒未通过（${r.fileCons}）`);
  if (!qCons || qCons[2] !== '通过') problems.push(`${province}: 题数守恒未通过（${r.qCons}）`);
  if (!totalCons || totalCons[3] !== '✅') problems.push(`${province}: 总数定值未通过（${r.totalCons}）`);
  if (total && skip / total > 0.06) problems.push(`${province}: 跳过率 ${r.skipRate} > 6%`);
  if (mode !== 'dry-run（未写入）') problems.push(`${province}: 报告模式异常 ${mode}`);
}
fs.writeFileSync(path.join(ROOT, '_dryrun14-summary.json'), JSON.stringify({ rows, problems }, null, 2), 'utf8');
const L = [];
L.push('province\t源片\t覆盖(片/旧题→新题)\t新增(片/题)\t删除(片/题)\t保留旧主观\t合并前(片/题)\t合并后(片/题)\t文件守恒\t题数守恒\t定值\t越界\t新题\t可渲染\t渲染率\t跳过\tskip%');
for (const r of rows) {
  L.push([
    r.province, r.srcFiles,
    `${r.coverFiles}/${r.coverOld}→${r.coverNew}`, `${r.addFiles}/${r.addNew}`, `${r.delFiles}/${r.delOld}`,
    `${r.keepFiles}/${r.keepOld}`, `${r.beforeFiles}/${r.beforeQ}`, `${r.afterFiles}/${r.afterQ}`,
    r.fileCons, r.qCons, r.totalCons, r.boundOk ? '通过' : '未通过',
    r.total, r.okQ, ((r.okQ / r.total) * 100).toFixed(2) + '%', r.skip, r.skipRate,
  ].join('\t'));
}
const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
L.push('');
L.push(`TOTALS\t新题=${sum('total')}\t可渲染=${sum('okQ')}\t跳过=${sum('skip')}\t源片=${sum('srcFiles')}\t覆盖旧题=${rows.reduce((a, r) => a + r.coverOld + r.delOld + r.keepOld, 0)}\t删除片=${sum('delFiles')}`);
L.push(`GRAND\t合并后总题(逐省 apply 后)=${(() => { const before = rows[0].beforeQ; const old = rows.reduce((a, r) => a + r.coverOld + r.delOld + r.keepOld, 0); return before - old + sum('total'); })()}\t分片数=${(() => { const before = rows[0].beforeFiles; const old = rows.reduce((a, r) => a + r.coverFiles + r.delFiles + r.keepFiles, 0); return before - old + sum('srcFiles'); })()}`);
L.push('');
L.push('PROBLEMS: ' + (problems.length ? problems.length : 0));
for (const p of problems) L.push('  - ' + p);
fs.writeFileSync(path.join(ROOT, '_dryrun14-summary.txt'), L.join('\r\n') + '\r\n', 'utf8');
