export type ExamCategory = 'national' | 'provincial' | 'public_institution';

export type ExamModule = 
  | 'changshi'    // 常识判断
  | 'yanyu'       // 言语理解与表达
  | 'shuliang'    // 数量关系
  | 'panduan'     // 判断推理
  | 'ziliao'      // 资料分析
  | 'shenlun'     // 申论与思辨
  | 'gongji';     // 事业单位公基/综应

export interface Question {
  id: string;
  category: ExamCategory;
  module: ExamModule;
  title: string;
  stem: string; // 题干
  material?: string; // 资料/背景材料
  options?: { key: string; text: string }[];
  answer: string;
  explanation: string;
  keyPoints: string[];
  thinkingTip: string; // 思维切入点
  difficulty: '基础' | '中等' | '拔高';
  source: string; // 如：2025国考行政执法卷
  province?: string; // 省份，如"浙江"、"联考"，国考留空
  /** 图片题：选项为图片，文本化时丢失，前端显示占位提示 */
  isImageQuestion?: boolean;
  /** 异常题标记（多题合并等脏数据），前端显示「本题数据整理中」占位 */
  isAbnormal?: boolean;
}

export interface Paper {
  id: string;
  title: string;
  category: ExamCategory;
  year: number;
  durationMinutes: number;
  totalScore: number;
  questionCount: number;
  questions: Question[];
  difficulty: string;
}

export interface DailyMindsetQuestion {
  id: string;
  date: string;
  theme: string;
  goldenQuote: string; // 按部就班就是伟大
  thinkingQuestion: {
    title: string;
    background: string;
    prompt: string;
    thinkingDimensions: {
      step: string;
      standpoint: string;
      framework: string;
    }[];
    policyAnchor: string;
    goldSentences: string[];
    sampleOutline: string;
    audioExplanationText: string;
  };
  aptitudeQuestion: Question;
}

export interface KnowledgePoint {
  id: string;
  module: ExamModule;
  category: ExamCategory;
  title: string;
  tag: string;
  importance: number; // 1-5
  summary: string;
  memoryFormula: string; // 秒杀口诀/核心公式
  mindsetBridge: string; // 为什么初试考这个能提升面试/申论思维
  audioSummaryText: string;
  durationMinutes: number;
  coreConcepts: string[];
}

// 知识点卡片
export interface KnowledgeCard {
  id: string;
  title: string;
  content: string;        // 讲解内容
  mnemonic: string;       // 速记口诀
  pitfalls: string[];     // 常见陷阱
  exampleQuestionIds: string[]; // 配套例题 id
}

// 子考点
export interface KnowledgeSubPoint {
  id: string;
  title: string;
  cards: KnowledgeCard[];
}

// 章节
export interface KnowledgeChapter {
  id: string;
  title: string;
  module: ExamModule;
  icon: string;
  subPoints: KnowledgeSubPoint[];
}

// 掌握状态
export type KnowledgeStatus = 'unlearned' | 'reviewing' | 'mastered';

export interface CandidateCard {
  id: string;
  name: string;
  title: string;
  archetype: '政策站位先锋' | '基层实干破局者' | '严谨逻辑思辨者' | '人文为民共情者';
  streakDays: number;
  completedQuestions: number;
  motto: string;
  signatureStyle: string;
  avatarUrl: string;
  badge: string;
}

export interface ExaminerCard {
  id: string;
  name: string;
  role: string;
  focus: string;
  styleDescription: string;
  avatarUrl: string;
}

export interface InterviewRoom {
  id: string;
  title: string;
  category: '结构化面试' | '应急处突演练' | '基层治理综合分析' | '人际沟通与协调' | '无领导小组讨论';
  examType: '国考海关/税务' | '省考乡镇/综合' | '事业编管理岗';
  difficulty: '标准' | '高难度挑战';
  waitingUsers: number;
  maxUsers: number;
  status: 'open' | 'matching' | 'in_session';
  promptQuestion: {
    title: string;
    scene: string;
    task: string;
    timeLimitSeconds: number;
    thinkingTimeSeconds: number;
    scoringDimensions: string[];
    highScoreKeyPoints: string[];
  };
}

export interface AIReviewResult {
  policyAlignmentScore: number;    // 体察民情与政治站位 (0-100)
  logicStructureScore: number;     // 复杂问题解构与逻辑 (0-100)
  expressionFluencyScore: number;  // 表达流畅与实务肌肉记忆 (0-100)
  practicalActionScore: number;    // 举措可行度与担当 (0-100)
  overallGrade: '优秀' | '良好' | '中等' | '需精进';
  summaryComment: string;
  highlights: string[];
  improvementSuggestions: string[];
  antiTemplateWarning?: string;    // 反套话与反模板警示
  modelAnswerFramework: string;
  antiAnxietyEncouragement: string;
}

export interface PeerReviewFeedback {
  evaluatorName: string;
  evaluatorArchetype: string;
  standpointScoreLabel: '体察民情深刻' | '高屋建瓴' | '站位端正' | '需提升站位' | string;
  practicalFeasibility: '切实管用落地' | '切实可行' | '举措接地气' | '略有空泛' | string;
  encouragementNote: string;
  highlightPraise: string;
}

export type InterviewFormat = 'structured' | 'leaderless_group'; // 结构化面试 | 无领导小组讨论
export type InterviewMode = 'solo_ai' | 'peer_pk'; // 自行与AI练习 | 组队PK

export interface LeaderlessDiscussionRole {
  roleId: 'breaker' | 'architect' | 'timekeeper' | 'summarizer';
  title: string;
  description: string;
  keyResponsibility: string;
  speakingTactic: string;
}

export interface GrowthSystemState {
  level: number;
  levelTitle: string; // 见习笔录人 -> 基层调研员 -> 实干主事 -> 破局骨干 -> 案头策论家 -> 治平先锋
  currentExp: number;
  nextLevelExp: number;
  streakDays: number; // 连续按部就班天数
  mindsetCombo: number; // 思维晨练连击数
  totalQuestionsAnswered: number;
  totalInterviewMins: number;
  unlockedBadges: GrowthBadge[];
}

export interface GrowthBadge {
  id: string;
  name: string;
  category: 'mindset' | 'practice' | 'interview' | 'consistency';
  description: string;
  earnedDate?: string;
  isUnlocked: boolean;
  tier: 'bronze' | 'silver' | 'gold' | 'jade'; // 严肃典雅金属玉质
}

export interface DailyStudyPlan {
  planTitle: string;
  philosophy: string;
  dailyTimeBudget: string;
  scheduleBlocks: {
    timeSlot: string;
    taskName: string;
    moduleType: string;
    goal: string;
    estimatedMinutes: number;
    isCompleted?: boolean;
  }[];
  weeklyMilestones: string[];
  mindsetQuote: string;
}

export interface CommunityPost {
  id: string;
  author: string;
  avatar: string;
  archetype: string;
  timeAgo: string;
  streakDays: number;
  todayQuestionsDone: number;
  content: string;
  tags: string[];
  cheerCount: number; // 互勉次数
  hasCheered?: boolean;
}

/* ==========================================================================
 * 面试大厅 v1.0：结构化面试单人闭环
 * 注意：以下类型为新增，不改动上方既有 AIReviewResult / InterviewRoom，
 *      旧 InterviewArena（v0 演示壳）保持可回滚。
 * ========================================================================== */

export type InterviewQuestionCategory =
  | '综合分析'
  | '组织管理'
  | '应急应变'
  | '人际沟通'
  | '自我认知'
  | '言语表达';

export type InterviewQuestionDifficulty = '基础' | '中等' | '拔高';

/** 采分点：critical=true 表示答题主线，漏掉必须在点评报告中点名 */
export interface InterviewKeyPoint {
  text: string;
  critical?: boolean;
}

export interface InterviewQuestion {
  id: string;
  category: InterviewQuestionCategory;
  subType: string;
  difficulty: InterviewQuestionDifficulty;
  /** 考场/角色设定，约 1/3 题目提供 */
  scene?: string;
  /** 题干：背景与矛盾 */
  title: string;
  /** 设问 */
  task: string;
  thinkingSeconds: number;
  answerSeconds: number;
  keyPoints: InterviewKeyPoint[];
  /** 常见扣分点（报告里作为“别人在这儿丢分”提示，不作为命中判定） */
  pitfalls: string[];
  /** 参考提纲（逐条渲染） */
  referenceOutline: string[];
  tags: string[];
  source: string;
}

export interface InterviewQuestionBank {
  version: number;
  updatedAt: string;
  categories: InterviewQuestionCategory[];
  questions: InterviewQuestion[];
}

/** 前端可客观测量的表达指标（服务端无法听音频，靠这份数据锚定“表达”维度） */
export interface ExpressionMetrics {
  charCount: number;
  durationSeconds: number;
  /** 字/分钟 */
  speechRateWpm: number;
  fillerCount: number;
  fillerWords: string[];
}

/** 采分点逐条命中的硬对照结果，index 为 1 基序号（对应 ①…⑥） */
export interface InterviewKeyPointHit {
  index: number;
  hit: boolean;
  evidence?: string;
}

export interface InterviewDimensionScore {
  score: number;
  comment: string;
  missing?: string[];
}

export interface InterviewImprovement {
  dimension: '扣题度' | '逻辑结构' | '表达' | string;
  issue: string;
  action: string;
  example: string;
}

export type InterviewReviewProvider = 'deepseek' | 'local';

export interface InterviewReview {
  provider: InterviewReviewProvider;
  /** true 表示走了本地规则兜底（无 key / 超时 / 解析失败） */
  degraded?: boolean;
  reason?: string;
  pointHits: InterviewKeyPointHit[];
  pointsHitCount: number;
  pointsTotal: number;
  /** 漏掉的 critical 采分点序号（1 基） */
  criticalMissed: number[];
  relevance: InterviewDimensionScore;
  structure: InterviewDimensionScore;
  expression: InterviewDimensionScore;
  overallScore: number;
  grade: '优秀' | '良好' | '中等' | '需精进';
  highlights: string[];
  improvements: InterviewImprovement[];
  modelOutline: string[];
  encouragement: string;
  metrics?: ExpressionMetrics;
  createdAt?: string;
}

export interface InterviewSessionRecord {
  id: string;
  questionId: string;
  questionTitle: string;
  category: InterviewQuestionCategory;
  difficulty: InterviewQuestionDifficulty;
  startedAt: string;
  durationSeconds: number;
  answerText: string;
  inputMode: 'voice' | 'typing';
  metrics: ExpressionMetrics;
  review: InterviewReview;
  provider: InterviewReviewProvider;
}

