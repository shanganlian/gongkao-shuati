/**
 * 面试大厅 v1.0 · 路由与首屏冒烟（不依赖浏览器）
 *
 * 覆盖：
 *  - 5 条 hash 子路由解析 / 编码往返 / 非法 hash 回落 / 前缀识别
 *  - 大厅首屏（hero、抽题、历史、题型覆盖）
 *  - 报告缺记录兜底、练习记录空态
 *
 * 用法：npm run interview:hall
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InterviewHall } from '../src/components/interview/InterviewHall.tsx';
import {
  buildInterviewHash,
  isInterviewHash,
  parseInterviewRoute,
} from '../src/components/interview/interviewRoutes.ts';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

// 1. 路由解析 / 生成 / 前缀识别
const routes = [
  ['#/interview/lobby', 'lobby', undefined],
  ['#/interview/picker', 'picker', undefined],
  ['#/interview/session/si-zh-001', 'session', 'si-zh-001'],
  ['#/interview/report/local-123', 'report', 'local-123'],
  ['#/interview/session/%E4%B8%AD%E6%96%87', 'session', '中文'],
  ['#/other', 'lobby', undefined],
  ['#/interview/unknown', 'lobby', undefined],
] as const;

routes.forEach(([hash, name, id]) => {
  const route = parseInterviewRoute(hash);
  const expectedId = name === 'session' ? route.questionId : route.recordId;
  check(`parse ${hash}`, route.name === name && (id === undefined || expectedId === id), JSON.stringify(route));
});

check(
  'build session roundtrip',
  buildInterviewHash({ name: 'session', questionId: 'si-zh-001' }) === '#/interview/session/si-zh-001'
);
check(
  'build report encodes id',
  buildInterviewHash({ name: 'report', recordId: 'a/b' }) === '#/interview/report/a%2Fb'
);
check('isInterviewHash true', isInterviewHash('#/interview/report/x'));
check('isInterviewHash false', !isInterviewHash('#/interviewx'));
check('isInterviewHash query tolerated', isInterviewHash('#/interview/lobby?from=share'));

// 2. 大厅首屏（Node 无 window，题库停在 loading 态）
const lobbyHtml = renderToStaticMarkup(<InterviewHall onRecordPractice={() => {}} />);
check('lobby hero', lobbyHtml.includes('把每一次开口，练成考场本能'));
check('lobby picker entry', lobbyHtml.includes('进入题库抽题'));
check('lobby history entry', lobbyHtml.includes('练习历史'));
check('lobby category section', lobbyHtml.includes('题型覆盖'));
check('lobby renders non-empty', lobbyHtml.length > 2000, `${lobbyHtml.length} chars`);

// 3. 报告缺记录 / 记录页空列表（模拟前端 hash 深链）
const fakeWindow: any = {
  location: { hash: '#/interview/report/missing-id', pathname: '/', search: '' },
  localStorage: undefined,
};
Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
const missingReportHtml = renderToStaticMarkup(<InterviewHall onRecordPractice={() => {}} />);
check('report missing record fallback', missingReportHtml.includes('找不到这条练习记录'));

fakeWindow.location.hash = '#/interview/history';
const historyHtml = renderToStaticMarkup(<InterviewHall onRecordPractice={() => {}} />);
check('history empty state renders', historyHtml.includes('练习记录') && historyHtml.length > 1000);

// 4. 输出
const failed = results.filter((item) => !item.ok);
results.forEach((item) => {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `  → ${item.detail}` : ''}`);
});
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
