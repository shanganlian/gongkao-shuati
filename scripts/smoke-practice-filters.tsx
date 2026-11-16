/**
 * 刷题页筛选与缺图占位 · 冒烟（不依赖浏览器）
 *
 * 覆盖：
 *  - source 年份解析（正常 / 无年份 / 越界）
 *  - 年份筛选语义（'all' 与非法值不限，具体年份精确比对）
 *  - 年份题量标注（count / label）与年份空结果文案（含「2006 空 → 切国考卷 → 有题」链路）
 *  - 年份下拉选项 2000–2025 倒序完整性
 *  - 缺图占位：完整版含答案与跳过按钮、只读版无按钮、compact 版文案
 *
 * 用法：npm run practice:smoke
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  parseQuestionYear,
  matchesQuestionYear,
  countQuestionsInYear,
  formatYearCountLabel,
  describeYearEmptyState,
  QUESTION_YEAR_OPTIONS,
  QUESTION_YEAR_MIN,
  QUESTION_YEAR_MAX,
} from '../src/lib/questionYear.ts';
import { MissingFigurePlaceholder } from '../src/components/MissingFigurePlaceholder.tsx';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
}

// 1. source 年份解析
const parseCases: Array<[string | undefined, number | null]> = [
  ['2015年国家公务员考试《行测》副省级第1题', 2015],
  ['2025国考行政执法卷', 2025],
  ['2000年国考', 2000],
  ['1998年国考（早于区间）', null],
  ['2026年国考（晚于区间）', null],
  ['第3题（无年份）', null],
  ['', null],
  [undefined, null],
];
parseCases.forEach(([source, expected]) => {
  const actual = parseQuestionYear(source);
  check(`parse ${String(source) || '(空)'}`, actual === expected, `${String(actual)} / 期望 ${String(expected)}`);
});

// 2. 年份筛选语义
check('filter all 不限', matchesQuestionYear('2015年国考', 'all'));
check('filter 2015 命中', matchesQuestionYear('2015年国家公务员考试《行测》第1题', '2015'));
check('filter 2015 排除 2016', !matchesQuestionYear('2016年国家公务员考试《行测》第1题', '2015'));
check('filter 非法值不限', matchesQuestionYear('2015年国考', 'abc'));
check('filter 空 source 不命中具体年份', !matchesQuestionYear(undefined, '2015'));

// 3. 年份题量标注（筛选条与空结果共用同一口径）
const samplePool = [
  { source: '2006年国家公务员考试《行测》一卷第51题' },
  { source: '2006年国家公务员考试《行测》二卷第80题' },
  { source: '2010年国家公务员考试《行测》第56题' },
  { source: undefined },
];
check('count all 返回总数', countQuestionsInYear(samplePool, 'all') === samplePool.length);
check('count 2006 命中 2 题', countQuestionsInYear(samplePool, '2006') === 2, String(countQuestionsInYear(samplePool, '2006')));
check('count 2016 为 0 题', countQuestionsInYear(samplePool, '2016') === 0);
check('count 非法值返回总数', countQuestionsInYear(samplePool, 'abc') === samplePool.length);
check('count 空串返回总数', countQuestionsInYear(samplePool, '') === samplePool.length);
check('label 2006 · 2 题', formatYearCountLabel('2006', 2) === '2006 年 · 2 题', String(formatYearCountLabel('2006', 2)));
check('label 不限年份为 null', formatYearCountLabel('all', 4) === null);

// 4. 年份空结果文案 + 2006 空 → 切到国考卷 → 有题（真实筛选链路口径）
const emptyCopy = describeYearEmptyState('2006', 120, 0);
check(
  '空结果文案含年份与范围题量',
  !!emptyCopy && emptyCopy.title.includes('2006') && emptyCopy.detail.includes('120 题'),
  emptyCopy ? emptyCopy.title : 'null'
);
check('空结果：不限年份时为 null', describeYearEmptyState('all', 120, 0) === null);
check('空结果：范围本身 0 题时为 null', describeYearEmptyState('2006', 0, 0) === null);
check('空结果：该年已有题时为 null', describeYearEmptyState('2006', 120, 3) === null);

// 省考范围没有 2006 真题 → 空结果并给出「切换到国考卷」出口；切换后同一 2006 有题
const provincialPool = [
  { source: '2010年4月25日公务员联考《行测》第1题' },
  { source: '2012年4月21日公务员联考《行测》第2题' },
];
const nationalPool = provincialPool.concat([{ source: '2006年国家公务员考试《行测》一卷第51题' }]);
const beforeSwitch = describeYearEmptyState(
  '2006',
  provincialPool.length,
  countQuestionsInYear(provincialPool, '2006')
);
check(
  '2006 在联考范围 0 题 → 空结果可切换',
  countQuestionsInYear(provincialPool, '2006') === 0 && !!beforeSwitch,
  beforeSwitch ? beforeSwitch.detail : 'null'
);
const afterSwitchCount = countQuestionsInYear(nationalPool, '2006');
check(
  '切换到国考卷后 2006 有题',
  afterSwitchCount === 1 &&
    describeYearEmptyState('2006', nationalPool.length, afterSwitchCount) === null,
  `命中 ${afterSwitchCount} 题`
);

// 5. 下拉选项完整性
check(
  'options 覆盖 2000–2025 且倒序',
  QUESTION_YEAR_OPTIONS.length === QUESTION_YEAR_MAX - QUESTION_YEAR_MIN + 1 &&
    QUESTION_YEAR_OPTIONS[0] === QUESTION_YEAR_MAX &&
    QUESTION_YEAR_OPTIONS[QUESTION_YEAR_OPTIONS.length - 1] === QUESTION_YEAR_MIN,
  `${QUESTION_YEAR_OPTIONS[0]} → ${QUESTION_YEAR_OPTIONS[QUESTION_YEAR_OPTIONS.length - 1]}，共 ${QUESTION_YEAR_OPTIONS.length} 项`
);

// 6. 缺图占位组件
const skipCalls: number[] = [];
const fullHtml = renderToStaticMarkup(
  <MissingFigurePlaceholder answer="C" onSkip={() => skipCalls.push(1)} />
);
check('占位显示缺图标题', fullHtml.includes('本题配图缺失'));
check('占位显示参考答案', fullHtml.includes('参考答案：C'));
check('占位显示跳过按钮', fullHtml.includes('跳过本题</button>'));

const readOnlyHtml = renderToStaticMarkup(<MissingFigurePlaceholder answer="C" />);
check('只读占位无跳过按钮', !readOnlyHtml.includes('跳过本题</button>') && readOnlyHtml.includes('本题配图缺失'));

const compactHtml = renderToStaticMarkup(<MissingFigurePlaceholder compact answer="B" />);
check(
  'compact 占位文案与答案',
  compactHtml.includes('本题配图缺失') && compactHtml.includes('答案：B')
);

// 7. 输出
const failed = results.filter((item) => !item.ok);
results.forEach((item) => {
  console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? `  → ${item.detail}` : ''}`);
});
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exit(1);
