# 江西 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 生成时间：2026-10-21T11:17:21.496Z
- 源目录：`public/data/questions-v2-provincial/江西/`（ID 前缀 `prov-jiangxi-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`jiangxi-none-<module>-<chunk>.json` → `provincial-江西-<module>-<chunk>.json`
- 基线快照：当前线上 **325 个分片 / 39,570 题**（湘鄂已发布，赣未发布）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 6 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `jiangxi-none-*` 会被解析成 `jiangxi / none / *`，江西分类无法命中，
> 因此 publish 必须改名为 `provincial-江西-*`；题目 ID 保持 `prov-jiangxi-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-江西-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-江西-*` | **通过** | 18 个文件（覆盖 11 / 新增 6 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 277 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入江西 | **通过** | 0 个（旧江西分片已全部进入替换 / 删除 / 保留清单） |
| 旧分片 ID 前缀 `prov-江西-*` | **通过** | 1,167 个唯一 ID |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 277 个其他省分片，合计 38,220 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧江西分片 | 11 | 2,188 新 / 1,344 旧 |
| 新增江西分片 | 6 | 976 |
| 删除多余旧江西分片 | 1 | 6 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 313 | 38,220 |
| 合并前线上合计 | 325 | 39,570 |
| 合并后（实际分片推演） | 330 | 41,384 |

守恒校验：

- 文件数：`325 - 12 + 17 = 330`，推演值 330 → **通过**
- 题目数：`39,570 - 1,350 + 3,164 = 41,384`，推演值 41,384 → **通过**
- 覆盖 / 删除 / 保留去重：旧江西 12 个分片 = 覆盖 11 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 3,164）

- 合并后总题数 = 当前 39,570 − 旧江西 1,350 + 新江西 **3,164** = **41,384**；推演结果 **41,384**，一致 ✅
- 源目录分片 17 个 / 题目 3,164 题；与账本定值 3,164 一致：**通过**
- `--drop-uncovered` 已把旧主观题 6 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧江西分片 | 11 | 1,344 | 2,188 | 同名文件直接替换 |
| 新增江西分片 | 6 | 0 | 976 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧江西分片 | 1 | 6 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 313 | 38,220 | 38,220 | 文件与题目均保持 |

源分片合计 **17** 个 / **3,164** 道题；旧江西分片 **12** 个 / **1,350** 道题（替换 1,350 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `jiangxi-none-changshi-0.json` | `provincial-江西-changshi-0.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-changshi-1.json` | `provincial-江西-changshi-1.json` | 126 | 200 | 覆盖 |
| `jiangxi-none-changshi-2.json` | `provincial-江西-changshi-2.json` | — | 166 | 新增 |
| `jiangxi-none-panduan-0.json` | `provincial-江西-panduan-0.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-panduan-1.json` | `provincial-江西-panduan-1.json` | 104 | 200 | 覆盖 |
| `jiangxi-none-panduan-2.json` | `provincial-江西-panduan-2.json` | — | 200 | 新增 |
| `jiangxi-none-panduan-3.json` | `provincial-江西-panduan-3.json` | — | 170 | 新增 |
| `jiangxi-none-shuliang-0.json` | `provincial-江西-shuliang-0.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-shuliang-1.json` | `provincial-江西-shuliang-1.json` | 52 | 188 | 覆盖 |
| `jiangxi-none-yanyu-0.json` | `provincial-江西-yanyu-0.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-yanyu-1.json` | `provincial-江西-yanyu-1.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-yanyu-2.json` | `provincial-江西-yanyu-2.json` | 21 | 200 | 覆盖 |
| `jiangxi-none-yanyu-3.json` | `provincial-江西-yanyu-3.json` | — | 200 | 新增 |
| `jiangxi-none-yanyu-4.json` | `provincial-江西-yanyu-4.json` | — | 140 | 新增 |
| `jiangxi-none-ziliao-0.json` | `provincial-江西-ziliao-0.json` | 150 | 200 | 覆盖 |
| `jiangxi-none-ziliao-1.json` | `provincial-江西-ziliao-1.json` | 141 | 200 | 覆盖 |
| `jiangxi-none-ziliao-2.json` | `provincial-江西-ziliao-2.json` | — | 100 | 新增 |

### 1.2 待删除的多余旧江西分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-江西-shenlun-0.json` | 6 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 39,570 | 41,384 | +1,814 |
| 分片文件数 | 325 | 330 | +5 |
| 江西分片数 | 12 | 17 | +5 |
| 江西题目数 | 1,350 | 3,164 | +1,814 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 江西 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 313 / 38,220 | 313 / 38,220 | 0 |
| index key 总数 | 165 | 164 | -1 |
| idMap 条目数 | 36,810 | 38,807 | +1,997 |

**影响面**：只替换 `provincial-江西-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 36,810 | 合并前线上反查表 |
| 删除旧江西 ID | 1,167 | 旧前缀 `prov-江西-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-江西-*`，继续留在 idMap |
| 新增新江西 ID | 3,164 | 新前缀 `prov-jiangxi-*` |
| 合并后 idMap | 38,807 | 按实际分片全量重建 |

- 旧江西 ID 仍被其他分片引用：**0**
- 新旧江西 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧江西 1,350 题对应 1,167 个唯一 ID（旧数据内部重复 183 条）；因此 idMap 净增 3,164 - 1,167 = +1,997。
- 重建方式：扫描合并后目录内全部分片，不只做江西增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 330 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 164 个 key 精确覆盖 330 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 38,807 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧江西 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**17/17**
- 源 `questions.json` 与分片一致：**是**（3,164 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-江西-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 江西旧数据（被替换 / 删除部分） | 1,350 | 1,158 | 85.8% | 66 | 0 | 160 | 32 |
| 江西新数据（v2） | 3,164 | 3,117 | 98.5% | 249 | 0 | 43 | 4 |
| 江西保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 41,384 | 40,093 | 96.9% | 3,562 | 22 | 953 | 316 |

江西可渲染题数（被替换部分）：**1,158 → 3,117**（+1,959）；图片题占位：66 → 249；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：1,346 / 1,350 题在中文标点旁残留空格。
- v2 新数据：**2,596 / 3,164** 题（82.0%）在中文标点旁残留空格。
- 示例：`2005年10月11日中国共产党第十六届中央委员会第五次全体会议通过的《中共中央关于制定国民经济和社会 发展第十一个五年规划的建议》 ，延续了50多年的国民经济`
- 已执行 `scripts/fix-jiangxi-ocr-spaces.cjs --apply`（清洗选项 / 解析 / keyPoints；题干与标题按福建同款规则未清洗）。本节计数含题干/标题及换行，仅作提示。

## 6. ID 策略（A1：不迁移）

- 旧江西 ID：`prov-江西-*`，被替换 / 删除分片共 1,167 个唯一 ID，退出 idMap 1,167 个。
- 新江西 ID：`prov-jiangxi-*`，共 3,164 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 1,167 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行记录（已执行）

```powershell
node scripts/publish-merge-provinces.cjs --province 江西 --drop-uncovered          # dry-run（已执行）
node scripts/publish-merge-provinces.cjs --province 江西 --apply --drop-uncovered  # ✅ 已写入
node scripts/verify-question-loading.cjs                                          # ✅
npm run build                                                                     # ✅
```

- `--apply` 执行顺序：删除多余旧江西分片 → 复制 17 个新分片（映射为 `provincial-江西-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为执行前 git HEAD `270f600`（旧分片与 `index.json` / `idMap.json` 均在版本库中）。
- 失败回滚：`git checkout HEAD -- public/data/questions/` 后重新执行 dry-run。
- 结果：apply 后 index / idMap 一致性通过，`verify-question-loading` 与 `npm run build` 均通过；commit / push 待确认。
