/**
 * 面试大厅 v1.0 · 复盘评分共享层
 *
 * 被三处引用：
 *  - server.ts（本地 dev，tsx 直跑）
 *  - netlify/functions/api.ts（线上 Functions，esbuild 打包）
 *  - src/services/interviewReviewService.ts（前端，仅用常量与响应校验）
 *
 * 约束：本文件不读 process.env、不碰文件系统、不依赖 DOM，保持纯函数。
 */
import type {
  ExpressionMetrics,
  InterviewDimensionScore,
  InterviewImprovement,
  InterviewKeyPoint,
  InterviewKeyPointHit,
  InterviewQuestionCategory,
  InterviewQuestionDifficulty,
  InterviewReview,
} from '../src/types';
import { buildLocalInterviewReview, computeExpressionMetrics, gradeOf } from '../src/lib/interviewScoring';

/** 前后端共用端点；本地 dev 由 server.ts 提供，线上由 netlify/functions/api.ts 提供 */
export const INTERVIEW_REVIEW_ENDPOINT = '/api/interview-review';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';
/** 略小于前端 30s 超时，保证前端先收到“降级”结果而不是裸超时 */
export const INTERVIEW_REVIEW_TIMEOUT_MS = 26000;
/** 低于该字数不浪费 token 调 AI，直接走本地规则并显式标注 degraded */
export const ANSWER_MIN_CHARS = 30;
export const ANSWER_MAX_CHARS = 4000;

/** 只把评分必需的题目字段传给模型，避免整份题库字段外泄 */
export interface InterviewReviewQuestionPayload {
  id: string;
  category: InterviewQuestionCategory;
  subType: string;
  difficulty: InterviewQuestionDifficulty;
  scene?: string;
  title: string;
  task: string;
  answerSeconds: number;
  keyPoints: InterviewKeyPoint[];
  pitfalls: string[];
  referenceOutline: string[];
}

export interface InterviewReviewRequest {
  question: InterviewReviewQuestionPayload;
  answerText: string;
  durationSeconds: number;
  inputMode: 'voice' | 'typing';
}

/** 端点统一响应壳：review 一定存在（AI 失败时为本地规则版） */
export interface InterviewReviewResponse {
  review: InterviewReview;
  /** 仅用于服务端日志/前端提示，不参与评分 */
  note?: string;
}

const CATEGORIES: InterviewQuestionCategory[] = [
  '综合分析',
  '组织管理',
  '应急应变',
  '人际沟通',
  '自我认知',
  '言语表达',
];
const DIFFICULTIES: InterviewQuestionDifficulty[] = ['基础', '中等', '拔高'];

export function clipText(value: unknown, max = 80): string {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, max).join('');
}

export function asStringArray(value: unknown, max: number, itemMax = 80): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => clipText(item, itemMax))
    .filter((item) => item.length > 0)
    .slice(0, max);
}

export interface SanitizeResult {
  ok: boolean;
  value?: InterviewReviewRequest;
  error?: string;
}

/**
 * 服务端入参白名单校验：前端传来的对象一律按字段重建，不信任任何多余字段。
 * 采分点条数上限 8，防止恶意长列表拉爆 prompt 与 token。
 */
export function sanitizeReviewRequest(body: unknown): SanitizeResult {
  if (!body || typeof body !== 'object') return { ok: false, error: '请求体必须是 JSON 对象' };
  const raw = body as Record<string, any>;
  const rawQuestion = raw.question;
  if (!rawQuestion || typeof rawQuestion !== 'object') return { ok: false, error: '缺少 question' };

  const id = clipText(rawQuestion.id, 40);
  const title = clipText(rawQuestion.title, 400);
  const task = clipText(rawQuestion.task, 200);
  if (!id) return { ok: false, error: 'question.id 不能为空' };
  if (!title) return { ok: false, error: 'question.title 不能为空' };

  const category = CATEGORIES.includes(rawQuestion.category) ? rawQuestion.category : null;
  if (!category) return { ok: false, error: 'question.category 非法' };
  const difficulty = DIFFICULTIES.includes(rawQuestion.difficulty) ? rawQuestion.difficulty : null;
  if (!difficulty) return { ok: false, error: 'question.difficulty 非法' };

  const keyPoints: InterviewKeyPoint[] = Array.isArray(rawQuestion.keyPoints)
    ? rawQuestion.keyPoints
        .map((point: any) => {
          if (typeof point === 'string') return { text: clipText(point, 120) };
          return { text: clipText(point && point.text, 120), critical: point && point.critical === true };
        })
        .filter((point: InterviewKeyPoint) => point.text.length > 0)
        .slice(0, 8)
    : [];
  if (keyPoints.length === 0) return { ok: false, error: 'question.keyPoints 不能为空' };

  const answerText = typeof raw.answerText === 'string' ? raw.answerText.trim() : '';
  if (!answerText) return { ok: false, error: 'answerText 不能为空' };
  if (Array.from(answerText).length > ANSWER_MAX_CHARS) {
    return { ok: false, error: `answerText 超过 ${ANSWER_MAX_CHARS} 字上限` };
  }

  const durationSecondsRaw = Number(raw.durationSeconds);
  const durationSeconds = Number.isFinite(durationSecondsRaw)
    ? Math.min(3600, Math.max(0, Math.round(durationSecondsRaw)))
    : 0;

  const inputMode = raw.inputMode === 'typing' ? 'typing' : 'voice';
  const answerSecondsRaw = Number(rawQuestion.answerSeconds);
  const answerSeconds = Number.isFinite(answerSecondsRaw)
    ? Math.min(600, Math.max(30, Math.round(answerSecondsRaw)))
    : 180;

  return {
    ok: true,
    value: {
      question: {
        id,
        category,
        subType: clipText(rawQuestion.subType, 20) || '通用',
        difficulty,
        scene: clipText(rawQuestion.scene, 120) || undefined,
        title,
        task,
        answerSeconds,
        keyPoints,
        pitfalls: asStringArray(rawQuestion.pitfalls, 4, 80),
        referenceOutline: asStringArray(rawQuestion.referenceOutline, 8, 60),
      },
      answerText,
      durationSeconds,
      inputMode,
    },
  };
}

export function metricsOf(input: InterviewReviewRequest): ExpressionMetrics {
  return computeExpressionMetrics(input.answerText, input.durationSeconds);
}

const SYSTEM_PROMPT = `你是中国公务员结构化面试的正厅级主考官，阅卷 15 年，以“对照采分点逐条核对”为唯一评分方式。
铁律：
1. 只依据【本题采分点】判断，不引入你自己的答题标准，不因文采加分。
2. 采分点必须逐条给结论：命中就 hit=true，未命中就 hit=false，绝不允许“部分命中”“基本沾边”这类模糊结论。
3. 看不出对应表述就是未命中；宁可漏判，不可脑补。
4. 点评必须可执行、可对照：写清“哪句话/哪个环节缺什么、补什么”，禁止“回答要有深度”“站位要高”“语言要流畅”这类无法验证的空话。
5. 只输出 JSON，不输出 markdown 代码块、解释或前后缀。`;

/**
 * 评分 prompt：采分点逐条硬对照写死，不给模型自由发挥空间。
 * index 用 1 基序号，与报告里的 ①②③ 一一对应。
 */
export function buildInterviewReviewPrompt(
  input: InterviewReviewRequest,
  metrics: ExpressionMetrics
): string {
  const { question, answerText } = input;
  const pointLines = question.keyPoints
    .map((point, index) => {
      const mark = point.critical ? '【主线·漏答必点名】' : '【补充】';
      return `${index + 1}. ${mark}${point.text}`;
    })
    .join('\n');
  const pitfallLines = question.pitfalls.length
    ? question.pitfalls.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '（本题未提供）';

  return `请对下面这一道结构化面试题的单人作答做“采分点逐条硬对照 + 三维度评分”。

【题目分类】${question.category} · ${question.subType} · 难度${question.difficulty}
${question.scene ? `【考场设定】${question.scene}\n` : ''}【题干】${question.title}
【设问】${question.task}
【本题限时】${question.answerSeconds} 秒

【本题采分点（共 ${question.keyPoints.length} 条，判定必须严格按此顺序，不得增删）】
${pointLines}

【本题常见扣分点（仅用于组织 improvements，不参与 pointHits 判定）】
${pitfallLines}

【考生作答原文（语音转写，可能有错别字与口语残句，按语义判断）】
"""
${answerText}
"""

【可客观测量的表达指标（由前端统计，可直接引用数字）】
- 有效字数：${metrics.charCount} 字
- 实际作答时长：${metrics.durationSeconds} 秒
- 语速：${metrics.speechRateWpm} 字/分钟
- 口头禅/填充词：${metrics.fillerCount} 次${metrics.fillerWords.length ? `（${metrics.fillerWords.join('、')}）` : ''}

【判定与评分规则】
A. pointHits：必须输出 ${question.keyPoints.length} 条，index 依次为 1…${question.keyPoints.length}。
   - hit=true 时，evidence 必须引用考生原话中支撑该采分点的片段（不超过 30 字，可截断，不得改写）。
   - hit=false 时，evidence 留空字符串。
   - criticalMissed 列出所有“critical 采分点且 hit=false”的 index；无则空数组。
B. relevance（扣题度 0-100）：以采分点命中率为主要依据——命中率＜40% 不得高于 65 分；40%-60% 不得高于 78 分；≥80% 才可给 85 分以上。若答非所问、通篇未回应设问，直接 ≤50 分。
C. structure（逻辑结构 0-100）：看是否有清晰的分层连接（第一/第二/首先/其次/一是/二是等）、层次之间是否并列或递进、有无结尾收束。仅堆砌连接词但层次重复的，不得高于 70 分。
D. expression（表达 0-100）：以给出的表达指标为锚，结合文本判断。语速 160-240 字/分钟为正常区间；口头禅每 100 字超过 1.5 次需扣分；有效字数明显不足（＜时长×2 字/秒）视为内容单薄。comment 必须引用具体数字。
E. overallScore = round(0.45×relevance + 0.30×structure + 0.25×expression)，再按“每漏 1 条 critical 扣 3 分、最多扣 9 分”修正，取 0-100 整数。
F. grade：≥85 优秀，75-84 良好，62-74 中等，＜62 需精进。
G. highlights：2-3 条，必须指向具体命中的采分点或具体表达事实，不得写“整体不错”。
H. improvements：2-3 条，每条必须包含 dimension（只能是“扣题度/逻辑结构/表达”）、issue（缺什么）、action（下一遍怎么做）、example（可直接照说的示范句，15-45 字）。优先针对未命中的 critical 采分点。
I. modelOutline：3-5 条答题提纲，每条 12-30 字，用“动作+对象+落点”的句式，不要空话。

【输出 JSON 结构（严格照此，字段名不得改）】
{
  "pointHits": [{"index": 1, "hit": true, "evidence": "考生原话片段"}],
  "criticalMissed": [],
  "relevance": {"score": 82, "comment": "命中 4/5 条采分点，其中“先安置后解释”未落地，扣题度受限。", "missing": ["未回应群众情绪安抚"]},
  "structure": {"score": 78, "comment": "用了“首先/其次/最后”，但第二、三层都在讲排查，层次重复。", "missing": []},
  "expression": {"score": 75, "comment": "语速 268 字/分钟偏快，口头禅 6 次（然后），听感紧张。", "missing": []},
  "overallScore": 79,
  "grade": "良好",
  "highlights": ["明确提出“当天完成临时安置”，命中了处置时序采分点。"],
  "improvements": [{"dimension": "逻辑结构", "issue": "第二、三层重复讲排查", "action": "把第二层改为“原因核查”，第三层只讲“整改与回访”", "example": "第二，核查原因：调取台账，三天内查清漏报环节，形成书面说明。"}],
  "modelOutline": ["先控制现场风险，再回应群众诉求", "分类核查原因，明确责任主体", "限期整改并公开回访结果"],
  "encouragement": "这一遍已经敢开口了，下一步只改一个点：把每条采分点先用一句话点明，再展开。"
}`;
}

export const INTERVIEW_REVIEW_SYSTEM_PROMPT = SYSTEM_PROMPT;

/** 模型偶尔会包 ```json 或加前后语，这里取第一个平衡的大括号块 */
export function parseJsonLoose(raw: string): Record<string, any> {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('模型返回为空');
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) text = fence[1].trim();

  const start = text.indexOf('{');
  if (start === -1) throw new Error('模型返回中找不到 JSON 对象');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const sliced = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(sliced);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('模型返回的 JSON 不是对象');
          }
          return parsed;
        } catch (err: any) {
          throw new Error(`模型 JSON 解析失败：${err?.message || '未知错误'}`);
        }
      }
    }
  }
  throw new Error('模型返回的 JSON 不完整');
}

function clampScore(value: unknown, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function normalizeDimension(
  value: unknown,
  fallbackScore: number,
  fallbackComment: string
): InterviewDimensionScore {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, any>;
  return {
    score: clampScore(raw.score, fallbackScore),
    comment: clipText(raw.comment, 160) || fallbackComment,
    missing: asStringArray(raw.missing, 4, 40),
  };
}

/**
 * 把模型输出收敛成严格符合 InterviewReview 的对象：
 * 采分点条数、序号、criticalMissed、总分、等级全部由服务端重算，
 * 模型只提供“判定与文案”，不能改结构、不能漏条、不能自造分数区间。
 */
export function normalizeInterviewReview(
  raw: Record<string, any>,
  input: InterviewReviewRequest,
  metrics: ExpressionMetrics
): InterviewReview {
  const { question } = input;
  const total = question.keyPoints.length;
  const rawHits = Array.isArray(raw?.pointHits) ? raw.pointHits : [];
  /** 模型只要给了数字 index 就严格按 index 对齐；完全没给 index 才退回数组顺序 */
  const hasExplicitIndexes = rawHits.some((item: any) => Number.isFinite(Number(item && item.index)));

  const pointHits: InterviewKeyPointHit[] = question.keyPoints.map((_point, index) => {
    const candidate = hasExplicitIndexes
      ? rawHits.find((item: any) => Number(item && item.index) === index + 1)
      : rawHits[index];
    const hit = !!(candidate && candidate.hit === true);
    const evidence = hit ? clipText(candidate && candidate.evidence, 40) : '';
    return { index: index + 1, hit, evidence: evidence || undefined };
  });

  const pointsHitCount = pointHits.filter((item) => item.hit).length;
  const criticalMissed = question.keyPoints
    .map((point, index) => (point.critical === true && !pointHits[index].hit ? index + 1 : 0))
    .filter((index) => index > 0);

  const relevanceScore = clampScore(raw?.relevance?.score, 60);
  const structureScore = clampScore(raw?.structure?.score, 60);
  const expressionScore = clampScore(raw?.expression?.score, 60);
  const weighted = Math.round(relevanceScore * 0.45 + structureScore * 0.3 + expressionScore * 0.25);
  const baseOverall = Number.isFinite(Number(raw?.overallScore))
    ? clampScore(raw?.overallScore, weighted)
    : weighted;
  const overallScore = Math.max(0, Math.min(100, baseOverall - Math.min(9, criticalMissed.length * 3)));

  const improvements: InterviewImprovement[] = (Array.isArray(raw?.improvements) ? raw.improvements : [])
    .map((item: any) => ({
      dimension: ['扣题度', '逻辑结构', '表达'].includes(item && item.dimension)
        ? item.dimension
        : '扣题度',
      issue: clipText(item && item.issue, 90),
      action: clipText(item && item.action, 90),
      example: clipText(item && item.example, 90),
    }))
    .filter((item: InterviewImprovement) => item.issue || item.action)
    .slice(0, 3);

  const fallbackImprovement = buildFallbackImprovement(input, pointHits);
  if (improvements.length === 0 && fallbackImprovement) improvements.push(fallbackImprovement);

  const highlights = asStringArray(raw?.highlights, 3, 90);
  if (highlights.length === 0) {
    highlights.push(
      pointsHitCount > 0
        ? `已命中 ${pointsHitCount}/${total} 条采分点，答题框架基本成立，先把命中的几条说顺。`
        : `完整说完了 ${metrics.charCount} 字，先把“开口不停顿”这一步稳住，下一遍再补采分点。`
    );
  }

  const modelOutline = asStringArray(raw?.modelOutline, 5, 60);

  return {
    provider: 'deepseek',
    degraded: false,
    pointHits,
    pointsHitCount,
    pointsTotal: total,
    criticalMissed,
    relevance: normalizeDimension(
      raw?.relevance,
      relevanceScore,
      `命中 ${pointsHitCount}/${total} 条采分点，结合设问看扣题程度。`
    ),
    structure: normalizeDimension(raw?.structure, structureScore, '按“分层连接+层次不重复+结尾收束”核对结构。'),
    expression: normalizeDimension(
      raw?.expression,
      expressionScore,
      `语速 ${metrics.speechRateWpm} 字/分钟，口头禅 ${metrics.fillerCount} 次。`
    ),
    overallScore,
    grade: gradeOf(overallScore),
    highlights,
    improvements,
    modelOutline: modelOutline.length >= 2 ? modelOutline : question.referenceOutline.slice(0, 5),
    encouragement:
      clipText(raw?.encouragement, 120) ||
      '按部就班就是伟大。这一遍已经把话说出口，下一遍只盯一条主线采分点补全，就是进步。',
    metrics,
    createdAt: new Date().toISOString(),
  };
}

/** 模型没给改进项时的兜底：直接指向未命中的 critical 采分点 */
function buildFallbackImprovement(
  input: InterviewReviewRequest,
  pointHits: InterviewKeyPointHit[]
): InterviewImprovement | null {
  const { question } = input;
  const missedIndex = question.keyPoints.findIndex(
    (point, index) => point.critical === true && !pointHits[index].hit
  );
  if (missedIndex === -1) return null;
  const point = question.keyPoints[missedIndex];
  return {
    dimension: '扣题度',
    issue: `主线采分点 ${missedIndex + 1} 未落地：${point.text}`,
    action: '下一遍在开头 20 秒内先用一句话点明这条主线，再展开原因与做法。',
    example: `这件事我先抓住一点：${Array.from(point.text).slice(0, 24).join('')}。`,
  };
}

/** 前端响应校验：字段不齐一律视为无效，交给本地规则评分兜底 */
export function isInterviewReview(value: unknown): value is InterviewReview {
  if (!value || typeof value !== 'object') return false;
  const review = value as Record<string, any>;
  const dims = [review.relevance, review.structure, review.expression];
  return (
    (review.provider === 'deepseek' || review.provider === 'local') &&
    Array.isArray(review.pointHits) &&
    typeof review.pointsHitCount === 'number' &&
    typeof review.pointsTotal === 'number' &&
    Array.isArray(review.criticalMissed) &&
    typeof review.overallScore === 'number' &&
    typeof review.grade === 'string' &&
    dims.every((dim) => !!dim && typeof dim === 'object' && typeof dim.score === 'number')
  );
}

/** 服务端调用 DeepSeek；失败抛错，由路由转成本地规则评分（degraded=true） */
export async function requestDeepSeekReview(
  apiKey: string,
  input: InterviewReviewRequest,
  metrics: ExpressionMetrics
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INTERVIEW_REVIEW_TIMEOUT_MS);
  try {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildInterviewReviewPrompt(input, metrics) },
        ],
        temperature: 0.3,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`DeepSeek HTTP ${res.status}${detail ? `：${clipText(detail, 160)}` : ''}`);
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new Error('DeepSeek 返回内容为空');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** 路由共用：AI 不可用时组装本地规则版报告（前端会看到“本地规则”标签） */
export function buildDegradedReview(
  input: InterviewReviewRequest,
  metrics: ExpressionMetrics,
  reason: string
): InterviewReview {
  return buildLocalInterviewReview({
    question: input.question,
    answerText: input.answerText,
    metrics,
    reason,
  });
}


