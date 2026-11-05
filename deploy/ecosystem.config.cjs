/**
 * pm2 配置：由 02-release.sh 复制到 release 根目录后启动。
 * - cwd 即 release 根目录（server.ts / dist / node_modules 都在这里）
 * - tsx 已放在 dependencies，npm ci --omit=dev 后仍可用
 * - 密钥只从 /etc/bideti/bideti.env 读取，不写进仓库
 */
const path = require('path');
const dotenv = require('dotenv');

const envFile = process.env.BIDETI_ENV_FILE || '/etc/bideti/bideti.env';
const loaded = dotenv.config({ path: envFile, quiet: true });
if (loaded.error) {
  console.warn(`[pm2] 无法读取 ${envFile}: ${loaded.error.message}`);
}

const env = {
  NODE_ENV: 'production',
  PORT: process.env.PORT || '3002',
};

// 只透传需要的键，避免把无关环境变量写进 pm2 dump
for (const key of [
  'DEEPSEEK_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'GEMINI_API_KEY',
  // QQ 互联登录：默认关闭，只有 QQ_LOGIN_ENABLED=1 且 appid/appkey 齐全时服务端才放行 /api/auth/qq/*
  'QQ_LOGIN_ENABLED',
  'QQ_APP_ID',
  'QQ_APP_KEY',
  'QQ_REDIRECT_URI',
]) {
  if (process.env[key]) {
    env[key] = process.env[key];
  }
}

module.exports = {
  apps: [
    {
      name: 'bideti',
      cwd: __dirname,
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'server.ts',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 5000,
      time: true,
      merge_logs: true,
      out_file: '/var/log/bideti/out.log',
      error_file: '/var/log/bideti/error.log',
      env,
    },
  ],
};
