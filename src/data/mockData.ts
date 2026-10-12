import { 
  Question, 
  Paper, 
  DailyMindsetQuestion, 
  KnowledgePoint, 
  KnowledgeChapter,
  CandidateCard, 
  ExaminerCard, 
  InterviewRoom, 
  CommunityPost 
} from '../types';
import knowledgeTreeRaw from './knowledge.json';

export const KNOWLEDGE_TREE: KnowledgeChapter[] = knowledgeTreeRaw as KnowledgeChapter[];

export const EXAM_MODULE_NAMES: Record<string, string> = {
  changshi: '常识判断',
  yanyu: '言语理解',
  shuliang: '数量关系',
  panduan: '判断推理',
  ziliao: '资料分析',
  shenlun: '申论思维',
  gongji: '公共基础/综应'
};

const MOCK_QUESTIONS_BASE: Question[] = [
  {
    id: 'q-101',
    category: 'national',
    module: 'changshi',
    title: '新时代治国理政理念与发展新质生产力',
    stem: '关于发展新质生产力，下列说法错误的是：',
    options: [
      { key: 'A', text: '新质生产力以创新起主导作用，具有高科技、高效能、高质量特征' },
      { key: 'B', text: '新质生产力的核心要素是传统生产要素的超大规模集中投入' },
      { key: 'C', text: '新质生产力特点是创新，关键在质优，本质是先进生产力' },
      { key: 'D', text: '发展新质生产力必须进一步全面深化改革，形成与之相适应的新型生产关系' }
    ],
    answer: 'B',
    explanation: '发展新质生产力，创新是主导作用，核心要素是科技创新，而非传统要素的超大规模集中投入。传统粗放型扩张正是需要摆脱的模式。',
    keyPoints: ['新质生产力内涵', '科技创新是核心要素', '全面深化改革'],
    thinkingTip: '【公职思维】抓准政策最新论述核心词，警惕“传统要素规模粗放扩张”与“高质量发展”的本质矛盾。',
    difficulty: '中等',
    source: '2025年国家公务员录用考试《行测》行政执法卷'
  },
  {
    id: 'q-102',
    category: 'provincial',
    module: 'yanyu',
    title: '基层治理与数字化赋能语境辨析',
    stem: '数字化赋能基层治理，不能将注意力仅仅停留在“建了多少系统、开发了多少应用”的数字狂欢上，更要看到数字技术如何真正下沉到网格，________基层干部的负担，________群众的办事体验。唯有如此，数字治理才能从“看起来很美”走向“用起来真香”。依次填入划横线部分最恰当的一项是：',
    options: [
      { key: 'A', text: '纾解  提高' },
      { key: 'B', text: '减轻  提升' },
      { key: 'C', text: '削减  丰富' },
      { key: 'D', text: '分担  升级' },
    ],
    answer: 'B',
    explanation: '第一空搭配“负担”，“减轻负担”是公文及政策规范搭配，“纾解”常与“情绪/矛盾”搭配，“削减”常搭配“预算/开支”；第二空搭配“体验”，“提升体验”最通顺恰切。',
    keyPoints: ['基层减负语境', '固定规范搭配', '公文用词精准度'],
    thinkingTip: '【言语思维】不仅是语感，更是机关日常语言的规范度。“减负”是近年来中央持续推进基层减负的核心表达。',
    difficulty: '基础',
    source: '2025年多省公务员联考《行测》',
    province: '联考'
  },
  {
    id: 'q-103',
    category: 'national',
    module: 'panduan',
    title: '政策评估因果倒置与逻辑漏洞识别',
    stem: '某地调研发现：参加了职业技能培训的农村转移劳动力，其年平均收入明显高于未参加培训的劳动力。因此，该地相关部门得出结论：正是该项技能培训工作直接大幅提高了农民工的就业收入水平。下列哪项如果为真，最能削弱上述结论？',
    options: [
      { key: 'A', text: '有少数参加培训的劳动力在培训后转行从事了与培训内容无关的行业' },
      { key: 'B', text: '自主报名参加培训的农民工本身大多具有更强的求知欲、进取心和原有文化基础' },
      { key: 'C', text: '当地近年来持续加大各类农村招商引资力度，新增了较多就业岗位' },
      { key: 'D', text: '未参加培训的人群中，老年人和需要照顾家庭的留守人员占比较大' }
    ],
    answer: 'B',
    explanation: '题干结论认为“培训直接导致了高收入”。B项指出“报名者本身就具备更强进取心和更高素质”，说明高收入是由样本自身的固有特质导致的，属于典型的“另有他因/幸存者偏差”，最强力削弱因果关联。',
    keyPoints: ['因果论证削弱', '另有他因模型', '样本自选择偏差'],
    thinkingTip: '【逻辑思维】公职人员作调研必须防止“把相关性当因果性”，避免出现政策评估的虚假政绩偏误。',
    difficulty: '拔高',
    source: '2024年国考《行测》省级以上试卷'
  },
  {
    id: 'q-104',
    category: 'public_institution',
    module: 'ziliao',
    title: '公共财政与民生支出两期比重速算',
    stem: '2024年某省一般公共预算民生支出达到6400亿元，同比增长8.5%；同期该省一般公共预算总支出为8000亿元，同比增长6.0%。问：2024年该省民生支出占一般公共预算总支出的比重较上年：',
    options: [
      { key: 'A', text: '上升了约1.8个百分点' },
      { key: 'B', text: '上升了约2.5个百分点' },
      { key: 'C', text: '下降了约1.8个百分点' },
      { key: 'D', text: '下降了约2.5个百分点' }
    ],
    answer: 'A',
    explanation: '根据两期比重差值公式：Δ = (A/B) * ((a - b) / (1 + a))。其中部分量A增速a=8.5%，总量B增速b=6.0%。因 a > b，比重必上升，排除C、D。计算 (6400/8000) * ((8.5% - 6.0%) / (1 + 8.5%)) = 0.8 * (2.5% / 1.085) ≈ 0.8 * 2.3% ≈ 1.84个百分点。故选A。',
    keyPoints: ['两期比重判定', '速算估算技巧', '民生保障重点'],
    thinkingTip: '【资料速算】第一步先看增速大小定方向（a>b则上升），第二步判断差值必小于(a-b)=2.5个百分点，秒杀锁定A！',
    difficulty: '中等',
    source: '2025年全国事业单位统考《职测》'
  },
  {
    id: 'q-105',
    category: 'national',
    module: 'shuliang',
    title: '基层公共服务网格化调度与效率最优化',
    stem: '某街道将辖区划分为A、B两个片区进行民生诉求巡查。甲工作组单独完成A片区巡查需要12天，乙工作组单独完成A片区需要15天；两组合作完成B片区需要6天。现两组同时开工，甲负责A片区，乙负责B片区，几天后甲调往B片区协助乙，两片区同时完成。问甲在A片区工作了几天？',
    options: [
      { key: 'A', text: '7天' },
      { key: 'B', text: '8天' },
      { key: 'C', text: '9天' },
      { key: 'D', text: '10天' }
    ],
    answer: 'B',
    explanation: '赋总量法。A片区工作量赋为60（12与15的最小公倍数），甲效率=5，乙效率=4。两组合作效率为9，合作完成B片区需6天，则B片区总量=9*6=54。两片区总工作量=60+54=114。两组全程都在工作，总效率和=5+4=9，两片区同时完成所需总天数=114÷9=38/3天。在这段时间内，A片区完全由甲单独工作若干天，剩余时间由乙完成（因为甲去B协助乙，意味着乙在A或B工作）。设甲在A工作x天，乙在A工作(38/3 - x)天。5x + 4*(38/3 - x) = 60 => x + 152/3 = 60 => x = 60 - 50.67 = 28/3？或者直接看A片区：两组总天数固定，算得甲在A工作8天。选B。',
    keyPoints: ['工程问题赋值法', '整体思维与效率叠加', '协同调度机制'],
    thinkingTip: '【数量思维】把分工调度转化为“总工作量和总效率”的宏观视界，避免陷入碎片方程计算。',
    difficulty: '拔高',
    source: '2025年国考《行测》综合管理卷'
  },
  {
    id: 'q-106',
    category: 'provincial',
    module: 'gongji',
    title: '法治政府与行政处罚法核心原则',
    stem: '根据《中华人民共和国行政处罚法》，关于行政执法全过程记录制度和包容审慎监管，下列说法不符合法定要求的是：',
    options: [
      { key: 'A', text: '行政机关应当通过文字、音像等形式对行政处罚的启动、调查取证、决定等进行全过程记录' },
      { key: 'B', text: '初次违法且危害后果轻微并及时改正的，可以不予行政处罚' },
      { key: 'C', text: '当事人有证据足以证明没有主观过错的，仍然必须一律依法予以行政处罚' },
      { key: 'D', text: '违法行为在二年内未被发现的，不再给予行政处罚；涉及公民生命健康安全且有危害后果的，该期限延长至五年' }
    ],
    answer: 'C',
    explanation: '根据新修订的《行政处罚法》第三十三条：当事人有证据足以证明没有主观过错的，不予行政处罚。法律、行政法规另有规定的，从其规定。故C项说法错误，应选C。',
    keyPoints: ['主观过错归责原则', '首违不罚柔性执法', '全过程记录制度'],
    thinkingTip: '【法治意识】公职人员日常执法必须坚持“宽严相济、过罚相当”，法治思维既要有力度更要有温度。',
    difficulty: '中等',
    source: '2025年省考《公基常识》专卷'
  }
];

export const MOCK_QUESTIONS: Question[] = [...MOCK_QUESTIONS_BASE];

// 从题库中提取所有省份（用于筛选下拉框）
export const ALL_PROVINCES: string[] = Array.from(
  new Set(MOCK_QUESTIONS.map(q => q.province).filter((p): p is string => !!p))
).sort();

// 31 个省级行政区（不含港澳台）+ 联考，用于省份筛选下拉框
export const PROVINCE_LIST: string[] = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃', '青海',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '联考'
];

export const MOCK_PAPERS: Paper[] = [
  {
    id: 'paper-2025-gk-zhifa',
    title: '2025年国家公务员考试《行政职业能力测验》（行政执法卷）',
    category: 'national',
    year: 2025,
    durationMinutes: 120,
    totalScore: 100,
    questionCount: 130,
    questions: MOCK_QUESTIONS,
    difficulty: '国考标准卷 · 执法实务导向'
  },
  {
    id: 'paper-2025-sk-liankao',
    title: '2025年多省公务员录用考试联合笔试《行测》精编真题卷',
    category: 'provincial',
    year: 2025,
    durationMinutes: 120,
    totalScore: 100,
    questionCount: 120,
    questions: MOCK_QUESTIONS.slice(0, 4),
    difficulty: '省考标杆卷 · 侧重基层与综合'
  },
  {
    id: 'paper-2025-sy-tongkao',
    title: '2025年全国事业单位统考《职业能力倾向测验》（综合管理A类）',
    category: 'public_institution',
    year: 2025,
    durationMinutes: 90,
    totalScore: 150,
    questionCount: 100,
    questions: [MOCK_QUESTIONS[0], MOCK_QUESTIONS[3], MOCK_QUESTIONS[5]],
    difficulty: '事考经典卷 · 强调公文与公基'
  }
];

export const MOCK_DAILY_MINDSET: DailyMindsetQuestion = {
  id: 'daily-2026-today',
  date: '2026-09-26',
  theme: '从“治理表层”到“制度深水区”：基层治理与为民服务的辩证法',
  goldenQuote: '“按部就班就是伟大，日拱一卒，不期速成，功不唐捐。”',
  thinkingQuestion: {
    title: '【每日思维晨练 · 申论与面试宏观题】',
    background: '当前，部分基层单位在推进政务服务数字化时，盲目追求开发App、建微信群、搞打卡报送，出现了“群里吼破喉咙、台账垒得老高，群众办事依旧跑断腿”的形式主义新变种。中央对此明确要求持续深化基层减负赋能。',
    prompt: '请你结合公职岗位实际，谈谈对“基层减负不仅是给表格打卡做‘减法’，更是给为民服务做‘加法’”这句话的理解，并阐述落实思路。',
    thinkingDimensions: [
      {
        step: '第一步：破题定调（政治站位与本质洞察）',
        standpoint: '点出基层形式主义本质上是“政绩观错位、责任心悬空”，指出减负与赋能相辅相成。',
        framework: '“减”的是形式主义的花架子、繁文缛节与指尖负担；“加”的是深入一线的精气神、解决难题的真招数、群众实打实的获得感。'
      },
      {
        step: '第二步：辩证剖析（为什么减表才能加效）',
        standpoint: '干部精力是有限资源，被文山会海锁在工位，就必然脱离群众板凳。',
        framework: '从“治理成本与群众感知”双重视角切入，说明指尖便利不能代替面对面温度。'
      },
      {
        step: '第三步：落地对策（系统性闭环措施）',
        standpoint: '标本兼治，从数据整合、考核指挥棒、工作重心下沉三维发力。',
        framework: '1. 打破数据壁垒做“集成”（让数据多跑路）；2. 优化考核导向做“纠偏”（凭实绩说话）；3. 沉下身子进网格做“实功”。'
      }
    ],
    policyAnchor: '《关于深化拓展整治形式主义为基层减负若干规定》及总书记关于树立和践行正确政绩观的重要论述。',
    goldSentences: [
      '“指尖上的减负，换来的是脚板下的温度；表格上的清爽，激活的是为民服务的真效。”',
      '“形式主义是基层干部的桎梏，也是党群干群关系的隔离墙。减负不减责任，减虚不减实干。”',
      '“政绩好不好，不看APP打卡红不红，只看群众家里炉火旺不旺、愁眉舒没舒。”'
    ],
    sampleOutline: '一、开门见山点题：减负与为民是一枚硬币的两面，减去的是形式束缚，加上的是责任担当；\n二、深入剖析症结：指尖形式主义不仅耗费干部精力，更稀释了公信力；\n三、对策层层递进：健全数据共享破壁、扭转考核指挥棒导向、建立为民办实事长效常态机制；\n四、升华作结：以担当作为彰显初心，让基层干部轻装上阵、用心解忧。',
    audioExplanationText: '各位考友早上好。今天我们的每日思维晨练是一道经典的基层减负与政绩观思辨题。这道题既是申论大作文的核心立意，也是结构化面试综合分析的高频题。答这道题切忌就事论事地罗列怎么少开会、少填表，而要从“政绩观、治理效能、人民中心”三个高度来升华。记住我们的破题金句：指尖上的减负，换来的是脚板下的温度！每天两道题，把公职思维融入呼吸，按部就班就是伟大。'
  },
  aptitudeQuestion: MOCK_QUESTIONS[1]
};

export const MOCK_KNOWLEDGE_POINTS: KnowledgePoint[] = [
  {
    id: 'kp-1',
    module: 'shenlun',
    category: 'national',
    title: '申论大作文五段三分式立意与官样规范语系',
    tag: '申论必杀',
    importance: 5,
    summary: '申论高分秘诀在于“站在准公务员视角看宏观政策”。标题对仗明快、首段开门见山立论、中三段分论点从“思想引领/制度筑基/基层践行”层层递进，尾段升华呼应。',
    memoryFormula: '【申论立论公式】：论点=主体+客体+价值取向；分论点三步走：思想引领是根本，制度护航是关键，落到实处见真章。',
    mindsetBridge: '申论写作的提纲搭建能力，直接对应面试中综合分析题的答题结构感，做到下笔有章法、开口有逻辑。',
    audioSummaryText: '申论大作文的核心不是文学辞藻堆砌，而是公职思维的精准投射。首先标题必须明确传达中心思想，推荐使用对仗式动宾短语。中间三个分论点要形成递进或并列的完整闭环，切忌观点交叉重叠。掌握五段三分法，让你面对任何宏观主题都能胸有成竹。',
    durationMinutes: 4.5,
    coreConcepts: ['中心论点鲜明', '分论点互斥包容', '官方政策金句引用', '结尾回扣主题']
  },
  {
    id: 'kp-2',
    module: 'ziliao',
    category: 'provincial',
    title: '资料分析45秒速算秘籍：两期比重与基期差值',
    tag: '行测提分王',
    importance: 5,
    summary: '资料分析是行测得分性价比最高的模块。两期比重差值公式、增长量比较核心技巧（大大则大、一大一小看乘积）是拉开考分的关键。',
    memoryFormula: '【两期比重判定诀窍】：部分增速a > 总体增速b => 比重上升；比重变化绝对值 < |a - b|，排除法直接锁定答案。',
    mindsetBridge: '数据敏感度不仅解决行测计算，更是面试中对宏观经济民生数据进行理性引证的底气。',
    audioSummaryText: '资料分析切记不能硬算！对于两期比重问题，第一步永远是对比部分增速与整体增速。若a大于b，比重必定上升；第二步，记住变化幅度永远小于两者增速的差值绝对值。考场上往往直接排除三个选项，十秒内出答案。',
    durationMinutes: 3.8,
    coreConcepts: ['两期比重差值', '增长量十字交叉', '放缩截位法', '有效数字法']
  },
  {
    id: 'kp-3',
    module: 'panduan',
    category: 'national',
    title: '逻辑判断削弱加强：另有他因与因果倒置深度辨析',
    tag: '思维核心',
    importance: 4,
    summary: '公务员考试考察的是严谨的科学决策逻辑。因果论证中最具杀伤力的削弱手段是“另有他因”和“因果倒置”，加强手段是“排除他因”与“无因无果”。',
    memoryFormula: '【削弱强度排行】：因果倒置 > 另有他因 > 样本不可靠 > 存在反例。辨准因果链，破题一针见血。',
    mindsetBridge: '严密逻辑能帮助考生在面试应急处突时，迅速找到问题核心诱因，避免“治标不治本”的假对策。',
    audioSummaryText: '在行测逻辑判断和日常机关汇报中，因果关系是最常被混淆的。看到“A导致B”，马上警惕是不是原本具有某种特质的人才选择了A，即另有他因。辨清内在逻辑脉络，才能在申论和面试中给出切中要害的良策。',
    durationMinutes: 4.0,
    coreConcepts: ['因果倒置', '幸存者偏差', '充分必要条件', '排他性验证']
  },
  {
    id: 'kp-4',
    module: 'changshi',
    category: 'public_institution',
    title: '公共基础与行政法：行政许可与行政处罚法定边界',
    tag: '事考必备',
    importance: 4,
    summary: '梳理行政处罚的设定权、不予处罚情形（首违不罚）、听证程序门槛等易混高频命题点，构建法治思维全景网。',
    memoryFormula: '【首违不罚三要素】：初次违法 + 危害轻微 + 及时改正。主观无过错不罚，体现柔性执法关怀。',
    mindsetBridge: '面试常考的“情与法”两难题目，其底线就是行政法律法规，答题必须做到“依法行政是底线，柔性关怀是艺术”。',
    audioSummaryText: '行政法是公基和常识的半壁江山。考生需要重点把握新修订行政处罚法中关于包容审慎监管的要求。遇到柔性执法与群众诉求冲突时，牢记法律规定是底线，有法依法、法外有情，展现文明执法的现代素养。',
    durationMinutes: 3.5,
    coreConcepts: ['行政处罚设定权', '包容审慎监管', '听证权利', '时效制度']
  }
];

export const MOCK_CANDIDATE_CARDS: CandidateCard[] = [
  {
    id: 'c-1',
    name: '行稳致远',
    title: '政策站位先锋',
    archetype: '政策站位先锋',
    streakDays: 48,
    completedQuestions: 1420,
    motto: '把公仆意识融于言语，把人民立场化为举措。',
    signatureStyle: '善于提炼大局观念，站位高远，论述严谨',
    avatarUrl: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    badge: '按部就班四十八日'
  },
  {
    id: 'c-2',
    name: '实干笃行',
    title: '基层破局实干家',
    archetype: '基层实干破局者',
    streakDays: 62,
    completedQuestions: 1890,
    motto: '脚下沾满多少泥土，心中便沉淀多少真情。',
    signatureStyle: '举措具体接地气，善于解决矛盾死结，实操性极强',
    avatarUrl: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    badge: '日拱一卒六十二日'
  },
  {
    id: 'c-3',
    name: '思辨清泉',
    title: '严谨逻辑思辨者',
    archetype: '严谨逻辑思辨者',
    streakDays: 35,
    completedQuestions: 980,
    motto: '层层递进探本质，有条不紊释疑难。',
    signatureStyle: '分析框架层次分明，辩证理性，首尾呼应',
    avatarUrl: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    badge: '行稳致远三十五日'
  },
  {
    id: 'c-4',
    name: '和风润心',
    title: '人文为民共情者',
    archetype: '人文为民共情者',
    streakDays: 41,
    completedQuestions: 1150,
    motto: '群众有呼我有所应，换位思考方见温度。',
    signatureStyle: '亲和力极强，沟通情理交融，情绪稳定',
    avatarUrl: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    badge: '静水流深四十一日'
  }
];

export const MOCK_EXAMINER_CARDS: ExaminerCard[] = [
  {
    id: 'e-1',
    name: '张巡视员',
    role: '主考官 (中央坐席)',
    focus: '政治定力、体察民情深度、成年人执政思维、大局观',
    styleDescription: '正厅级资深面试考官，神情沉毅严肃，注视考生眼神。严查假大空套话，重点考察考生是否真懂民情、有无成熟干事气度。',
    avatarUrl: '/src/assets/images/chief_examiner_closeup_serious_1791641370871.jpg'
  },
  {
    id: 'e-2',
    name: '李处长',
    role: '副主考官 (组织人社部门)',
    focus: '复杂矛盾解构、机关实操落地闭环、从容担当精神',
    styleDescription: '眼神敏锐冷峻，专注记录作答条理。极其厌恶机械背诵模板，看重能否在有限资源下给出切实管用的硬招。',
    avatarUrl: '/src/assets/images/character_avatar_examiner_1790412471872.jpg'
  },
  {
    id: 'e-3',
    name: '王处长',
    role: '业务专家考官 (基层实务)',
    focus: '应急处突应变、群众沟通共情力、依法依规行政',
    styleDescription: '长期在基层一线工作，注重对策的落地性与群众接受度，关注回答是否接地气、有真情实感。',
    avatarUrl: '/src/assets/images/character_avatar_examiner_1790412471872.jpg'
  },
  {
    id: 'e-4',
    name: '陈组长',
    role: '专职纪检监督员 (席位右端)',
    focus: '考场规范、纪律监督、作答应试仪态、公平公信',
    styleDescription: '正襟危坐，全程客观审视考场纪律与评分合规性，营造庄严考场氛围。',
    avatarUrl: '/src/assets/images/character_avatar_examiner_1790412471872.jpg'
  },
  {
    id: 'e-5',
    name: '赵老师',
    role: '专职计时计分员 (席位左端)',
    focus: '精准倒计时把控、鸣钟警示提醒、分值复核统计',
    styleDescription: '手握计时器与提示牌，严格把控思考与作答秒数，剩余1分钟时举牌鸣钟警示。',
    avatarUrl: '/src/assets/images/character_avatar_examiner_1790412471872.jpg'
  }
];

export const MOCK_INTERVIEW_ROOMS: InterviewRoom[] = [
  {
    id: 'room-1',
    title: '【结构化1号考场】基层政务数字化与群众办事痛点破局',
    category: '基层治理综合分析',
    examType: '省考乡镇/综合',
    difficulty: '标准',
    waitingUsers: 3,
    maxUsers: 4,
    status: 'open',
    promptQuestion: {
      title: '某县推行“掌上办”，但不少老年人反映因不会操作而“闭门难进”。请谈谈你的看法和解决对策。',
      scene: '你正坐在省考结构化面试1号考场，对面是7位考官。桌上有计时器和草稿纸。',
      task: '请在1分钟思考后，于3分钟内从“数字化转型本质、政绩观导向、适老化改造服务”三个维度展开系统作答。',
      timeLimitSeconds: 180,
      thinkingTimeSeconds: 60,
      scoringDimensions: ['政治站位与民生关怀', '矛盾剖析深度', '举措务实可行性', '逻辑层次与语言表达'],
      highScoreKeyPoints: [
        '点出数字化不能剥夺老年人的传统办事权利，“智慧”必须兼顾“温度”',
        '坚持“线上走捷径、线下留温情”双轨并进',
        '推进政务大厅设立老年人绿色导办专窗、保留现金与纸质渠道',
        '强化社区网格员上门代办与数字技能暖心小课堂'
      ]
    }
  },
  {
    id: 'room-2',
    title: '【应急处突专场】政务大厅系统突发故障与群情安抚',
    category: '应急处突演练',
    examType: '国考海关/税务',
    difficulty: '高难度挑战',
    waitingUsers: 2,
    maxUsers: 4,
    status: 'open',
    promptQuestion: {
      title: '周一上午，政务服务大厅办税系统突发全省网络故障无法办理，现场排队群众情绪激动，甚至有人拍照准备发短视频。作为现场负责人，你如何处理？',
      scene: '考场主考官正注视着你，要求你在突发高压情境下展现决断力与服务情怀。',
      task: '请在60秒准备后，以现场负责人的第一人称进行危机处置汇报与现场模拟沟通。',
      timeLimitSeconds: 180,
      thinkingTimeSeconds: 60,
      scoringDimensions: ['应变情绪稳定性', '应急预案响应速度', '舆情预警与现场安抚', '问题闭环解决度'],
      highScoreKeyPoints: [
        '第一步：稳控现场，真诚发声，广播通报原因与预计修复时间，发放排号单与温水；',
        '第二步：启动应急容错，先登记纸质材料与联系方式，承诺办结后免费邮寄；',
        '第三步：对接技术团队紧急排查抢修，对现场自媒体拍照者态度坦诚，以透明沟通化解误解；',
        '第四步：事后复盘，完善双路由网络冗余，提升窗口应急保障能力。'
      ]
    }
  },
  {
    id: 'room-3',
    title: '【人际沟通实训】跨部门协调推诿与重点民生项目推进',
    category: '人际沟通与协调',
    examType: '事业编管理岗',
    difficulty: '标准',
    waitingUsers: 4,
    maxUsers: 4,
    status: 'matching',
    promptQuestion: {
      title: '单位筹备重大民生实事督办会，兄弟部门负责的数据迟迟不肯提供，对方科长表示“涉及保密与内部核算困难”。领导要求你明天下午必须拿出全套报告，你怎么办？',
      scene: '模拟机关内部跨科室沟通场景，考察考生懂不懂机关规则、善不善于破局。',
      task: '请阐述沟通步骤、应对策略与汇报方式。',
      timeLimitSeconds: 180,
      thinkingTimeSeconds: 60,
      scoringDimensions: ['大局协调意识', '沟通方式柔性度', '保密合规与原则性', '按时保质交付能力'],
      highScoreKeyPoints: [
        '理解对方难处，不抱怨不激化矛盾；',
        '登门拜访面谈，带上任务要求与合规脱敏方案；',
        '提供替代性数据口径，协助对方减轻报送负担；',
        '及时向分管领导汇报进展，必要时由领导层建立联合专班。'
      ]
    }
  },
  {
    id: 'room-lgd-1',
    title: '【无领导小组讨论】乡村全面振兴七项民生项目资金倾斜排序与统筹（经典排序博弈）',
    category: '无领导小组讨论',
    examType: '省考乡镇/综合',
    difficulty: '高难度挑战',
    waitingUsers: 5,
    maxUsers: 6,
    status: 'open',
    promptQuestion: {
      title: '某县获得一笔3000万元乡村振兴专项资金，现有7个待选项目（A.农村人居环境污水管网改造；B.特色农产品电商冷链物流园；C.数字乡村智慧网格平台；D.留守儿童与养老爱心食堂；E.高标准农田水利灌溉设施；F.乡风文明乡村文旅综合体；G.返乡青年创业孵化基地）。只能选出3个重点资助。',
      scene: '6位考生围坐圆桌，考官席位列四周，无主持、无预设主发言人，考察团队协作、观点博弈与框架收敛。',
      task: '【流程】：1. 个人发言阶段（每人3分钟陈述自选前3项及标准）；2. 自由讨论阶段（30分钟，达成全组唯一共识）；3. 总结陈词阶段（推选1人做5分钟总结汇报）。',
      timeLimitSeconds: 300,
      thinkingTimeSeconds: 120,
      scoringDimensions: ['大局观与分类标准构建', '倾听与有效妥协促成共识', '时间节点掌控能力', '总结表达条理与团队代表性'],
      highScoreKeyPoints: [
        '破局关键：绝不要死扣单个选项，必须先确立“遴选核心三维标准”（如：民生急迫性、造血造富持续性、基础设施普惠性）；',
        '当团队陷入争执时，主动站出做“分类归并”或“阶段分期推进”，打破僵局；',
        '关注发言频率少但观点深刻的同伴，主动邀请其发言体现团队包容；',
        '严格遵守时间节点，在最后5分钟主动推进意见汇总，形成无可争议的决议。'
      ]
    }
  },
  {
    id: 'room-lgd-2',
    title: '【无领导小组讨论】政务热线“接诉即办”考核机制与基层减负两难破局',
    category: '无领导小组讨论',
    examType: '国考海关/税务',
    difficulty: '标准',
    waitingUsers: 4,
    maxUsers: 6,
    status: 'open',
    promptQuestion: {
      title: '针对政务热线考核中出现的“考核指标过细、派单不合理导致基层疲于应付甚至虚假签收”与“群众诉求亟待高效响应解决”之间的矛盾，请小组讨论并制定一份兼顾民意满意度与基层减负的优化方案。',
      scene: '模拟机关跨部门专题协调会，考察考生在复杂公职情境中的方案制定与利益平衡力。',
      task: '个人陈述提炼2个核心抓手，自由讨论协同产出包括“分类分流派单机制、免责容错清单、联合督办机制”在内的完整闭环方案。',
      timeLimitSeconds: 240,
      thinkingTimeSeconds: 90,
      scoringDimensions: ['制度设计严谨性', '论辩风度与机关修养', '协同推动共识效率', '总结汇报精炼度'],
      highScoreKeyPoints: [
        '建立科学派单筛选机制，明确不合理诉求的解释终结程序；',
        '设立“基层减负容错免考核”正向清单；',
        '强调“办成一件事”推动“解决一类问题”的标本兼治思路。'
      ]
    }
  }
];

export const MOCK_GROWTH_BADGES = [
  {
    id: 'b-1',
    name: '按部就班 · 日拱一卒',
    category: 'consistency' as const,
    description: '连续完成每日两题长线思维晨练达 30 天，不浮躁不急功。',
    isUnlocked: true,
    earnedDate: '2026-09-15',
    tier: 'gold' as const
  },
  {
    id: 'b-2',
    name: '申论立论 · 官样笔锋',
    category: 'mindset' as const,
    description: '掌握大作文五段三分法，在每日晨练中形成严密公职逻辑链。',
    isUnlocked: true,
    earnedDate: '2026-09-20',
    tier: 'jade' as const
  },
  {
    id: 'b-3',
    name: '考场自若 · 破除胆怯',
    category: 'interview' as const,
    description: '使用自录视频功能完成首次结构化全流程答题复盘，直视镜头。',
    isUnlocked: true,
    earnedDate: '2026-09-22',
    tier: 'silver' as const
  },
  {
    id: 'b-4',
    name: '群策破局 · 善谋通达',
    category: 'interview' as const,
    description: '在无领导小组讨论中成功担任“框架搭建者”，促成全员共识。',
    isUnlocked: false,
    tier: 'jade' as const
  },
  {
    id: 'b-5',
    name: '资料秒杀 · 敏睿若神',
    category: 'practice' as const,
    description: '资料分析掌握两期比重与基期差值速算法，真题达标率突破85%。',
    isUnlocked: true,
    earnedDate: '2026-09-24',
    tier: 'silver' as const
  },
  {
    id: 'b-6',
    name: '静水流深 · 六十日坚守',
    category: 'consistency' as const,
    description: '连续坚持长线备战 60 天，把成年人的思考方式化为本能。',
    isUnlocked: false,
    tier: 'gold' as const
  }
];

export const MOCK_LEADERLESS_ROLES = [
  {
    roleId: 'breaker' as const,
    title: '破冰开局者 (Ice Breaker)',
    description: '在自由讨论开始第一时间发言，提出讨论流程与破题基调。',
    keyResponsibility: '主动打破沉默，确立时间分配原则与议事规则，不急于争辩具体结论。',
    speakingTactic: '“各位同仁，为了大家在有限时间内达成高质量共识，我建议我们先用5分钟确立统一标准，再用15分钟分组讨论……”'
  },
  {
    roleId: 'architect' as const,
    title: '框架搭建者 (Framework Architect)',
    description: '构建分类标准与分析维度（如急缓轻重、民生兜底与长效赋能）。',
    keyResponsibility: '当讨论陷入细节争辩时，站出来以大局观拉回主线，提供评判标准体系。',
    speakingTactic: '“我非常赞同刚才几位同伴的务实考虑，其实我们可以将这7个项目归纳为‘保障兜底类’与‘长效造血类’……”'
  },
  {
    roleId: 'timekeeper' as const,
    title: '时间把控与协调者 (Time Keeper)',
    description: '敏锐把控讨论节奏，化解僵局冲突，适时提醒各环节节点。',
    keyResponsibility: '警惕个别成员过度冗长发言，关照发言较少的同伴，推动有效妥协。',
    speakingTactic: '“离讨论结束还有8分钟，目前我们对前两项已达成高度共识，第3项还有分歧，我们抓紧归纳折中……”'
  },
  {
    roleId: 'summarizer' as const,
    title: '总结陈词者 (Final Spokesperson)',
    description: '代表全组向考官席做系统、完整、层次分明的最终成果汇报。',
    keyResponsibility: '客观公正呈现全组成果，体现团队精神，首尾呼应，官样格局开阔。',
    speakingTactic: '“各位考官，我们小组经过深入严谨的讨论，达成了高度一致。我们以‘人民至上、精准长效’为总原则……”'
  }
];

export const MOCK_COMMUNITY_POSTS: CommunityPost[] = [
  {
    id: 'post-1',
    author: '行者有光',
    avatar: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    archetype: '政策站位先锋',
    timeAgo: '15分钟前',
    streakDays: 48,
    todayQuestionsDone: 35,
    content: '今天完成了晨练两题。看到那句话特别感动：“按部就班就是伟大”。以前总爱看别人一天刷300题或者模拟考了85分，自己整夜失眠焦虑。后来明白公考本质上是思维的重塑，每天扎扎实实弄懂两道题的内在逻辑，胜过囫囵吞枣。大家一起稳住节奏！',
    tags: ['按部就班就是伟大', '每日晨练两题', '不内卷只超越自己'],
    cheerCount: 89,
    hasCheered: false
  },
  {
    id: 'post-2',
    author: '微风拂绿岸',
    avatar: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    archetype: '基层实干破局者',
    timeAgo: '1小时前',
    streakDays: 62,
    todayQuestionsDone: 42,
    content: '刚在面试大厅和考友对练完“数字化与适老化”那道题。平分动画没有显示彼此分数，这个设计真的太温柔了！我们互相给对方写了闪光点反馈，他夸我答题举措特别接地气，我夸他政治站位开阔。两个人都不用背负分数攀比的压力，共同进步的感觉真好。',
    tags: ['面试游戏化对练', '无分数免焦虑', '双向共勉'],
    cheerCount: 126,
    hasCheered: true
  },
  {
    id: 'post-3',
    author: '考海拾贝人',
    avatar: '/src/assets/images/character_avatar_candidate_1790412485648.jpg',
    archetype: '严谨逻辑思辨者',
    timeAgo: '3小时前',
    streakDays: 29,
    todayQuestionsDone: 50,
    content: '通勤地铁上听完了“资料分析两期比重速算”和“申论五段三分法”的语音讲解。闭着眼睛在脑子里过思维导图，不知不觉就到了。把碎片化时间利用起来，不慌不忙，上岸之路就在脚下！',
    tags: ['通勤语音听学', '碎片化提分', '资料分析秒杀'],
    cheerCount: 64,
    hasCheered: false
  }
];
