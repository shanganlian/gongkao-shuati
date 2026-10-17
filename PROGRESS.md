# 项目进度总结

> 更新时间：2026-10-17

## 0. 题库数据治理（2026-10-17）

### 0.1 笔试专区空白问题 —— 已解决

**根因**：`useQuestions` 中 `o[r][0]` 只加载了匹配分类的**首个分片**，导致 1,427 个跨分片 ID 的题目大量丢失，页面渲染为空。

**修复**：改为加载匹配分类的**全部分片**并渐进加载（`src/hooks/useQuestions.ts`）。

### 0.2 渲染防护 —— 已上线

- `src/lib/questionValidation.ts`：题干为空 / 选项为空 / 选项不足 2 项 → 跳过该题
- `src/components/QuestionErrorBoundary.tsx`：单题渲染崩溃不影响整页
- `PracticeArena.tsx` 所有题目列表（专项刷题 / 试卷 / 错题本）均已包裹错误边界 + 数据校验

### 0.3 脏数据修复记录

| 批次 | 问题 | 处理 | 结果 |
|---|---|---|---|
| 1 | 空 stem | 扫描 → `empty_stem.csv` | 38 道，title 仅为截断摘要无法重建，记入 `repair_failed.csv` |
| 2 | 缺选项 | 从 stem 末尾拆分重建 | 36 道修复；1,180 道图形题标记 `isImageQuestion`（前端显示占位提示） |
| 3 | **stem 末尾粘 A 选项** | 截出 A 重建 options | **238 道 REPAIR + 22 道 CLEAN**，197 道进人工清单 |

**批次 3 详情**（`scripts/fix-stem-trailing-option.cjs`）：
- `[REPAIR]` options 缺 A + stem 末尾有 A 标记 → 截出尾部作为 A 选项插到最前，stem 保留干净题干
- `[CLEAN]` options 已含 A + stem 末尾有重复 A 标记 → 只清理 stem 尾部
- `[MANUAL]` 进 `stem_trailing_option_manual.csv`，不改数据

**边界防护**（任一命中即判 MANUAL，避免误切）：
1. 尾部 ≥ 100 字（多为 "A、B 两地" 这类正常引用）
2. 尾部为空
3. 尾部含后续选项标记（B、/C、/D、）→ 多题合并
4. 尾部含题号 → 多题合并
5. options key 重复（如 `[CDABCDABC]`）→ 多题合并
6. 截断后题干为空
7. **截断后题干以连接词结尾**（的/是/为/在/和/与/、/，）→ A 是句中成分
8. **截断后题干无句末标点**（：/？/。/！/；）→ 语义不完整

> 防护 7、8 是二次 dry-run 时新增的：首次 dry-run 误判了 `real-2020-副省级-111`（"坐在同一排的 A、B、C、D、F 五个座位"，A 是座位名），加防护后 CLEAN 从 92 降到 22。

### 0.4 数据层验证结果

`node scripts/verify-question-loading.cjs`

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 可渲染题目 | 21,537 | **22,771** |
| 被校验跳过 | 2,226 | **992** |
| 跳过率 | 9.37% | **4.18%** |

各模块有效题数：常识 6,460 / 言语 5,816 / 判断 5,378 / 数量 2,526 / 资料 2,471 / 申论 119。

### 0.5 题库导入校验器 —— 新增

`node scripts/validate-questions.cjs [--strict] [--limit N]`

> 注意：项目 `package.json` 为 `"type": "module"`，故脚本用 `.cjs` 扩展名。

| 规则 | 说明 |
|---|---|
| E01 | 题干为空 |
| E02 | 客观题缺少选项（图片题除外） |
| E03 | 选项文本为空 |
| E04 | 选项 key 重复（多题合并） |
| E05 | 选项 key 非标准序列（无重复时才报，避免与 E04 重复计数） |
| E06 | 答案不在选项范围 |
| **E07** | **stem 含选项标记**（选项被粘进题干） |
| W01~W06 | 题干过短 / 缺解析 / 缺 thinkingTip / 题干含题号 / 题干过长 / 图片题未标记 |

当前基线：22,492 道（去重后），ERROR 2,086 / WARN 21,394。明细见 `validate-questions-report.csv`。

### 0.6 遗留问题

- **992 道题仍被前端跳过**：题干为空 38 道 + 选项文本为空/数量不足等，均为源数据缺失，需重新采集。
- **197 道 stem 粘 A 选项进人工清单**：多为多题合并（选项数组如 `[BCDABCDACDABCDABDAC]`）或正常引用，需人工拆分。
- **825 道选项 key 重复**：多题合并，需重新切分原始试卷。

### 0.7 多题合并脏数据治理（本轮）

**问题**：题库分片中存在「多题合并」脏数据——一道题的 options 里塞了多道题的选项
（如 `[A,A,A,A]`、`[CDABCDABC]`），导致选项重复、题干串题，前端渲染混乱。

**处理策略**：不尝试自动拆分（拆分风险高、易产生错误答案），改为**标记 + 占位**。

| 步骤 | 脚本 / 文件 | 结果 |
|---|---|---|
| 扫描识别 | `scripts/scan-abnormal-merged.cjs` | 命中 **933 道**（省考 765 / 国考 168） |
| 写入标记 | `scripts/mark-abnormal-merged.cjs --apply` | 933 道写入 `isAbnormal: true`，涉及 200 个分片 |
| 前端校验 | `src/lib/questionValidation.ts` | 新增 `isMergedAbnormal` 等 8 个校验函数 |
| 占位组件 | `src/components/AbnormalQuestionPlaceholder.tsx` | 「本题数据整理中」卡片（完整/紧凑两态） |
| 渲染接入 | `src/components/PracticeArena.tsx` | 试卷 / 专项刷题 / 错题本 三处接入 |

**判定信号**（脚本与前端完全一致）：
- a. options 存在重复 key
- b. stem 或任一 option.text 含题号串 `/[0-9]{1,3}、[\u4e00-\u9fa5]/`
- c. stem + options 总长 > 500（**仅作 a/b 的佐证，单独命中不标记**，避免资料分析长题干误伤）

**按模块分布**：常识 365 / 言语 206 / 判断 176 / 资料 110 / 数量 76

**口径注意**：`scan-abnormal-merged.cjs` 与 `mark-abnormal-merged.cjs` 均按**分片文件**去重，
不按题目 id 去重（同一题可能被多个分类 key 引用）。早期扫描脚本按 id 去重导致少计 77 道（856 vs 933），已修正。

**回滚**：`node scripts/mark-abnormal-merged.cjs --clear --apply`

### 0.8 分片加载修复验证

`node scripts/verify-question-loading.cjs` 确认各分类均加载**全部分片**
（如 `national-none-changshi` 7 个分片、`provincial-浙江-changshi` 4 个分片），
新逻辑（全部分片）可找到 **1,427 道**，旧逻辑（仅首分片）远少于此。

### 0.9 本轮验证

- `node node_modules/typescript/bin/tsc --noEmit` → 无错误
- `npm run dev` → `http://localhost:3002`，HTTP 200
- 笔试专区专项刷题 / 试卷 / 错题本三处均正常渲染，异常题显示「本题数据整理中」占位

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
