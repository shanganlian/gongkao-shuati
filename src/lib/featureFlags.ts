/**
 * 前端功能开关（构建期注入，默认全关）。
 *
 * 前端开关只能来自构建期环境变量，所以新增可见入口时，必须在下面加一个默认 false 的常量，
 * 并在渲染处用它做判断 —— 这样发布出来的站点不会出现「写了但没上线」的入口。
 */

function readFlag(value: string | undefined): boolean {
  const raw = (value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * QQ 登录入口是否渲染。
 *
 * 需要在构建时设置 `VITE_QQ_LOGIN_ENABLED=1`（本地 `.env` / 服务器发布环境）才会为 true；
 * 默认 false，`AuthModal` 等登录入口不得渲染任何 QQ 按钮，也不要请求 `/api/auth/qq/*`。
 * 服务端对应开关是 `QQ_LOGIN_ENABLED`（见 shared/feature-flags.ts），两边必须同时打开。
 */
export const qqLoginEnabled: boolean = readFlag(import.meta.env.VITE_QQ_LOGIN_ENABLED);

/**
 * 知识点体系通关（知识卡片）入口是否渲染。
 *
 * 构建期 `VITE_KNOWLEDGE_MODULE_ENABLED=1` 打开；默认 false，笔试专区的
 * 「知识点体系通关」入口与卡片浏览页都不渲染，线上不会出现未验收的半成品页面。
 * 本地验证：在 `.env.local` 写 `VITE_KNOWLEDGE_MODULE_ENABLED=1` 后重启 `npm run dev`。
 */
export const KNOWLEDGE_MODULE_ENABLED: boolean = readFlag(import.meta.env.VITE_KNOWLEDGE_MODULE_ENABLED);

