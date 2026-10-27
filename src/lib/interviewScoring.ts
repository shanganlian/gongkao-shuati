/**
 * 面试大厅 v1.0 · 本地规则评分（兜底）
 *
 * 定位：没有 DEEPSEEK_API_KEY、请求超时、模型 JSON 解析失败时使用。
 * 原则：只做“能解释的机械判定”，不伪装 AI。所有结论都标注 provider='local'、degraded=true，
 *      采分点命中基于中文二元组重合度 + 主线锚点，报告里会写明“本地关键词比对”。
 */
import type {
  ExpressionMetrics,
  InterviewDimensionScore,
  InterviewImprovement,
  InterviewKeyPoint,
  InterviewKeyPointHit,
  InterviewReview,
} from '../types';

/** 评分只需要这些字段，InterviewQuestion / 服务端 payload 都可直接传入 */
export interface ScoringQuestion {
  category: string;
  title: string;
  task: string;
  answerSeconds: number;
  keyPoints: InterviewKeyPoint[];
  pitfalls: string[];
  referenceOutline: string[];
}

export interface LocalReviewInput {
  question: ScoringQuestion;
  answerText: string;
  metrics: ExpressionMetrics;
  reason?: string;
}

/** 只统计真正常见的口头填充词，避免把“这个项目”误判成废话 */
export const FILLER_WORDS = [
  '呃',
  '嗯',
  '啊这',
  '那个',
  '然后呢',
  '就是说',
  '怎么说呢',
  '其实吧',
  '反正',
  '对吧',
  '之类的',
  '差不多',
];

/** 采分点常用“小标题：具体做法”写法，冒号前是主线锚点 */
const HEAD_SPLIT_RE = /[：:]/;
const HEAD_TOKEN_SPLIT_RE = /[、，,与和及/＋+]/;

function cjkChunks(text: string): string[] {
  return text.split(/[^\u4e00-\u9fa5a-zA-Z0-9]+/).filter((chunk) => chunk.length > 0);
}

function bigramSet(text: string): Set<string> {
  const set = new Set<string>();
  cjkChunks(text).forEach((chunk) => {
    const chars = Array.from(chunk);
    for (let i = 0; i < chars.length - 1; i += 1) {
      set.add(chars[i] + chars[i + 1]);
    }
  });
  return set;
}

/** 采分点表述被作答覆盖的比例（0-1），按二元组计 */
export function bigramOverlap(answerText: string, keyPointText: string): number {
  const pointGrams = bigramSet(keyPointText);
  if (pointGrams.size === 0) return 0;
  const answerGrams = bigramSet(answerText);
  let matched = 0;
  pointGrams.forEach((gram) => {
    if (answerGrams.has(gram)) matched += 1;
  });
  return matched / pointGrams.size;
}

/** 从作答里挑与采分点最贴近的一句，作为“引用原话”证据 */
function bestMatchingSentence(answerText: string, keyPointText: string): string {
  const pointGrams = bigramSet(keyPointText);
  const sentences = answerText
    .split(/[。！？!?；;\n]+/)
    .map((sentence) => sentence.replace(/\s+/g, '').trim())
    .filter((sentence) => sentence.length >= 4);
  let best = '';
  let bestScore = 0;
  sentences.forEach((sentence) => {
    const grams = bigramSet(sentence);
    let score = 0;
    pointGrams.forEach((gram) => {
      if (grams.has(gram)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  });
  if (!best) return '';
  const chars = Array.from(best);
  return chars.length > 36 ? `${chars.slice(0, 36).join('')}…` : best;
}

export interface KeyPointJudgement {
  hit: boolean;
  overlap: number;
  anchors: string[];
  evidence?: string;
}

/** 单条采分点判定：二元组重合 ≥20%，或命中“标题锚点”且重合 ≥10% */
export function judgeKeyPointLocal(keyPointText: string, answerText: string): KeyPointJudgement {
  const overlap = bigramOverlap(answerText, keyPointText);
  const head = keyPointText.split(HEAD_SPLIT_RE)[0] || '';
  const anchors = head
    .split(HEAD_TOKEN_SPLIT_RE)
    .map((token) => token.trim())
    .filter((token) => Array.from(token).length >= 2 && answerText.includes(token));

  const hit = overlap >= 0.2 || (anchors.length > 0 && overlap >= 0.1);
  if (!hit) return { hit: false, overlap, anchors };
  const quote = bestMatchingSentence(answerText, keyPointText);
  const anchorNote = anchors.length > 0 ? `命中“${anchors.join('、')}”` : '';
  const evidence = [anchorNote, quote].filter(Boolean).join('；') || undefined;
  return { hit: true, overlap, anchors, evidence };
}

function countOccurrences(text: string, word: string): number {
  if (!word) return 0;
  return text.split(word).length - 1;
}

/** 前端在录音结束时调用；服务端也用同一函数重算，保证两端口径一致 */
export function computeExpressionMetrics(answerText: string, durationSeconds: number): ExpressionMetrics {
  const text = typeof answerText === 'string' ? answerText : '';
  const charCount = Array.from(text.replace(/\s+/g, '')).length;
  const duration = Number.isFinite(durationSeconds) ? Math.max(0, Math.round(durationSeconds)) : 0;
  const speechRateWpm = duration > 0 ? Math.round((charCount / duration) * 60) : 0;

  let fillerCount = 0;
  const fillerWords: string[] = [];
  FILLER_WORDS.forEach((word) => {
    const times = countOccurrences(text, word);
    if (times > 0) {
      fillerCount += times;
      fillerWords.push(word);
    }
  });

  return { charCount, durationSeconds: duration, speechRateWpm, fillerCount, fillerWords };
}

const PRIMARY_LAYER_TOKENS = [
  '第一',
  '第二',
  '第三',
  '第四',
  '首先',
  '其次',
  '再次',
  '最后',
  '一是',
  '二是',
  '三是',
  '一方面',
  '另一方面',
];
const SECONDARY_LAYER_TOKENS = ['同时', '此外', '接着', '然后', '接下来', '与此同时'];

/** 本地结构分：只认“显性连接词 + 结尾收束 + 开场表态”，不猜语义层次 */
export function scoreStructureLocal(answerText: string, metrics: ExpressionMetrics): InterviewDimensionScore {
  const primary = PRIMARY_LAYER_TOKENS.filter((token) => answerText.includes(token));
  const secondary = SECONDARY_LAYER_TOKENS.filter((token) => answerText.includes(token));

  const tail = answerText.slice(Math.floor(answerText.length * 0.7));
  const hasClosing = /(总之|综上|因此|所以|最后想说的是|下一步|后续)/.test(tail);
  const hasOpening = /(我认为|我的看法是|在我看来|面对|对于这件事|我的态度)/.test(
    answerText.slice(0, 60)
  );

  let score = 55;
  if (primary.length >= 2) score += 8;
  if (primary.length >= 3) score += 8;
  if (secondary.length >= 1) score += 4;
  if (hasClosing) score += 6;
  if (hasOpening) score += 3;
  if (metrics.charCount >= 250) score += 4;
  if (primary.length === 0 && secondary.length === 0) score -= 6;
  score = Math.min(92, Math.max(45, Math.round(score)));

  const detected = [...primary, ...secondary];
  const comment = detected.length
    ? `显性分层连接 ${detected.length} 处（${detected.slice(0, 5).join('、')}）；${hasClosing ? '结尾有收束' : '结尾缺少收束'}。本地规则只识别连接词，层次是否重复需人工复听。`
    : '未检测到“第一/首先/一是”等显性分层连接，整段更像连续叙述；本地规则无法判断语义层次。';

  return {
    score,
    comment,
    missing: hasClosing ? [] : ['结尾没有一句话收束'],
  };
}

/** 本地表达分：直接用可测量指标算，评语里必须出现具体数字 */
export function scoreExpressionLocal(
  metrics: ExpressionMetrics,
  question: ScoringQuestion
): InterviewDimensionScore {
  const { charCount, durationSeconds, speechRateWpm, fillerCount } = metrics;
  const per100 = charCount > 0 ? (fillerCount / charCount) * 100 : 0;
  const expectedChars =
    Math.min(Math.max(durationSeconds, question.answerSeconds * 0.5), question.answerSeconds) * 2.6;

  let score = 84;
  if (durationSeconds <= 0) {
    score = 62;
  } else if (speechRateWpm >= 160 && speechRateWpm <= 240) {
    score += 4;
  } else if (speechRateWpm >= 120 && speechRateWpm <= 300) {
    score -= 4;
  } else {
    score -= 14;
  }

  if (per100 > 1.5) score -= 8;
  else if (per100 > 0.8) score -= 4;

  if (durationSeconds >= 30 && charCount < expectedChars * 0.55) score -= 8;
  if (charCount < 80) score -= 10;
  score = Math.min(94, Math.max(45, Math.round(score)));

  const rateNote =
    durationSeconds <= 0
      ? '本次未记录到有效作答时长，语速无法计算'
      : `语速 ${speechRateWpm} 字/分钟（正常区间 160-240）`;
  const fillerNote = `口头禅 ${fillerCount} 次，平均每百字 ${per100.toFixed(1)} 次`;
  const lengthNote = `有效字数 ${charCount} 字 / 作答 ${durationSeconds} 秒`;

  return {
    score,
    comment: `${rateNote}；${fillerNote}；${lengthNote}。`,
    missing: per100 > 1.5 ? ['口头禅密度偏高，建议每句停顿时闭口换气'] : [],
  };
}

/** 本地扣题度：以采分点命中率为主，叠加“字数是否撑得起内容” */
export function scoreRelevanceLocal(
  question: ScoringQuestion,
  judgments: KeyPointJudgement[],
  metrics: ExpressionMetrics
): InterviewDimensionScore {
  const total = judgments.length;
  const hitIndexes = judgments
    .map((judgement, index) => (judgement.hit ? index + 1 : 0))
    .filter((index) => index > 0);
  const ratio = total > 0 ? hitIndexes.length / total : 0;

  let score = 42 + ratio * 53;
  if (ratio < 0.4) score = Math.min(score, 65);
  else if (ratio < 0.6) score = Math.min(score, 78);
  else if (ratio < 0.8) score = Math.min(score, 84);
  if (metrics.charCount < 120) score -= 5;
  score = Math.min(95, Math.max(30, Math.round(score)));

  const missedCritical = question.keyPoints
    .map((point, index) => (point.critical === true && !judgments[index].hit ? index + 1 : 0))
    .filter((index) => index > 0);

  const comment = `本地关键词比对命中 ${hitIndexes.length}/${total} 条采分点${
    hitIndexes.length ? `（第 ${hitIndexes.join('、')} 条）` : ''
  }${missedCritical.length ? `；主线漏答：第 ${missedCritical.join('、')} 条` : ''}。此结论为规则估算，不等同于考官判断。`;

  return {
    score,
    comment,
    missing: question.keyPoints
      .filter((point, index) => point.critical === true && !judgments[index].hit)
      .map((point) => Array.from(point.text).slice(0, 24).join('')),
  };
}

/** 与 prompt 中的等级口径保持一致 */
export function gradeOf(score: number): InterviewReview['grade'] {
  if (score >= 85) return '优秀';
  if (score >= 75) return '良好';
  if (score >= 62) return '中等';
  return '需精进';
}

export function applyCriticalPenalty(score: number, criticalMissedCount: number): number {
  return Math.max(0, Math.min(100, score - Math.min(9, criticalMissedCount * 3)));
}

function sliceText(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

function buildLocalHighlights(
  question: ScoringQuestion,
  pointHits: InterviewKeyPointHit[],
  metrics: ExpressionMetrics
): string[] {
  const hitPoints = question.keyPoints
    .map((point, index) => ({ point, index }))
    .filter((item) => pointHits[item.index].hit)
    .slice(0, 2)
    .map((item) => `命中采分点 ${item.index + 1}：${sliceText(item.point.text, 28)}`);

  if (hitPoints.length > 0) {
    if (metrics.durationSeconds >= 90) {
      hitPoints.push(`作答撑到了 ${metrics.durationSeconds} 秒，没有中途放弃，考场节奏感在成形。`);
    }
    return hitPoints.slice(0, 3);
  }

  return [
    `完整说出 ${metrics.charCount} 字：先把“敢开口、不停顿”这一步稳住，下一遍只补一条主线采分点。`,
  ];
}

function buildLocalImprovements(
  question: ScoringQuestion,
  pointHits: InterviewKeyPointHit[],
  structure: InterviewDimensionScore,
  expression: InterviewDimensionScore,
  metrics: ExpressionMetrics
): InterviewImprovement[] {
  const improvements: InterviewImprovement[] = [];

  question.keyPoints.forEach((point, index) => {
    if (improvements.length >= 2) return;
    if (point.critical === true && !pointHits[index].hit) {
      improvements.push({
        dimension: '扣题度',
        issue: `主线采分点 ${index + 1} 没有出现：${sliceText(point.text, 30)}`,
        action: '下一遍开头 20 秒先单独给这条：先说结论，再给一个具体动作。',
        example: `这一点我的做法是：${sliceText(point.text, 22)}，当天就落实到人。`,
      });
    }
  });

  const hitCount = pointHits.filter((item) => item.hit).length;
  if (improvements.length < 2 && hitCount < question.keyPoints.length) {
    const missed = question.keyPoints.find((_point, index) => !pointHits[index].hit);
    if (missed) {
      improvements.push({
        dimension: '扣题度',
        issue: `还有采分点只字未提：${sliceText(missed.text, 28)}`,
        action: '把漏掉的采分点补成一句“对象+动作+结果”，放在对应层次里。',
        example: `同时，我会${sliceText(missed.text, 20)}，并把结果反馈给群众。`,
      });
    }
  }

  if (structure.score < 75) {
    improvements.push({
      dimension: '逻辑结构',
      issue: '整段缺少显性分层，听感像连续叙述，考官抓不到你的框架。',
      action: '把答案压成三层：先控风险、再查原因、最后说整改与回访。',
      example: '第一，先控制现场；第二，再核查原因；第三，最后回访反馈。',
    });
  }

  if (expression.score < 75) {
    const reason =
      metrics.fillerCount > 0
        ? `口头禅 ${metrics.fillerCount} 次，平均每百字 ${((metrics.fillerCount / Math.max(1, metrics.charCount)) * 100).toFixed(1)} 次`
        : `语速 ${metrics.speechRateWpm || 0} 字/分钟，偏离 160-240 的正常区间`;
    improvements.push({
      dimension: '表达',
      issue: `${reason}，听感偏紧或偏拖。`,
      action: '每层开头先说一句“接下来我说第二点”，用固定换层句替代“然后、就是”。',
      example: '接下来我说第二点：原因核查。',
    });
  }

  if (improvements.length === 0) {
    improvements.push({
      dimension: '扣题度',
      issue: '采分点已基本覆盖，但表达还可以更省字。',
      action: '把每条采分点先用一句话点明，再补一个具体动作，删掉重复铺垫。',
      example: '第一，先安置群众；第二，再核查原因；第三，最后公开回访。',
    });
  }

  return improvements.slice(0, 3);
}

/**
 * 本地规则版报告。调用方必须把 provider='local' / degraded=true 原样展示给用户，
 * 不允许 UI 把它包装成“AI 点评”。
 */
export function buildLocalInterviewReview(input: LocalReviewInput): InterviewReview {
  const { question, answerText, metrics } = input;
  const judgments = question.keyPoints.map((point) => judgeKeyPointLocal(point.text, answerText));
  const pointHits: InterviewKeyPointHit[] = judgments.map((judgement, index) => ({
    index: index + 1,
    hit: judgement.hit,
    evidence: judgement.evidence,
  }));

  const pointsHitCount = pointHits.filter((item) => item.hit).length;
  const criticalMissed = question.keyPoints
    .map((point, index) => (point.critical === true && !pointHits[index].hit ? index + 1 : 0))
    .filter((index) => index > 0);

  const relevance = scoreRelevanceLocal(question, judgments, metrics);
  const structure = scoreStructureLocal(answerText, metrics);
  const expression = scoreExpressionLocal(metrics, question);
  const weighted = Math.round(relevance.score * 0.45 + structure.score * 0.3 + expression.score * 0.25);
  const overallScore = applyCriticalPenalty(weighted, criticalMissed.length);

  return {
    provider: 'local',
    degraded: true,
    reason:
      input.reason ||
      '未配置 DEEPSEEK_API_KEY 或 AI 请求失败，已使用本地规则评分（仅关键词与表达指标对照）',
    pointHits,
    pointsHitCount,
    pointsTotal: question.keyPoints.length,
    criticalMissed,
    relevance,
    structure,
    expression,
    overallScore,
    grade: gradeOf(overallScore),
    highlights: buildLocalHighlights(question, pointHits, metrics),
    improvements: buildLocalImprovements(question, pointHits, structure, expression, metrics),
    modelOutline: question.referenceOutline.slice(0, 5),
    encouragement:
      '按部就班就是伟大。这一遍已经开口了，下一遍只做一件事：把漏掉的主线采分点补上，再完整说一遍。',
    metrics,
    createdAt: new Date().toISOString(),
  };
}





