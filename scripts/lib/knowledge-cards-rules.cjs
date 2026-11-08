/**
 * 知识点卡片（knowledge cards）导入规则
 *
 * 被两个脚本共用：
 *   - scripts/import-knowledge-cards.cjs  从素材 md 抽取 JSON 块 → 落盘前校验
 *   - scripts/validate-knowledge-cards.cjs 对已落盘的 JSON 复检（可单独跑 / 可进 CI）
 *
 * 规则（ERROR 一律阻断，脚本以非 0 退出）：
 *   E01 顶层不是数组
 *   E02 必填字段缺失（九必填：id/module/node_path/title/definition/content/hooks/traps/questions
 *       + audio 字段必须存在，值只允许空串）
 *   E03 字段类型/空值不合法
 *   E04 id 重复 / id 不符合 zlfx-层号-序号（层号 00~08，序号三位数字）
 *   E05 questions 只允许 ["待配题"]
 *   E06 audio 只允许 ""
 *   E07 出现未知字段（防止 markdown 头部的修订记录、施工说明混进数据）
 *   E08 命中禁用词（来源专属概念 / 审核留痕词），全字段扫描
 *   E09 落盘文件里出现 markdown 结构或元信息行（#、>、``` 等）
 *
 * WARN：
 *   W01 module 不是「资料分析」
 *   W02 node_path 的层级中文序号与 id 层号不一致（00→〇 … 08→八）
 *   W03 hooks / traps 条数偏多（> 6），语音朗读会变长
 */

/** 卡片字段顺序：落盘时按此顺序输出，保证 diff 稳定 */
const CARD_FIELDS = [
  'id',
  'module',
  'node_path',
  'title',
  'definition',
  'content',
  'hooks',
  'traps',
  'questions',
  'audio',
];

/** 九必填（audio 单独按空串约束，见 E06） */
const REQUIRED_FIELDS = [
  'id',
  'module',
  'node_path',
  'title',
  'definition',
  'content',
  'hooks',
  'traps',
  'questions',
];

/**
 * 禁用词：来源专属概念与审核留痕词，任何数据文件 / 前端可见文件都不得出现。
 * 拉丁字母按小写比对（小P → 小p），中文保持原样。
 */
const BANNED_WORDS = [
  '415',
  '假设分配',
  '笑脸公式',
  '盐水',
  '郭熙',
  '四海',
  '齐麟',
  '王炎',
  '小P',
  '粉笔',
  '楠姐',
  '花生十三',
  '降维',
  '李梦圆',
  '站长',
  '袁东',
  '珂珮',
  '十二技',
];

/** zlfx-层号-序号：层号 00~08，序号三位（001 起） */
const ID_PATTERN = /^zlfx-(0[0-8])-\d{3}$/;

/** 层号 → node_path 期望的中文序号 */
const LAYER_NUMERALS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八'];

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const norm = (s) => String(s).toLowerCase();

/**
 * 全字段文本展开（用于禁用词扫描）：数组逐项、对象逐值，避免漏扫嵌套字段。
 */
function collectText(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectText(v, out));
  } else if (isPlainObject(value)) {
    Object.values(value).forEach((v) => collectText(v, out));
  }
  return out;
}

function findBannedWords(card) {
  const hits = [];
  for (const text of collectText(card)) {
    const lower = norm(text);
    for (const word of BANNED_WORDS) {
      if (lower.includes(norm(word)) && !hits.includes(word)) hits.push(word);
    }
  }
  return hits;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((item) => typeof item === 'string' && item.trim().length > 0);
}

/**
 * 校验卡片数组。
 * @param {unknown} cards
 * @param {{ sourceLabel?: string, rawText?: string }} [options] rawText 用于 markdown 结构残留检测（仅文件级校验时传）
 * @returns {{ errors: Array<{code:string,id:string|null,detail:string}>, warnings: Array<{code:string,id:string|null,detail:string}>, stats: object }}
 */
function validateCards(cards, options = {}) {
  const errors = [];
  const warnings = [];
  const addError = (code, id, detail) => errors.push({ code, id: id || null, detail });
  const addWarn = (code, id, detail) => warnings.push({ code, id: id || null, detail });

  if (!Array.isArray(cards)) {
    addError('E01', null, '顶层必须是 JSON 数组');
    return { errors, warnings, stats: { total: 0, layers: 0, ids: 0 } };
  }

  const seen = new Set();
  const layers = new Set();

  cards.forEach((card, index) => {
    const where = `第 ${index + 1} 张`;
    if (!isPlainObject(card)) {
      addError('E03', null, `${where} 不是对象`);
      return;
    }
    const id = isNonEmptyString(card.id) ? card.id.trim() : null;

    // E02 必填字段
    for (const field of REQUIRED_FIELDS) {
      if (!(field in card)) addError('E02', id, `${where} 缺字段 ${field}`);
    }
    if (!('audio' in card)) addError('E02', id, `${where} 缺字段 audio`);

    // E07 未知字段（多出来的字段往往是素材元信息，直接拒绝）
    for (const key of Object.keys(card)) {
      if (!CARD_FIELDS.includes(key)) addError('E07', id, `${where} 出现未知字段 ${key}`);
    }

    // E03 类型 / 空值
    for (const field of ['id', 'module', 'node_path', 'title', 'definition', 'content']) {
      if (field in card && !isNonEmptyString(card[field])) {
        addError('E03', id, `${where} ${field} 必须是非空字符串`);
      }
    }
    for (const field of ['hooks', 'traps', 'questions']) {
      if (field in card && !isStringArray(card[field])) {
        addError('E03', id, `${where} ${field} 必须是非空字符串数组`);
      }
    }
    if ('hooks' in card && Array.isArray(card.hooks) && card.hooks.length === 0) {
      addError('E03', id, `${where} hooks 至少 1 条`);
    }
    if ('traps' in card && Array.isArray(card.traps) && card.traps.length === 0) {
      addError('E03', id, `${where} traps 至少 1 条`);
    }

    // E04 id 规范 + 唯一
    if (id) {
      if (!ID_PATTERN.test(id)) {
        addError('E04', id, `${where} id "${id}" 不符合 zlfx-层号-序号（例 zlfx-02-001）`);
      }
      if (seen.has(id)) addError('E04', id, `${where} id "${id}" 重复`);
      seen.add(id);

      const layerMatch = ID_PATTERN.exec(id);
      if (layerMatch && isNonEmptyString(card.node_path)) {
        const layerIndex = Number(layerMatch[1]);
        const numeral = LAYER_NUMERALS[layerIndex];
        if (card.node_path.trim().charAt(0) !== numeral) {
          addWarn('W02', id, `${where} node_path 未以「${numeral}」开头：${card.node_path}`);
        }
        layers.add(layerIndex);
      }
    }

    // E05 questions 只允许「待配题」
    if ('questions' in card) {
      if (!Array.isArray(card.questions)
        || card.questions.length !== 1
        || card.questions[0] !== '待配题') {
        addError('E05', id, `${where} questions 只允许 ["待配题"]，实际：${JSON.stringify(card.questions)}`);
      }
    }

    // E06 audio 只允许空串
    if ('audio' in card && card.audio !== '') {
      addError('E06', id, `${where} audio 只允许空串，实际：${JSON.stringify(card.audio)}`);
    }

    // E08 禁用词
    const hits = findBannedWords(card);
    if (hits.length) addError('E08', id, `${where} 命中禁用词：${hits.join('、')}`);

    // W01 / W03
    if (isNonEmptyString(card.module) && card.module.trim() !== '资料分析') {
      addWarn('W01', id, `${where} module 不是「资料分析」：${card.module}`);
    }
    if (Array.isArray(card.hooks) && card.hooks.length > 6) {
      addWarn('W03', id, `${where} hooks ${card.hooks.length} 条，语音朗读偏长`);
    }
    if (Array.isArray(card.traps) && card.traps.length > 6) {
      addWarn('W03', id, `${where} traps ${card.traps.length} 条，语音朗读偏长`);
    }
  });

  // E09 文件里混入 markdown 结构 / 元信息
  if (typeof options.rawText === 'string') {
    const raw = options.rawText.replace(/^\uFEFF/, '');
    if (/^\s*#/m.test(raw) || /^\s*>/m.test(raw) || raw.includes('```')) {
      addError('E09', null, '数据文件含 markdown 标记（# / > / ```），疑似把素材元信息一起导入');
    }
  }

  return {
    errors,
    warnings,
    stats: {
      total: cards.length,
      ids: seen.size,
      layers: layers.size,
    },
  };
}

module.exports = {
  CARD_FIELDS,
  REQUIRED_FIELDS,
  BANNED_WORDS,
  ID_PATTERN,
  LAYER_NUMERALS,
  validateCards,
  findBannedWords,
  collectText,
};
