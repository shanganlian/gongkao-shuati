/**
 * 面试大厅 v1.0 · 评分链路冒烟测试（无需网络、无需 DEEPSEEK_API_KEY）
 *
 * 覆盖：
 *  1. 本地规则评分：采分点命中、总分/等级、改进项必须带示范句
 *  2. prompt 构建：每条采分点都进 prompt，硬对照条数写死
 *  3. normalizeInterviewReview：模型少给条目/乱给分数也能被收敛成合法结构
 *  4. parseJsonLoose / isInterviewReview / sanitizeReviewRequest 边界
 *
 * 运行：node --import tsx scripts/smoke-interview-review.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bigramOverlap,
  buildLocalInterviewReview,
  computeExpressionMetrics,
  gradeOf,
} from '../src/lib/interviewScoring';
import {
  INTERVIEW_REVIEW_SYSTEM_PROMPT,
  buildDegradedReview,
  buildInterviewReviewPrompt,
  isInterviewReview,
  normalizeInterviewReview,
  parseJsonLoose,
  sanitizeReviewRequest,
  type InterviewReviewRequest,
} from '../shared/interview-review';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bank = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public/data/interview/questions.json'), 'utf8')
);
const question = bank.questions.find((item: any) => item.id === 'si-zh-001') || bank.questions[0];

const results: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, condition: boolean, detail?: string) {
  results.push({ name, ok: condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail && !condition ? ` → ${detail}` : ''}`);
}

const ANSWER =
  '我认为这不是老人不学习的问题，而是服务没跟上。第一，先保留人工窗口、现金和纸质表单，设帮办专窗，明确不得以线上为由拒办；第二，安排网格员上门代办，开通亲属亲情授权，把界面做成大字版和语音版；第三，把老年人办成率和投诉率纳入考核，建立回访纠错。总之，便民不能变成便官，服务不能只讲速度不讲温度。';

// 1. 本地规则评分
const metrics = computeExpressionMetrics(ANSWER, 95);
const local = buildLocalInterviewReview({ question, answerText: ANSWER, metrics });

check('metrics 字数统计', metrics.charCount > 100, `charCount=${metrics.charCount}`);
check(
  'metrics 语速计算',
  metrics.speechRateWpm > 60 && metrics.speechRateWpm < 400,
  `wpm=${metrics.speechRateWpm}`
);
check('本地报告 provider=local 且 degraded', local.provider === 'local' && local.degraded === true);
check('采分点判定条数等于题目条数', local.pointHits.length === question.keyPoints.length);
check('命中数自洽', local.pointsHitCount === local.pointHits.filter((hit) => hit.hit).length);
check('至少命中 3 条采分点', local.pointsHitCount >= 3, `命中=${local.pointsHitCount}`);
check(
  'criticalMissed 与采分点 critical 标记一致',
  local.criticalMissed.every((index) => question.keyPoints[index - 1]?.critical === true) &&
    question.keyPoints.every(
      (point: any, index: number) =>
        !point.critical || local.pointHits[index].hit || local.criticalMissed.includes(index + 1)
    )
);
check(
  '总分 0-100 且等级合法',
  local.overallScore >= 0 && local.overallScore <= 100 && !!gradeOf(local.overallScore)
);
check(
  '改进项非空且带示范句',
  local.improvements.length > 0 && local.improvements.every((item) => !!item.example)
);
check('本地报告通过 isInterviewReview', isInterviewReview(local));

const vagueText = '我觉得要高度重视，提升站位，多措并举，把工作做好。';
const vague = buildLocalInterviewReview({
  question,
  answerText: vagueText,
  metrics: computeExpressionMetrics(vagueText, 20),
});
check('空泛作答命中率低', vague.pointsHitCount <= 1, `命中=${vague.pointsHitCount}`);
check(
  '空泛作答分数明显更低',
  vague.overallScore < local.overallScore,
  `${vague.overallScore} < ${local.overallScore}`
);

// 2. prompt 构建
const input: InterviewReviewRequest = {
  question: {
    id: question.id,
    category: question.category,
    subType: question.subType,
    difficulty: question.difficulty,
    scene: question.scene,
    title: question.title,
    task: question.task,
    answerSeconds: question.answerSeconds,
    keyPoints: question.keyPoints,
    pitfalls: question.pitfalls,
    referenceOutline: question.referenceOutline,
  },
  answerText: ANSWER,
  durationSeconds: 95,
  inputMode: 'voice',
};
const prompt = buildInterviewReviewPrompt(input, metrics);
check('prompt 含全部采分点', question.keyPoints.every((point: any) => prompt.includes(point.text)));
check('prompt 写死判定条数', prompt.includes(`必须输出 ${question.keyPoints.length} 条`));
check('prompt 含 criticalMissed 规则', prompt.includes('criticalMissed') && prompt.includes('漏答'));
check('prompt 含表达指标数字', prompt.includes(`${metrics.speechRateWpm} 字/分钟`));
check('prompt 明确禁止空话', INTERVIEW_REVIEW_SYSTEM_PROMPT.includes('回答要有深度'));

// 3. normalizeInterviewReview：模型故意少给条目、给高分
const raw = {
  pointHits: [
    { index: 1, hit: true, evidence: '不是老人不学习，而是服务没跟上' },
    { index: 3, hit: true, evidence: '保留人工窗口' },
  ],
  criticalMissed: [4, 5],
  relevance: { score: 90, comment: '命中 2 条' },
  structure: { score: 80, comment: '有分层' },
  expression: { score: 70, comment: '语速正常' },
  overallScore: 88,
  highlights: [],
  improvements: [],
  modelOutline: [],
};
const normalized = normalizeInterviewReview(raw, input, metrics);
const expectedOverall = 88 - Math.min(9, normalized.criticalMissed.length * 3);

check('normalize 补齐全部采分点', normalized.pointHits.length === question.keyPoints.length);
check('normalize 重算命中数', normalized.pointsHitCount === 2);
check('normalize 忽略模型自报 criticalMissed', normalized.criticalMissed.join(',') === '2,4');
check(
  'normalize 扣分惩罚生效',
  normalized.overallScore === expectedOverall,
  `${normalized.overallScore} vs ${expectedOverall}`
);
check('normalize 等级按总分重算', normalized.grade === gradeOf(normalized.overallScore));
check(
  'normalize provider=deepseek 且未降级',
  normalized.provider === 'deepseek' && normalized.degraded === false
);
check('normalize 自动补亮点与改进', normalized.highlights.length > 0 && normalized.improvements.length > 0);
check('normalize 输出通过 isInterviewReview', isInterviewReview(normalized));

// 4. 解析与入参边界
check('parseJsonLoose 去掉 markdown 围栏', JSON.stringify(parseJsonLoose('```json\n{"a":1}\n```')) === '{"a":1}');
check('parseJsonLoose 容忍前后语', parseJsonLoose('前面的话 {"a":{"b":2}} 后面的话').a.b === 2);
check('isInterviewReview 拒绝空对象', isInterviewReview({}) === false);

const good = sanitizeReviewRequest(input);
check(
  'sanitize 接受合法入参',
  good.ok === true && good.value?.question.keyPoints.length === question.keyPoints.length
);
check('sanitize 拒绝空 answerText', sanitizeReviewRequest({ ...input, answerText: '   ' }).ok === false);
check(
  'sanitize 拒绝非法分类',
  sanitizeReviewRequest({ ...input, question: { ...input.question, category: '无领导' } }).ok === false
);
check(
  'sanitize 忽略多余字段',
  sanitizeReviewRequest({ ...input, admin: true } as any).value?.question.id === question.id
);

const degraded = buildDegradedReview(input, metrics, '模拟失败');
check('buildDegradedReview 标注原因并降级', degraded.degraded === true && degraded.reason === '模拟失败');

// 5. 相似度一致性
check('bigramOverlap 完全重合=1', Math.abs(bigramOverlap(ANSWER, ANSWER) - 1) < 1e-9);

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length > 0) {
  console.error('失败项：', failed.map((item) => item.name).join('；'));
  process.exit(1);
}

