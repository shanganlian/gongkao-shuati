import { supabase } from './supabase';

/**
 * 带 Supabase 登录态的服务端请求。
 * 服务端 AI/TTS 接口已加 Bearer 鉴权，未登录时返回 401，
 * 调用方需保留本地兜底逻辑（本地评分 / 浏览器朗读 / 本地计划模板）。
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch (e) {
    /* 读取会话失败时按未登录处理 */
  }

  const headers = new Headers(init.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
