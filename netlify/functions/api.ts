import express, { type NextFunction, type Request, type Response } from 'express';
import serverless from 'serverless-http';
import { GoogleGenAI } from '@google/genai';
import {
  ANSWER_MIN_CHARS,
  buildDegradedReview,
  metricsOf,
  normalizeInterviewReview,
  parseJsonLoose,
  requestDeepSeekReview,
  sanitizeReviewRequest,
} from '../../shared/interview-review';
import {
  authenticateRequest,
  buildLeaderboard,
  buildStatsOverview,
  type AuthContext,
} from '../../shared/api-auth';

const app = express();

app.use(express.json());

/** 受保护接口：必须携带 Supabase 登录态（Authorization: Bearer <access_token>） */
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'unauthorized', message: '请先登录后再使用该功能' });
    }
    (req as Request & { auth?: AuthContext }).auth = auth;
    return next();
  } catch (err: any) {
    console.error('auth middleware error:', err?.message || err);
    return res.status(401).json({ error: 'unauthorized' });
  }
}

// AI Daily Study Plan Generator Endpoint
app.post('/api/generate-plan', requireAuth, async (req, res) => {
  const { userProfile, availableHours, weakPoints, targetExam, additionalNotes } = req.body;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({
      planTitle: `${targetExam || '省考/国考'} · 每日长线思维养成计划`,
      philosophy: '公考是思维重塑的长跑。战线拉长，每天两道题培养成年人解决实际问题的思维方式，水滴石穿。',
      dailyTimeBudget: availableHours || '2.5小时（含碎片时间）',
      scheduleBlocks: [
        {
          timeSlot: '早晨晨间 (20分钟)',
          taskName: '每日思维两题 · 申论与行测晨练',
          moduleType: '申论立论 + 言语/逻辑',
          goal: '培养公职站位与解题敏感度，拒绝死记硬背',
          estimatedMinutes: 20
        },
        {
          timeSlot: '午间通勤/碎片 (25分钟)',
          taskName: '知识点通关秘籍 · 语音磨耳朵',
          moduleType: '资料分析速算口诀 / 行政法要点',
          goal: '利用碎片时间强化记忆，闭眼构建知识树',
          estimatedMinutes: 25
        },
        {
          timeSlot: '晚间专注 (50分钟)',
          taskName: '笔试专项题库实战刷题',
          moduleType: weakPoints || '薄弱模块攻坚',
          goal: '做透15-20道真题，关键在总结错题与思维切入点',
          estimatedMinutes: 50
        },
        {
          timeSlot: '睡前演练 (25分钟)',
          taskName: '面试平台开口对练 (AI或视频自录)',
          moduleType: '结构化/无领导综合分析',
          goal: '每天开口说2-3分钟，打破开口恐惧，积累官样表达',
          estimatedMinutes: 25
        }
      ],
      weeklyMilestones: [
        '第1周：建立答题节奏，行测错题彻底弄懂，申论大纲搭建成型',
        '第2周：突破资料分析计算心结，面试敢于直视镜头从容开口',
        '第3周：形成自我知识图谱，无领导讨论具备框架破冰能力'
      ],
      mindsetQuote: '按部就班就是伟大。不必看他人的高分，保持自己的节奏，日拱一卒，功不唐捐。'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `你是一位深耕中国公务员考试（国考、省考、事业编）15年的顶级资深备考规划导师与阅卷专家。
请根据以下考生的真实情况，制定一份科学、长期、注重公职思维培养且拒绝焦虑的专属每日备考计划：

【考生目标考试】：${targetExam || '国考/省考'}
【考生身份与可用时间】：${userProfile || '在职人员'}，每天可用约 ${availableHours || '2-3'} 小时
【主要薄弱点与顾虑】：${weakPoints || '申论写不出、面试不敢开口、数量慢'}
【补充情况描述】：${additionalNotes || '希望按部就班，战线拉长，培养思维方式'}

核心要求：
1. 强调“考试是成年人公职思维方式的长期培养，申论和面试必须从早抓起，每天练手避免面试不敢说、申论写不出”。
2. 拒绝贩卖焦虑，倡导“按部就班就是伟大，日拱一卒”。
3. 计划要精细切合其时间，包含早晨晨练两题、碎片化语音听学、笔试真题精做、面试开口演练。

请输出严格的 JSON 格式（不要包含任何 markdown 代码块外部字符），字段包含：
{
  "planTitle": "计划标题",
  "philosophy": "100字左右长线思维培养指导哲学",
  "dailyTimeBudget": "每日时间预算",
  "scheduleBlocks": [
    {
      "timeSlot": "时间段",
      "taskName": "任务名称",
      "moduleType": "对应模块",
      "goal": "执行目标与思维落脚点",
      "estimatedMinutes": 30
    }
  ],
  "weeklyMilestones": ["3个阶段性稳健里程碑"],
  "mindsetQuote": "温暖抗焦虑金句"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (err) {
    console.error('Plan generation error:', err);
    return res.json({
      planTitle: `${targetExam || '公职考试'} · 每日长线思维专属计划`,
      philosophy: '公考是一场思维方式的升华。将申论与面试思维融入每日两题，日积月累，从容上岸。',
      dailyTimeBudget: availableHours || '2-3小时',
      scheduleBlocks: [
        {
          timeSlot: '晨间启程 (20分钟)',
          taskName: '每日思维两题晨练',
          moduleType: '申论大纲 + 行测辨析',
          goal: '破题思维训练，学习官样表达',
          estimatedMinutes: 20
        },
        {
          timeSlot: '碎片听学 (30分钟)',
          taskName: '秘籍口诀语音磨耳朵',
          moduleType: '资料分析 / 行政法',
          goal: '通勤时间闭眼复盘公式，潜移默化',
          estimatedMinutes: 30
        },
        {
          timeSlot: '晚间静心 (50分钟)',
          taskName: '笔试专项真题精练',
          moduleType: weakPoints || '薄弱题型攻坚',
          goal: '做10-15题，重在弄懂命题逻辑与错题本收录',
          estimatedMinutes: 50
        },
        {
          timeSlot: '睡前突破 (20分钟)',
          taskName: '面试开口自录/AI对练',
          moduleType: '结构化/无领导讨论',
          goal: '对着摄像头录制一段答题视频并回放复盘，习惯镜头与目光',
          estimatedMinutes: 20
        }
      ],
      weeklyMilestones: [
        '第1周：养成每天开口说一段公职分析的习惯，消除镜头胆怯',
        '第2周：行测资料分析稳固速算模型，正确率稳在80%以上',
        '第3周：申论大作文五段三分法形成本能，破题不慌'
      ],
      mindsetQuote: '按部就班就是伟大。不看别人的分数，专注自己的每一步！'
    });
  }
});

// AI Review Endpoint for Interview Evaluation
app.post('/api/ai-review', requireAuth, async (req, res) => {
  const { questionTitle, userAnswer, candidateArchetype } = req.body;

  if (!userAnswer || userAnswer.trim().length === 0) {
    return res.status(400).json({ error: 'User answer is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Return structured default analysis
    return res.json({
      policyAlignmentScore: 88,
      logicStructureScore: 86,
      expressionFluencyScore: 85,
      practicalActionScore: 87,
      overallGrade: '良好',
      summaryComment: '作答立意明确，具备良好的公职人员同理心与政治自觉。逻辑层次分明，抓住了题干核心矛盾。摒弃了空洞套话，具备成熟的成年人执政思维。',
      highlights: [
        '【体察民情深刻】能够从群众实际利益与办事痛点出发，切中“以人民为中心”的本质；',
        '【复杂问题解决力】条理清晰，面对两难矛盾不回避，展现出机关日常办事拆解复杂局面的逻辑框架；',
        '【实操与担当意识】建议措施具有极强的基层可操作性，体现出年轻干部的责任感。'
      ],
      improvementSuggestions: [
        '彻底戒除一切假大空的套话铺垫，开门见山点破核心症结，更显成熟老练；',
        '可进一步结合国家关于整治形式主义为基层减负、提升政务效能的最新政策表述，提升“官样语言纯度”；',
        '建议在睡前或早晨多做镜头开口自录，把机关实务感内化为本能肌肉记忆。'
      ],
      antiTemplateWarning: '【考官反模板预警】：表现良好，未发现机械套用万能模板现象。考场最忌讳“帽子大、对策空”，唯有真诚体察民情、提出实招才能打动考官。',
      modelAnswerFramework: '【高分示范答题框架】：\n1. 表明态度与价值站位：正视问题、人民利益至上，强调数字化转型的温度；\n2. 标本兼顾、分类施策：线上抓体验迭代、线下抓保底兜底（双轨制）；\n3. 建立长效机制：优化考核评价指挥棒，将群众满意度作为最终尺度。',
      antiAnxietyEncouragement: '“面试考的从不是背套话技巧，而是你是否具备体察民情、解决复杂问题、从容担当的成年人执政思维。提前开口演练，把机关实务感变成肌肉记忆，考场便能从容不迫！”'
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `你是一位深耕中国国家公务员、省考及事业编面试15年的正厅级资深主考官兼面试命题组组长。
面试评分核心标准：公务员面试考察的从不是背套话技巧与僵化模板，而是考生是否具备“体察民情、解决复杂问题、从容担当”的成年人执政思维。提前开口演练，把机关实务感变成肌肉记忆，彻底消弭考场怯场心理。

请根据以下考生面试作答内容进行极其专业、严谨、深度的考官阅卷，并以严格的JSON格式返回分析报告。

【面试考题】：${questionTitle}
【考生人设风格】：${candidateArchetype || '基层实干破局者'}
【考生作答内容】：
"""
${userAnswer}
"""

重要阅卷原则：
1. 严肃权威：以真实体制内主考官的严谨视角审视，严查假大空、戴高帽、空喊口号套话。
2. 深度关注：考生是否真正体察民情？面对复杂矛盾能否拿出管用、务实、合规的机关实招？是否具有担当气度？
3. 反套话诊断：专门设立 antiTemplateWarning，指出哪些句子像死记硬背的套路模板，指导其说体制内行家里手的专业实干语言。
4. 温暖鼓励：践行“按部就班就是伟大，提前开口练就肌肉记忆”。

请输出严格的 JSON 格式（不要包含任何 markdown 代码块外部字符），字段包含：
{
  "policyAlignmentScore": number (70-98, 体察民情与政治站位),
  "logicStructureScore": number (70-98, 复杂矛盾解构条理),
  "expressionFluencyScore": number (70-98, 沉着表达与实务肌肉记忆),
  "practicalActionScore": number (70-98, 机关举措可行性与担当),
  "overallGrade": "优秀" | "良好" | "中等" | "需精进",
  "summaryComment": "120字左右权威主考官总评",
  "highlights": ["3个具体的答题亮点分析（体现体察民情、复杂问题解决、从容担当）"],
  "improvementSuggestions": ["3个具体的提分点及机关实操表达建议"],
  "antiTemplateWarning": "反套话与反模板化警示，指导如何说机关大白话办实事",
  "modelAnswerFramework": "高分答题框架三步法示范",
  "antiAnxietyEncouragement": "温暖鼓励语（强调早点开口、把机关实务感练成肌肉记忆、按部就班就是伟大）"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '';
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error) {
    console.error('Gemini API review error:', error);
    return res.json({
      policyAlignmentScore: 89,
      logicStructureScore: 88,
      expressionFluencyScore: 87,
      practicalActionScore: 88,
      overallGrade: '良好',
      summaryComment: '作答立意明确，具备较强的公职思维和实践关怀。答题思路清晰，能够针对痛点切中要害。',
      highlights: [
        '切中民生服务痛点，展现真挚公仆情怀；',
        '层次由浅入深，符合机关办事逻辑；',
        '语言平实质朴，具备说服力。'
      ],
      improvementSuggestions: [
        '可多引用“数字鸿沟”、“适老化服务”等专业政策词汇；',
        '措施可明确具体牵头部门与反馈机制；',
        '保持平稳心境，不期速成。'
      ],
      modelAnswerFramework: '1. 明确立场态度 -> 2. 深入辨析症结 -> 3. 闭环务实举措 -> 4. 长效机制升华',
      antiAnxietyEncouragement: '“按部就班就是伟大。日拱一卒，功不唐捐。”'
    });
  }
});

// 面试大厅 v1.0 · DeepSeek 三维评分 + 采分点逐条硬对照
// 无 Key / 超时 / JSON 异常：一律返回本地规则报告（provider=local, degraded=true），不伪装 AI
app.post('/api/interview-review', requireAuth, async (req, res) => {
  const parsed = sanitizeReviewRequest(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }

  const input = parsed.value;
  const metrics = metricsOf(input);

  if (metrics.charCount < ANSWER_MIN_CHARS) {
    return res.json({
      review: buildDegradedReview(
        input,
        metrics,
        `有效作答不足 ${ANSWER_MIN_CHARS} 字，未调用 AI，仅用本地规则对照采分点`
      ),
      note: 'answer-too-short',
    });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.json({
      review: buildDegradedReview(
        input,
        metrics,
        '未配置 DEEPSEEK_API_KEY，已用本地规则评分（关键词与表达指标对照）'
      ),
      note: 'missing-api-key',
    });
  }

  try {
    const content = await requestDeepSeekReview(apiKey, input, metrics);
    const review = normalizeInterviewReview(parseJsonLoose(content), input, metrics);
    return res.json({ review });
  } catch (err: any) {
    console.error('DeepSeek interview review error:', err?.message || err);
    return res.json({
      review: buildDegradedReview(
        input,
        metrics,
        `AI 评分失败：${err?.message || '未知错误'}，已用本地规则评分`
      ),
      note: 'deepseek-failed',
    });
  }
});

// High-Fidelity Emotional Voice Synthesis Endpoint using Gemini TTS
app.post('/api/tts', requireAuth, async (req, res) => {
  const { text, voiceName = 'Charon', style } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Text is required for TTS' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'GEMINI_API_KEY not configured', fallback: true });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Valid voices: 'Charon', 'Kore', 'Fenrir', 'Puck', 'Zephyr'
    const validVoices = ['Charon', 'Kore', 'Fenrir', 'Puck', 'Zephyr'];
    const chosenVoice = validVoices.includes(voiceName) ? voiceName : 'Charon';

    // Tailored emotional instructions
    const promptStyle = style || (
      chosenVoice === 'Charon'
        ? '严肃庄重、富有威严、音调沉稳大气的中国国家公务员面试正厅级主考官口吻，普通话标准，富有临场压迫感与考场仪式感，情绪真挚自然'
        : chosenVoice === 'Kore'
          ? '温润亲切、循循善诱、娓娓道来的公考命题组资深名师口吻，语调抑扬顿挫，充满对考生的鼓励与启发'
          : '专业清晰、沉着自信、富有机关实务感染力的实干型导师口吻'
    );

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text.slice(0, 900),
              speechMetadata: {
                style: promptStyle,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: chosenVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: chosenVoice,
        text
      });
    }

    return res.status(500).json({ error: 'No audio returned', fallback: true });
  } catch (err: any) {
    console.error('Gemini TTS error:', err);
    return res.status(500).json({ error: err.message || 'TTS generation failed', fallback: true });
  }
});

// ============================================
// 个人统计与排行榜（需登录）
// ============================================
app.get('/api/stats/overview', async (req, res) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录后再查看统计' });
  }
  try {
    const overview = await buildStatsOverview(auth);
    return res.json(overview);
  } catch (err: any) {
    console.error('stats overview error:', err?.message || err);
    return res.status(500).json({ error: 'stats_unavailable', message: err?.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'unauthorized', message: '请先登录后再查看排行榜' });
  }
  const limit = Number(req.query.limit) || 20;
  const result = await buildLeaderboard(auth, limit);
  if (result.error) {
    return res.status(500).json({ error: 'leaderboard_unavailable', message: result.error });
  }
  return res.json({ entries: result.entries });
});

// 未匹配的 /api 路径统一返回 JSON
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

export const handler = serverless(app);
