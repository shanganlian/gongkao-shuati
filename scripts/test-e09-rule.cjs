#!/usr/bin/env node
/**
 * E09 规则回归测试。
 *
 * 覆盖：
 *   1. 2000 国考 82：字母+事物选项 + 多城市 + 缺图 → E09-A/E09-B
 *   2. 同一题补 imageUrl 后 → 不命中
 *   3. 纯 X/Y/Z 选项 → 命中
 *   4. 城市选项 + Y节目题干 → 命中 E09-B
 *   5. 材料有完整表格数据 → 不命中
 *   6. 非资料题出现 X/Y/Z → 不命中
 *   7. 资料题有字母占位但没有图表引用 → 不命中
 *
 * 退出码：有失败 → 1；全部通过 → 0
 */
'use strict';

const assert = require('node:assert');
const { getE09Issues } = require('./lib/e09-rule.cjs');

function codes(question) {
  return getE09Issues(question).map(item => item.code).sort();
}

const targetMaterial =
  '所给出的图、表或一段文字均有 5 个问题要你回答。你应根据资料提供的信息进行分析、比较、计算和判断处理。\n' +
  '一、请\n。\n下面的三角形表示甲、乙、丙、丁、戊五个城市的中学生对 X、Y、Z 三个电视节目的喜欢情况调查结果。如甲城喜欢 X 节目的占 30%，喜欢 Y 节目的占 70%，无人喜欢 Z 节目；而丙城 20％喜欢 X 节目，50％喜欢 Y 节目，30%喜欢 Z 节目。';

const cases = [
  {
    name: '2000 国考 82：字母+事物选项 + 多城市 + 缺图',
    question: {
      module: 'ziliao',
      stem: '甲城中学生与丁城中学生共同特点是（ ）。',
      material: targetMaterial,
      options: [
        { key: 'A', text: '不喜欢 X 节目' },
        { key: 'B', text: '不喜欢 Y 节目' },
        { key: 'C', text: '不喜欢 Z 节目' },
        { key: 'D', text: '没有共同点' },
      ],
    },
    expected: ['E09-A', 'E09-B'],
  },
  {
    name: '同一题补 imageUrl 后不再命中',
    question: {
      module: 'ziliao',
      stem: '甲城中学生与丁城中学生共同特点是（ ）。',
      material: targetMaterial,
      imageUrl: '/data/questions/images/gk-2000-triangle.jpg',
      options: [
        { key: 'A', text: '不喜欢 X 节目' },
        { key: 'B', text: '不喜欢 Y 节目' },
        { key: 'C', text: '不喜欢 Z 节目' },
        { key: 'D', text: '没有共同点' },
      ],
    },
    expected: [],
  },
  {
    name: '纯 X/Y/Z 选项',
    question: {
      module: 'ziliao',
      stem: '戊城中学生最喜欢的节目是（ ）。',
      material: targetMaterial,
      options: [
        { key: 'A', text: 'X' },
        { key: 'B', text: 'Y' },
        { key: 'C', text: 'Z' },
        { key: 'D', text: '不能判断' },
      ],
    },
    expected: ['E09-A', 'E09-B'],
  },
  {
    name: '城市选项 + Y节目题干',
    question: {
      module: 'ziliao',
      stem: 'Y 节目最受欢迎的城市是（ ）。',
      material: targetMaterial,
      options: [
        { key: 'A', text: '丁城' },
        { key: 'B', text: '甲城' },
        { key: 'C', text: '戊城' },
        { key: 'D', text: '丙城' },
      ],
    },
    expected: ['E09-B'],
  },
  {
    name: '材料有完整表格数据',
    question: {
      module: 'ziliao',
      stem: '甲城与丁城中学生共同特点是（ ）。',
      material:
        '城市 | X节目 | Y节目 | Z节目\n甲城 | 30% | 70% | 0%\n乙城 | 20% | 50% | 30%\n丙城 | 25% | 50% | 25%\n丁城 | 0% | 100% | 0%',
      options: [
        { key: 'A', text: '不喜欢 X 节目' },
        { key: 'B', text: '不喜欢 Y 节目' },
        { key: 'C', text: '不喜欢 Z 节目' },
        { key: 'D', text: '没有共同点' },
      ],
    },
    expected: [],
  },
  {
    name: '非资料题出现 X/Y/Z 不命中',
    question: {
      module: 'panduan',
      stem: '关于 X、Y、Z 三人的关系，下列哪项符合规律？',
      material: '',
      options: [
        { key: 'A', text: 'X 比 Y 高' },
        { key: 'B', text: 'Y 比 Z 高' },
        { key: 'C', text: 'Z 比 X 高' },
        { key: 'D', text: '无法判断' },
      ],
    },
    expected: [],
  },
  {
    name: '有字母占位但没有图表引用',
    question: {
      module: 'ziliao',
      stem: '下列关于 X、Y、Z 三个项目的说法，正确的是：',
      material: 'X 项目 10 万元，Y 项目 20 万元，Z 项目 30 万元。',
      options: [
        { key: 'A', text: 'X' },
        { key: 'B', text: 'Y' },
        { key: 'C', text: 'Z' },
        { key: 'D', text: '无法判断' },
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
console.log('\n[PASS] E09 全部用例通过。');
