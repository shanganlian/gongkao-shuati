# 项目进度总结

> 更新时间：2026-10-12

## 1. 已完成的功能

- **前端完整实现**：行岸公考刷题平台（React + Vite + TypeScript + Supabase），包含笔试专区、面试专区、学情总览、全局成长、备考社区等模块。
- **Git 仓库**：已初始化并提交全部代码（50 个文件）。
- **GitHub 仓库**：公开仓库 `shanganlian/gongkao-shuati` 已创建并推送。
- **Netlify 部署**：已成功上线并自动部署，线上地址：https://elaborate-faloodeh-f2ba0e.netlify.app
- **构建链路修复**：添加了 `netlify.toml`（构建命令 & 发布目录）、`.nvmrc`（Node 20）、`.npmrc`（legacy-peer-deps），并放宽了 `tsconfig.json` 严格检查。

## 2. 正在进行、尚未完成的改动

- **AI 功能**：依赖 `server.ts`（Express 后端），纯静态部署后不可用，尚未改造为 Netlify Serverless Functions，也未配置 `GEMINI_API_KEY` 环境变量。
- **数据库迁移**：`supabase/migrations/create_knowledge_progress.sql`（知识点掌握进度表 + RLS）尚未应用到远程 Supabase。

## 3. 下一个任务从哪里继续

- **若继续做数据库**：先调用 `supabase_get_project` 确认连接，再用 `supabase_apply_migration` 应用 `create_knowledge_progress.sql`。
- **若继续做 AI**：在 Netlify 配置 `GEMINI_API_KEY` 环境变量，并将 `server.ts` 改造为 Netlify Serverless Functions。
- 日常开发推送至 GitHub `main` 分支后，Netlify 会自动构建部署。
