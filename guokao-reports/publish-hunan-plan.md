# 湖南 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 生成时间：2026-10-21T11:16:22.462Z
- 源目录：`public/data/questions-v2-provincial/湖南/`（ID 前缀 `prov-hunan-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`hunan-none-<module>-<chunk>.json` → `provincial-湖南-<module>-<chunk>.json`
- 基线快照：当前线上 **315 个分片 / 36,670 题**（三省均未发布）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 5 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `hunan-none-*` 会被解析成 `hunan / none / *`，湖南分类无法命中，
> 因此 publish 必须改名为 `provincial-湖南-*`；题目 ID 保持 `prov-hunan-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-湖南-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-湖南-*` | **通过** | 15 个文件（覆盖 8 / 新增 6 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 270 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入湖南 | **通过** | 0 个（旧湖南分片已全部进入替换 / 删除 / 保留清单） |
| 旧分片 ID 前缀 `prov-湖南-*` | **通过** | 761 个唯一 ID |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 270 个其他省分片，合计 35,890 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧湖南分片 | 8 | 1,565 新 / 775 旧 |
| 新增湖南分片 | 6 | 674 |
| 删除多余旧湖南分片 | 1 | 5 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 306 | 35,890 |
| 合并前线上合计 | 315 | 36,670 |
| 合并后（实际分片推演） | 320 | 38,129 |

守恒校验：

- 文件数：`315 - 9 + 14 = 320`，推演值 320 → **通过**
- 题目数：`36,670 - 780 + 2,239 = 38,129`，推演值 38,129 → **通过**
- 覆盖 / 删除 / 保留去重：旧湖南 9 个分片 = 覆盖 8 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,239）

- 合并后总题数 = 当前 36,670 − 旧湖南 780 + 新湖南 **2,239** = **38,129**；推演结果 **38,129**，一致 ✅
- 源目录分片 14 个 / 题目 2,239 题；与账本定值 2,239 一致：**通过**
- `--drop-uncovered` 已把旧主观题 5 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧湖南分片 | 8 | 775 | 1,565 | 同名文件直接替换 |
| 新增湖南分片 | 6 | 0 | 674 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧湖南分片 | 1 | 5 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 306 | 35,890 | 35,890 | 文件与题目均保持 |

源分片合计 **14** 个 / **2,239** 道题；旧湖南分片 **9** 个 / **780** 道题（替换 780 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `hunan-none-changshi-0.json` | `provincial-湖南-changshi-0.json` | 150 | 200 | 覆盖 |
| `hunan-none-changshi-1.json` | `provincial-湖南-changshi-1.json` | 112 | 165 | 覆盖 |
| `hunan-none-panduan-0.json` | `provincial-湖南-panduan-0.json` | 150 | 200 | 覆盖 |
| `hunan-none-panduan-1.json` | `provincial-湖南-panduan-1.json` | 49 | 200 | 覆盖 |
| `hunan-none-panduan-2.json` | `provincial-湖南-panduan-2.json` | — | 200 | 新增 |
| `hunan-none-panduan-3.json` | `provincial-湖南-panduan-3.json` | — | 41 | 新增 |
| `hunan-none-shuliang-0.json` | `provincial-湖南-shuliang-0.json` | 39 | 200 | 覆盖 |
| `hunan-none-shuliang-1.json` | `provincial-湖南-shuliang-1.json` | — | 19 | 新增 |
| `hunan-none-yanyu-0.json` | `provincial-湖南-yanyu-0.json` | 150 | 200 | 覆盖 |
| `hunan-none-yanyu-1.json` | `provincial-湖南-yanyu-1.json` | 44 | 200 | 覆盖 |
| `hunan-none-yanyu-2.json` | `provincial-湖南-yanyu-2.json` | — | 200 | 新增 |
| `hunan-none-yanyu-3.json` | `provincial-湖南-yanyu-3.json` | — | 84 | 新增 |
| `hunan-none-ziliao-0.json` | `provincial-湖南-ziliao-0.json` | 81 | 200 | 覆盖 |
| `hunan-none-ziliao-1.json` | `provincial-湖南-ziliao-1.json` | — | 130 | 新增 |

### 1.2 待删除的多余旧湖南分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-湖南-shenlun-0.json` | 5 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 36,670 | 38,129 | +1,459 |
| 分片文件数 | 315 | 320 | +5 |
| 湖南分片数 | 9 | 14 | +5 |
| 湖南题目数 | 780 | 2,239 | +1,459 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 湖南 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 306 / 35,890 | 306 / 35,890 | 0 |
| index key 总数 | 166 | 165 | -1 |
| idMap 条目数 | 33,735 | 35,213 | +1,478 |

**影响面**：只替换 `provincial-湖南-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 33,735 | 合并前线上反查表 |
| 删除旧湖南 ID | 761 | 旧前缀 `prov-湖南-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-湖南-*`，继续留在 idMap |
| 新增新湖南 ID | 2,239 | 新前缀 `prov-hunan-*` |
| 合并后 idMap | 35,213 | 按实际分片全量重建 |

- 旧湖南 ID 仍被其他分片引用：**0**
- 新旧湖南 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧湖南 780 题对应 761 个唯一 ID（旧数据内部重复 19 条）；因此 idMap 净增 2,239 - 761 = +1,478。
- 重建方式：扫描合并后目录内全部分片，不只做湖南增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 320 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 165 个 key 精确覆盖 320 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 35,213 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧湖南 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**14/14**
- 源 `questions.json` 与分片一致：**是**（2,239 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-湖南-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 湖南旧数据（被替换 / 删除部分） | 780 | 768 | 98.5% | 45 | 0 | 7 | 5 |
| 湖南新数据（v2） | 2,239 | 2,214 | 98.9% | 207 | 0 | 22 | 3 |
| 湖南保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 38,129 | 36,644 | 96.1% | 3,188 | 22 | 1,109 | 354 |

湖南可渲染题数（被替换部分）：**768 → 2,214**（+1,446）；图片题占位：45 → 207；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：775 / 780 题在中文标点旁残留空格。
- v2 新数据：**1,998 / 2,239** 题（89.2%）在中文标点旁残留空格。
- 示例：`行政行为在空间上的表现形式和在时间上的跨度，包括行政行为方式、步骤、次序、时限等。其中不 可分割的内容的是：`
- 已执行 `scripts/fix-hunan-ocr-spaces.cjs --apply`（清洗选项 / 解析 / keyPoints；题干与标题按福建同款规则未清洗）。本节计数含题干/标题及换行，仅作提示。

## 6. ID 策略（A1：不迁移）

- 旧湖南 ID：`prov-湖南-*`，被替换 / 删除分片共 761 个唯一 ID，退出 idMap 761 个。
- 新湖南 ID：`prov-hunan-*`，共 2,239 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 761 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行记录（已执行）

```powershell
node scripts/publish-merge-provinces.cjs --province 湖南 --drop-uncovered          # dry-run（已执行）
node scripts/publish-merge-provinces.cjs --province 湖南 --apply --drop-uncovered  # ✅ 已写入
node scripts/verify-question-loading.cjs                                          # ✅
npm run build                                                                     # ✅
```

- `--apply` 执行顺序：删除多余旧湖南分片 → 复制 14 个新分片（映射为 `provincial-湖南-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为执行前 git HEAD `270f600`（旧分片与 `index.json` / `idMap.json` 均在版本库中）。
- 失败回滚：`git checkout HEAD -- public/data/questions/` 后重新执行 dry-run。
- 结果：apply 后 index / idMap 一致性通过，`verify-question-loading` 与 `npm run build` 均通过；commit / push 待确认。
