/**
 * 服务端功能开关（默认全关）。
 *
 * 约定：没做完/没审核通过的功能，必须在这里有开关，并且默认关闭；
 * 这样「发布当前工作区」时不会把半成品带上线。
 */

/** 环境变量里视为「开」的写法 */
const TRUTHY = new Set(['1', 'true', 'on', 'yes']);

function readFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = (env[key] || '').trim().toLowerCase();
  return TRUTHY.has(raw);
}

/**
 * QQ 登录是否开启。
 *
 * 必须同时满足三个条件，缺一不可：
 * 1. `QQ_LOGIN_ENABLED` 为 1/true/on/yes；
 * 2. `QQ_APP_ID` 与 `QQ_APP_KEY` 都已配置（QQ 互联应用审核通过后才拿得到）。
 *
 * 未开启时 `server.ts` / `netlify/functions/api.ts` 会让 `/api/auth/qq/*` 一律返回 404，
 * 前端登录弹窗也不渲染 QQ 按钮（`src/lib/featureFlags.ts` 读同一个开关的构建期版本）。
 */
export function isQqLoginEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!readFlag(env, 'QQ_LOGIN_ENABLED')) return false;
  return Boolean((env.QQ_APP_ID || '').trim() && (env.QQ_APP_KEY || '').trim());
}
