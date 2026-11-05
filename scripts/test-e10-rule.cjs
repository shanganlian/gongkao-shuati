#!/usr/bin/env node
/**
 * E10 规则回归测试。
 *
 * 覆盖：
 *   1. 北京 2008 应届 116：材料无数据 + 选项缺 2005 → 两条都命中
 *   2. 广东同型题（材料无数据、选项连续）→ 只命中材料缺失
 *   3. 题干自带完整数据 → 不命中
 *   4. 言语题“根据这段文字” → 不命中
 *   5. 材料有数据、选项年份连续 → 不命中
 *   6. 选项纯数字跳号 → 命中
 *
 * 退出码：有失败 → 1；全部通过 → 0
 */
'use strict';

const assert = require('node:assert');
const { getE10Issues } = require('./lib/e10-rule.cjs');

function codes(question) {
  return getE10Issues(question).map(item => item.code).sort();
}

const cases = [
  {
    name: '北京 2008 应届 116：材料占位 + 选项缺 2005',
    question: {
      module: 'ziliao',
      stem: '2002～2006 年，我国的贸易顺差额（出口额－进口额）最小的年份是：',
      material: '（一）\n根据下列统计资料回答问题。',
      options: [
        { key: 'A', text: '2002 年' },
        { key: 'B', text: '2003 年' },
        { key: 'C', text: '2004 年' },
        { key: 'D', text: '2006 年' },
      ],
    },
    expected: ['E10-A', 'E10-B'],
  },
  {
    name: '广东同型题：材料占位但选项连续',
    question: {
      module: 'ziliao',
      stem: '2002-2005 年，我国的贸易顺差额（出口—进口）最小的年份是：',
      material: '（一）\n根据下列资料，回答问题',
      options: [
        { key: 'A', text: '2002 年' },
        { key: 'B', text: '2003 年' },
        { key: 'C', text: '2004 年' },
        { key: 'D', text: '2005 年' },
      ],
    },
    expected: ['E10-A'],
  },
  {
    name: '题干自带完整数据',
    question: {
      module: 'ziliao',
      stem: '2019 年某市 GDP 为 1000 亿元，同比增长 5%，则 2018 年 GDP 为：',
      material: '',
      options: [
        { key: 'A', text: '900 亿元' },
        { key: 'B', text: '952 亿元' },
        { key: 'C', text: '1000 亿元' },
        { key: 'D', text: '1050 亿元' },
      ],
    },
    expected: [],
  },
  {
    name: '言语题引用“这段文字”',
    question: {
      module: 'yanyu',
      stem: '根据这段文字，作者意在说明：',
      material: '',
      options: [
        { key: 'A', text: '甲' },
        { key: 'B', text: '乙' },
      ],
    },
    expected: [],
  },
  {
    name: '材料有数据且选项年份连续',
    question: {
      module: 'ziliao',
      stem: '2002～2005 年，我国贸易顺差额最小的年份是：',
      material: '2002 年出口 3256 亿元、进口 2952 亿元；2003 年出口 4328 亿元、进口 4128 亿元。',
      options: [
        { key: 'A', text: '2002 年' },
        { key: 'B', text: '2003 年' },
        { key: 'C', text: '2004 年' },
        { key: 'D', text: '2005 年' },
      ],
    },
    expected: [],
  },
  {
    name: '带统一单位的数字选项跳号',
    question: {
      module: 'ziliao',
      stem: '根据下表，下列数值按从小到大排序，正确的是：',
      material: '2019 年数据如下：100、200、300、500。',
      options: [
        { key: 'A', text: '100 亿元' },
        { key: 'B', text: '200 亿元' },
        { key: 'C', text: '300 亿元' },
        { key: 'D', text: '500 亿元' },
      ],
    },
    expected: ['E10-B'],
  },
  {
    name: '无单位数字选项不按序列缺口处理',
    question: {
      module: 'ziliao',
      stem: '根据下表，下列数值正确的是：',
      material: '2019 年数据如下：100、200、300、500。',
      options: [
        { key: 'A', text: '1' },
        { key: 'B', text: '2' },
        { key: 'C', text: '3' },
        { key: 'D', text: '5' },
      ],
    },
    expected: [],
  },
  {
    name: '普通计数选项 1/2/3/5 不按序列缺口处理',
    question: {
      module: 'shuliang',
      stem: '则只会说一种语言的人比一种语言都不会说的人多（ ）。',
      material: '',
      options: [
        { key: 'A', text: '1 人' },
        { key: 'B', text: '2 人' },
        { key: 'C', text: '3 人' },
        { key: 'D', text: '5 人' },
      ],
    },
    expected: [],
  },
  {
    name: '“保温材料中”不是资料引用',
    question: {
      module: 'yanyu',
      stem: '在众多用于建筑的保温材料中，蛭石因其良好的保温性能而广受青睐，其膨胀倍数越高保温性能越好。最适合做这段文字标题的是：',
      material: '',
      options: [
        { key: 'A', text: '蛭石为什么可以保温' },
        { key: 'B', text: '蛭石：一种神奇的矿石' },
      ],
    },
    expected: [],
  },
  {
    name: '误标为资料分析的普通常识题',
    question: {
      module: 'ziliao',
      stem: '习近平主席在主旨演讲中提出，中国将多方面加大力度进一步扩大开放，包括：',
      material: '',
      options: [
        { key: 'A', text: '激发进口潜力' },
        { key: 'B', text: '持续放宽市场准入' },
        { key: 'C', text: '打造对外开放新高地' },
        { key: 'D', text: '推动多边和双边合作深入发展' },
      ],
    },
    expected: [],
  },
];

let failed = 0;
for (const testCase of cases) {
  const actual = codes(testCase.question);
  try {
    assert.deepStrictEqual(actual, testCase.expected);
    console.log(`[PASS] ${testCase.name}: ${actual.join(',') || '无命中'}`);
  } catch (error) {
    failed++;
    console.error(`[FAIL] ${testCase.name}`);
    console.error(`  期望: ${testCase.expected.join(',') || '无命中'}`);
    console.error(`  实际: ${actual.join(',') || '无命中'}`);
  }
}

if (failed > 0) {
  console.error(`\n[FAIL] ${failed} 个用例失败`);
  process.exit(1);
}
console.log('\n[PASS] E10 全部用例通过。');
