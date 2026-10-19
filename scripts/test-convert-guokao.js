/**
 * convert-guokao.js 回归测试
 *
 * 覆盖本轮 5 项修复：
 *   1. 材料范围首题不再被吞（2017 副省级 Q51 / Q56）
 *   2. Q52/Q53 选项黏连切分
 *   3. scanBlocks 材料边界（材料正文不含首题题干）
 *   4. 图片题使用独立豁免码 IMAGE_OPTION
 *   5. 同题号 MISSING_ANSWER 去重
 *
 * 运行：node scripts/test-convert-guokao.js
 */

import assert from 'node:assert/strict';
import {
  preSplitText,
  splitStemAndOptions,
  scanBlocks,
  buildXingceQuestions,
  validatePaper,
} from './convert-guokao.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`[FAIL] ${name}`);
    console.error(err && err.stack ? err.stack : err);
  }
}

const FIXTURE = [
  '一、言语理解与表达。',
  '51、根据所给材料，回答 51~55 题。',
  '技术为自身的生存和发展而战，并且有着独特的生命周期。从单细胞生物到人类，技术一直在演化。技术的进化与生物进化有相似之处，但技术可以跨越世代传递。技术的生命周期包括发明、发展、成熟和衰退四个阶段。得到那些溺爱它们的监护者（也许还包括最初的发明者）的保护和支持。',
  '填入文中画横线部分最恰当的一句是：',
  'A、怀胎数月最终分娩的过程一样 B、流星划过夜空那样璀璨而耀眼 C、人类当年在月球上迈出第一步 D、人类文明酝酿以及发展的过程 52、作者举亨利·福特的例子是为了说明：',
  'A、汽车产业中的工匠精神决定着工艺水平 B、技术产业的发展决定了技术应用的前景',
  'C、技术推广中的额外发明比独创发明更关键 D、独创性发明本身并不一定具有核心竞争力 53、下列哪种现象可能发生在技术发展的“挑战者时期”？',
  'A、数码相机抢夺胶卷相机的市场 B、打字机的功能完全被电脑所代替',
  'C、凡尔纳小说已有对潜艇的构想 D、人们的日常生活离不开智能手机',
  '56、根据所给材料，回答 56~60 题。',
  '我们的生活被各式各样的信息塞满挤爆，常常来不及消化，就被迫接收下一个信息。互联网的普及让信息传播变得前所未有的便捷，但也带来了信息过载的问题。人们每天面对海量的信息，注意力被不断分散，深度思考的时间被压缩。',
  '下面这个段落最适合放在文中哪个位置？',
  '大脑预设人脸一定是凸出来的，所以凹进去的人脸会被误认为凸出来。这种认知不可穿透性说明，人的知觉并不完全依赖感官输入，还受到先验假设的影响。',
  'A、① B、② C、③ D、④',
  '57、关于认知不可穿透性，下列说法正确的是：',
  'A、它只存在于视觉领域 B、它说明知觉完全由感官决定 C、它表明先验知识会影响知觉 D、它可以通过训练完全消除',
].join('\n');

function makeChoice(num, overrides = {}) {
  return {
    id: `gk-test-${num}`,
    category: 'national',
    module: 'yanyu',
    title: '测试题',
    stem: '下列说法正确的是：',
    options: [
      { key: 'A', text: '甲' },
      { key: 'B', text: '乙' },
      { key: 'C', text: '丙' },
      { key: 'D', text: '丁' },
    ],
    answer: 'A',
    explanation: '测试解析',
    keyPoints: [],
    thinkingTip: '',
    difficulty: '中等',
    source: '测试',
    num,
    ...overrides,
  };
}

test('preSplitText 切开选项行尾黏连的 52、53 题号', () => {
  const text = preSplitText(FIXTURE);
  assert.match(text, /(?:^|\n)52、作者举亨利·福特的例子/);
  assert.match(text, /(?:^|\n)53、下列哪种现象/);
});

test('preSplitText 切开数字开头的下一题（2020 地市 Q128）', () => {
  const raw = '127、第二段中（X）处应填入的数值最可能是： A、15.0 B、13.7 C、17.6 D、16.3 128、2018 年，B 市零售额同比增长了：';
  const text = preSplitText(raw);
  assert.match(text, /(?:^|\n)128、2018 年/);
  const items = scanBlocks(text);
  const q127 = items.find(it => it.type === 'question' && it.num === 127);
  const q128 = items.find(it => it.type === 'question' && it.num === 128);
  assert.ok(q127, 'Q127 应存在');
  assert.ok(q128, 'Q128 应存在');
  assert.match(q128.body, /2018 年，B 市零售额同比增长了/);
});

test('preSplitText 不跨行粘连独立的 125、/126、题号', () => {
  const raw = '124、以下说法正确的是： A、甲 B、乙 C、丙 D、丁\n125、\n126、根据资料，下列可以解释的是：';
  const text = preSplitText(raw);
  assert.match(text, /(?:^|\n)125、(?:\n|$)/);
  assert.match(text, /(?:^|\n)126、根据资料/);
  const items = scanBlocks(text);
  assert.ok(items.find(it => it.type === 'question' && it.num === 125), 'Q125 应存在');
  assert.ok(items.find(it => it.type === 'question' && it.num === 126), 'Q126 应存在');
});

test('scanBlocks 补出材料范围首题 Q51，且材料不吞题干', () => {
  const items = scanBlocks(FIXTURE);
  const q51 = items.find(it => it.type === 'question' && it.num === 51);
  assert.ok(q51, 'Q51 应存在');
  assert.match(q51.body, /填入文中画横线部分最恰当的一句是/);
  const parsed = splitStemAndOptions(q51.body);
  assert.equal(parsed.options.length, 4, 'Q51 应拆出 4 个选项');
  assert.equal(parsed.options.map(o => o.key).join(''), 'ABCD');

  const mat51 = items.find(it => it.type === 'material' && it.from === 51);
  assert.ok(mat51, 'Q51 材料应存在');
  assert.match(mat51.text, /技术为自身的生存和发展而战/);
  assert.doesNotMatch(mat51.text, /填入文中画横线部分/);
});

test('Q52/Q53 均独立成题且选项完整', () => {
  const items = scanBlocks(FIXTURE);
  for (const num of [52, 53]) {
    const q = items.find(it => it.type === 'question' && it.num === num);
    assert.ok(q, `Q${num} 应存在`);
    const parsed = splitStemAndOptions(q.body);
    assert.equal(parsed.options.length, 4, `Q${num} 应拆出 4 个选项`);
    assert.equal(parsed.options.map(o => o.key).join(''), 'ABCD');
  }
});

test('scanBlocks 材料边界：Q56 题干与材料分离', () => {
  const items = scanBlocks(FIXTURE);
  const q56 = items.find(it => it.type === 'question' && it.num === 56);
  assert.ok(q56, 'Q56 应存在');
  assert.match(q56.body, /下面这个段落最适合放在文中哪个位置/);
  assert.match(q56.body, /大脑预设人脸一定是凸出来的/);

  const mat56 = items.find(it => it.type === 'material' && it.from === 56);
  assert.ok(mat56, 'Q56 材料应存在');
  assert.match(mat56.text, /我们的生活被各式各样的信息塞满挤爆/);
  assert.doesNotMatch(mat56.text, /下面这个段落最适合放在文中/);
});

test('buildXingceQuestions 将材料挂到 Q51/Q56 且材料不含题干', () => {
  const built = buildXingceQuestions(FIXTURE, { year: 2024, label: '测试', kind: '行测' });
  const q51 = built.questions.find(q => q.num === 51);
  const q56 = built.questions.find(q => q.num === 56);
  assert.ok(q51 && q56);
  assert.match(q51.material, /技术为自身的生存和发展而战/);
  assert.doesNotMatch(q51.material, /填入文中画横线部分/);
  assert.match(q56.material, /我们的生活被各式各样的信息塞满挤爆/);
  assert.doesNotMatch(q56.material, /下面这个段落最适合放在文中/);
});

test('validatePaper 对同题号 MISSING_ANSWER 去重并标记 answerMissing', () => {
  const q = makeChoice(60, { answer: '' });
  const meta = { year: 2025, label: '测试', kind: '行测' };
  const baseIssues = [
    { num: 60, code: 'MISSING_ANSWER', detail: '未找到「故正确答案为 X」' },
    { num: 60, code: 'MISSING_ANSWER', detail: '答案为空' },
  ];
  const { issues, stats } = validatePaper([q], meta, baseIssues);
  const missing = issues.filter(it => it.code === 'MISSING_ANSWER' && it.num === 60);
  assert.equal(missing.length, 1, 'Q60 只应保留一条 MISSING_ANSWER');
  assert.ok(missing[0].id, '保留带 id 的逐题记录');
  assert.equal(q.answerMissing, true);
  assert.equal(stats.missingAnswers, 1);
});

test('图片题选项使用独立豁免码 IMAGE_OPTION', () => {
  const q = makeChoice(61, { isImageQuestion: true, options: [] });
  const meta = { year: 2025, label: '测试', kind: '行测' };
  const baseIssues = [
    { num: 61, code: 'OPT_SPLIT_FAIL', detail: '未能拆出 A-D 选项' },
  ];
  const { issues } = validatePaper([q], meta, baseIssues);
  const imageIssues = issues.filter(it => it.code === 'IMAGE_OPTION' && it.num === 61);
  assert.equal(imageIssues.length, 1, '同一图片题只保留一条 IMAGE_OPTION');
  assert.equal(imageIssues[0].level, 'WARN');
  assert.equal(issues.some(it => it.code === 'OPT_NOT_4' && it.num === 61), false);
  assert.equal(issues.some(it => it.code === 'OPT_SPLIT_FAIL' && it.num === 61), false);
});

test('普通文本题仍保留 OPT_NOT_4，不被图片豁免码吞掉', () => {
  const q = makeChoice(62, { options: [] });
  const meta = { year: 2025, label: '测试', kind: '行测' };
  const { issues } = validatePaper([q], meta, []);
  assert.equal(issues.some(it => it.code === 'OPT_NOT_4' && it.num === 62), true);
  assert.equal(issues.some(it => it.code === 'IMAGE_OPTION' && it.num === 62), false);
});

console.log(`\n===== 回归测试结果：PASS ${passed} / FAIL ${failed} =====`);
if (failed > 0) process.exitCode = 1;


