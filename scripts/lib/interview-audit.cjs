/**
 * 面试题库采分点体检规则（20 题样例 / 100 题全量 audit 共用）
 *
 * 只做启发式体检：把“无法逐条判定”的采分点挑出来给人看，
 * 不替代人工判断，也不修改题库原文。
 */

/** 纯主观评价词：出现即说明这条采分点无法用“说了/没说过”来判定 */
const VAGUE_RE =
  /(有深度|有高度|站位高|语言流畅|表达清晰|逻辑清晰|有感情|接地气|有亮点|内容充实|思路开阔|有说服力|态度端正|认识深刻|有文采|气势)/g;

/** 小标题属于判断/观点类时，即使正文出现“保障、机制”等词也按判断型标注 */
const HEAD_JUDGMENT_RE =
  /^(定性|性质|本质|原因分析|原因|判断|认识|态度|立场|观点|意义|价值|危害|影响|理解|评价|点评)/;

/** 具体动作 / 责任主体 / 时限 / 数量，占其一才算“能落到行为” */
const CONCRETE_RE =
  /(\d|[一二三四五六七八九十]+(天|小时|分钟|个工作日|次|轮|人|户|条|名)|当天|立即|限时|部门|村|社区|街道|单位|领导|群众|家属|民警|公安|卫健|疾控|消防|市场监管|应急|学校|校医|企业|媒体|记者|财政|资金|台账|机制|预案|名单|窗口|热线|平台|公示|回访|整改|排查|核实|上报|协调|组织|安排|落实|建立|明确|培训|演练|评估|告知|承诺|跟踪|记录|公开|通报|调度|处置|疏导|警戒|疏散|安置|检测|采样|审批|备案|考核|问责|宣传|解释|答复|反馈|登记|摸排|摸清|摸查|了解|掌握|问需|问计|听取|征求|征询|吸纳|储备|抢修|消杀|封控|分流|转办|督办|联席|专班|亮明|佩戴|录制|留存|备份|核对|比对|劝阻|劝导|陪同|代跑|代办|普及|配置|发展|开放|反哺|引导|教育|讲解|设置|增设|推广|建设|完善|优化|简化|下沉|上门|入户|走访|电话|处罚|追责|约谈|对接|共享|核验|筛查|统计|研判|预警|监测|巡查|值守|响应|启动|保障|供应|配送|发放|建档|验收|审计|督查|督导|检查|抽查|满意度|投诉|举报|工单|闭环|清单|责任人|牵头|配合|方案|流程|标准|规范|制度|办法|政策|法规|文件|会议|座谈|听证|问卷|调研|摸底|奖惩|激励|补贴|补助|志愿|社工|网格|物业|家长|保安|医护|专家|心理|安抚|救助|帮扶|慰问|照护|托养|助餐|送餐|助医|助学|就业|招聘|创业|贷款|保险|理赔|报销|结算|支付|收费|定价|减免|优惠|错峰|预约|排队|延时|错时|周末|全天候)/g;

/**
 * 单条采分点体检。
 * 硬失败只看三件事：没有冒号分层、做法过短、出现纯主观评价词。
 * 没有动作/主体/时限不直接判失败，而是标记为“判断型”，提示人工按“是否表态+给理由”核对。
 */
function auditKeyPoint(text) {
  const notes = [];
  const warnings = [];
  const colonIndex = text.search(/[：:]/);
  const body = colonIndex >= 0 ? text.slice(colonIndex + 1).trim() : text;

  if (colonIndex < 0) notes.push('缺少“小标题：具体做法”分层，报告里只能整条判定');
  if (Array.from(body).length < 10) notes.push('具体做法不足 10 字，难以说明“说到什么程度算命中”');
  const vague = [...new Set(body.match(VAGUE_RE) || [])];
  if (vague.length > 0) notes.push(`含主观评价词（${vague.join('、')}），无法逐项对照`);

  const headText = (text.split(/[：:]/)[0] || '').trim();
  const forceJudgment = HEAD_JUDGMENT_RE.test(headText);
  const hasConcrete = !forceJudgment && CONCRETE_RE.test(body);
  if (!hasConcrete) {
    warnings.push('判断/观点型：按“是否明确表态 + 是否给出理由”判定，不要求出现动作');
  }

  return { judgeable: notes.length === 0, notes, warnings, kind: hasConcrete ? 'action' : 'judgment' };
}

function auditQuestion(question) {
  const details = question.keyPoints.map((point, index) => {
    const result = auditKeyPoint(point.text);
    return {
      index: index + 1,
      critical: point.critical === true,
      text: point.text,
      kind: result.kind,
      judgeable: result.judgeable,
      notes: result.notes,
      warnings: result.warnings,
    };
  });
  const low = details.filter((item) => !item.judgeable);
  return {
    keyPointCount: details.length,
    criticalCount: question.keyPoints.filter((point) => point.critical === true).length,
    actionCount: details.filter((item) => item.kind === 'action').length,
    judgmentCount: details.filter((item) => item.kind === 'judgment').length,
    judgeableCount: details.length - low.length,
    judgeableRate: details.length ? Number(((details.length - low.length) / details.length).toFixed(3)) : 0,
    lowJudgeability: low,
    details,
  };
}

module.exports = { auditKeyPoint, auditQuestion, VAGUE_RE, HEAD_JUDGMENT_RE, CONCRETE_RE };
