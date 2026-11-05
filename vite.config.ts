import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // SKIP_PUBLIC_COPY=1：只构建前端（dist 不拷贝 public/data 题库），
  // 供 deploy/release-frontend.ps1 做“仅更新 UI”的快速发布。
  const publicDir: string | false = process.env.SKIP_PUBLIC_COPY === '1' ? false : 'public';
  return {
    plugins: [react(), tailwindcss()],
    publicDir,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
