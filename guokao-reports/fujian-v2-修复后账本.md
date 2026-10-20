# 福建 v2 修复后账本

- 模式：**APPLIED（已写入隔离区）**
- 生成时间：2026-10-19T11:36:56.309Z
- 数据目录：`public/data/questions-v2-provincial/福建/`

## 1. 总量

| 指标 | 数值 |
|---|---:|
| 记录总数 | 2564 |
| 唯一 ID | 2564 |
| 答案覆盖 | 2489/2564（97.1%） |
| 解析覆盖 | 2493/2564（97.2%） |
| 模块分布 | changshi:455 / panduan:724 / shuliang:242 / yanyu:803 / ziliao:340 |

## 2. 本次重转卷

| 卷别 | 题数 | 答案 | 解析 | 模块分布 |
|---|---:|---:|---:|---|
| 2010 福建春季 | 120 | 118 | 118 | changshi:35 / yanyu:25 / panduan:45 / ziliao:15 |
| 2011 424 联考 | 120 | 118 | 118 | yanyu:40 / shuliang:10 / panduan:30 / changshi:20 / ziliao:20 |
| 2011 917 联考 | 120 | 119 | 119 | changshi:20 / yanyu:35 / shuliang:10 / panduan:40 / ziliao:15 |
| 2012 421 联考 | 120 | 100 | 101 | changshi:20 / yanyu:45 / panduan:35 / ziliao:20 |
| 2012 915 联考 | 120 | 120 | 120 | changshi:20 / yanyu:40 / shuliang:10 / panduan:35 / ziliao:15 |

## 3. 修复前后变化

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 记录总数 | 2564 | 2564 |
| 唯一 ID | 2324 | 2564 |
| 重复 ID 组 | 240 | 0 |
| 2010 春季 Q36-Q60 言语题 | 0/25 | 25/25 |
| 2011 917 常识 Q1-Q20 | 20/20（解析串 424） | 20/20（解析归位） |

## 4. 写入后清理

- 首次写入时审计脚本的内部字段 `__file` 被带入 1,964 条保留记录；已用 `scripts/clean-fujian-v2-internal.cjs --apply` 清除。
- 复验：16 个分片 + `questions.json` 中 `__file` 残留 **0**；仍为 2,564 题 / 2,564 唯一 ID。
- 记录：`guokao-reports/fujian-v2-内部字段清理.txt`。

## 5. 结论

- 福建 v2 重复 ID 已清零；2011 两套联考可按 `424联考 / 917联考`、2012 两套可按 `421联考 / 915联考` 独立加载。
- 2010 春季 Q36-Q60 已迁回言语模块。
- 本次福建修复未写线上题库；线上 `public/data/questions/` 仅有浙江 apply 变更。如需上线福建，需另走 publish-merge 流程。

## 6. 文本层空格清洗（2026-10-20，已 apply）

- 脚本：`scripts/fix-fujian-ocr-spaces.cjs`（默认 dry-run；`--apply` 写入并备份）。
- 模式：**APPLIED**；写入前备份 `guokao-reports/backup-fujian-v2-spaces-2026-10-20T11-32-22-388Z`。
- 范围：16 个分片 + `questions.json`；不改 `stem` / `title` / `answer` / `module` / `id`，不动线上目录。

| 指标 | 数量 |
|---|---:|
| 记录总数 | 2,564 |
| 有任意变更的记录 | 2,496（97.3%） |
| 选项文本变更 | 2,050 处 / 764 题 |
| 解析变更 | 2,463 条 |
| keyPoints 变更 | 1,250 条 |
| 删除模板残句 | 430 项 |
| keyPoints 整组残句→首句回填 / 置空 | 53 / 119 条 |
| 空白不变式校验 | 4,513 处，失败 0 |

残留空格：**32,448 → 1,046**（涉及记录 2,487 → 132），剩余仅为并列项 / 表格 / 英文词组内部空格。

- 逻辑行保留规则：一行内「汉字—空白—汉字」≥ 2 处、空格切分后每段 ≤ 8 字且段数 ≥ 3，判为并列项保留；表格行（`|` 开头或含制表符）只做引号 / 标点类清洗。
- keyPoints：删除 `故正确答案为X` / `正确答案是：X` / `本题相关知识点：` / `本题为选非题…` 等模板残句；`本题考查…` 作为考点标签**保留**。
- 写后自检：2,564 题、分片与 `questions.json` 一致、二次运行零变更（幂等）、index 自检通过。
- 报告 / 明细：`guokao-reports/fujian-v2-空格清洗.md`、`guokao-reports/fujian-v2-空格清洗对照.csv`。

## 7. 清洗后回归校验（2026-10-20）

| 校验 | 命令 | 结果 |
|---|---|---|
| 定向修复回归（含 Q40 去空白比对） | `node scripts/verify-fujian-repair.cjs` | ✅ 全部通过（`fujian-v2-修复校验.md`） |
| 福建 v2 独立校验 | `node scripts/verify-fujian-v2.cjs` | ✅ 16 分片 / 2,564 题 / index 5 keys / 唯一 ID 2,564 / 重复组 0 |
| 福建导入校验（清洗前） | `validate-questions.cjs --dir <备份副本>` | ERROR 25 / WARN 192 |
| 福建导入校验（清洗后） | `validate-questions.cjs --dir .../福建` | ERROR 25 / WARN 192（**与清洗前一致**） |
| 全库导入校验 | `node scripts/validate-questions.cjs` | 30,009 题；ERROR 1,970 / WARN 20,811（线上数据未动） |
| 数据层加载校验 | `node scripts/verify-question-loading.cjs` | 31,262 题；可渲染 30,271；跳过 991；跳过率 3.170%；1,408 个多分片 ID 全部可找到 |

福建 ERROR 25 构成（清洗前后不变）：E02 缺少选项 17、E03 选项文本为空 2、E07 题干含选项标记 6；均为源数据缺失 / 多题合并遗留，需回源处理。

结论：空格清洗只改文本层，未改变结构校验结果、题量、唯一 ID 或线上题库。

## 8. publish 合并（2026-10-20，dry-run + apply）

脚本 `scripts/publish-merge-fujian.cjs`（`npm run publish:fj:dry` / `publish:fj:apply`），报告 `guokao-reports/publish-fujian-plan.md`。

### 8.1 dry-run 对账（通过）

| 项目 | 数值 |
|---|---:|
| 源分片 / 题目 | 16 / 2,564 |
| 旧福建分片 / 题目 | 8 / 712（636 个唯一 ID） |
| 覆盖 / 新增 / 删除 | 8（712→1,600）/ 8（964）/ 0 |
| 未触碰（国考 35 + 其他省 255） | 291 分片 / 32,381 题 |
| 合并后 | 307 分片 / 34,945 题 / index 167 keys / idMap 31,937 |

- 越界检查：16 个变更文件全部命中 `provincial-福建-*`；国考 / 其他省 0 改动；无重复变更项。
- 增减对账：`299 − 8 + 16 = 307` ✅；`33,093 − 712 + 2,564 = 34,945` ✅。
- 一致性：index 引用 / index 精确覆盖 / idMap 覆盖全部 ID，三项通过；新分片重复 ID 0、跨省冲突 0、新旧福建 ID 交集 0。
- 可渲染：福建 `633 / 712 → 2,545 / 2,564`（99.3%）；全库 `33,482 / 34,945`。
- 结论：dry-run 无阻塞项，用户确认后执行 `--apply`。

### 8.2 apply 结果（已写入线上目录）

- 2026-10-20 执行 `npm run publish:fj:apply`：写入 16 个 `provincial-福建-*` 分片，重建 `index.json` / `idMap.json`；报告模式为 **APPLIED（已写入）**。
- 重新读盘复核：307 分片 / 34,945 题 / index 167 keys / idMap 31,937；福建 16 分片 / 2,564 题（旧 8 分片 712 题全部被覆盖，新增 8 个分片）。
- 三项对账复跑通过：变更 16 个文件全部命中 `provincial-福建-*`；`299 − 8 + 16 = 307`；`33,093 − 712 + 2,564 = 34,945`；index / idMap / 新分片 ID 一致性 OK。
- `verify-question-loading`：全库 33,160 题 / 可渲染 32,189 / 跳过 971（2.928%）；福建 5 个 key 合计 2,564 题 / 可渲染 2,545；多分片 ID 1,372 条新旧逻辑均可定位。
- 全库 `validate-questions`：31,937 题 / ERROR 1,935 / WARN 20,335（apply 前 30,009 / 1,970 / 20,811；旧福建 712 题换成新 2,564 题后 ERROR 净减 35，剩余 25 条为福建源数据既有 E02/E03/E07）。
- `npm run build`：exit 0，1,728 模块 / 1.51s，产物 `dist/index.html`、`dist/assets/index-BzQeNVa-.js`（569.97 kB）。
- 回滚：apply 前的线上状态在 HEAD（`2ddc7b3`），`git checkout -- public/data/questions` 可连同 index / idMap 一并回退。

