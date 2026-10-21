# 湖北 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 生成时间：2026-10-21T11:16:52.988Z
- 源目录：`public/data/questions-v2-provincial/湖北/`（ID 前缀 `prov-hubei-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`hubei-none-<module>-<chunk>.json` → `provincial-湖北-<module>-<chunk>.json`
- 基线快照：当前线上 **320 个分片 / 38,129 题**（湖南已发布，鄂赣未发布）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除（本省无旧主观题分片）

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `hubei-none-*` 会被解析成 `hubei / none / *`，湖北分类无法命中，
> 因此 publish 必须改名为 `provincial-湖北-*`；题目 ID 保持 `prov-hubei-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-湖北-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-湖北-*` | **通过** | 15 个文件（覆盖 10 / 新增 5 / 删除 0） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 274 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入湖北 | **通过** | 0 个（旧湖北分片已全部进入替换 / 删除 / 保留清单） |
| 旧分片 ID 前缀 `prov-湖北-*` | **通过** | 817 个唯一 ID |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 274 个其他省分片，合计 37,156 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧湖北分片 | 10 | 1,774 新 / 973 旧 |
| 新增湖北分片 | 5 | 640 |
| 删除多余旧湖北分片 | 0 | 0 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 310 | 37,156 |
| 合并前线上合计 | 320 | 38,129 |
| 合并后（实际分片推演） | 325 | 39,570 |

守恒校验：

- 文件数：`320 - 10 + 15 = 325`，推演值 325 → **通过**
- 题目数：`38,129 - 973 + 2,414 = 39,570`，推演值 39,570 → **通过**
- 覆盖 / 删除 / 保留去重：旧湖北 10 个分片 = 覆盖 10 + 删除 0 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,414）

- 合并后总题数 = 当前 38,129 − 旧湖北 973 + 新湖北 **2,414** = **39,570**；推演结果 **39,570**，一致 ✅
- 源目录分片 15 个 / 题目 2,414 题；与账本定值 2,414 一致：**通过**

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧湖北分片 | 10 | 973 | 1,774 | 同名文件直接替换 |
| 新增湖北分片 | 5 | 0 | 640 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧湖北分片 | 0 | 0 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 310 | 37,156 | 37,156 | 文件与题目均保持 |

源分片合计 **15** 个 / **2,414** 道题；旧湖北分片 **10** 个 / **973** 道题（替换 973 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `hubei-none-changshi-0.json` | `provincial-湖北-changshi-0.json` | 150 | 200 | 覆盖 |
| `hubei-none-changshi-1.json` | `provincial-湖北-changshi-1.json` | 150 | 200 | 覆盖 |
| `hubei-none-changshi-2.json` | `provincial-湖北-changshi-2.json` | 31 | 55 | 覆盖 |
| `hubei-none-panduan-0.json` | `provincial-湖北-panduan-0.json` | 150 | 200 | 覆盖 |
| `hubei-none-panduan-1.json` | `provincial-湖北-panduan-1.json` | 44 | 200 | 覆盖 |
| `hubei-none-panduan-2.json` | `provincial-湖北-panduan-2.json` | — | 200 | 新增 |
| `hubei-none-panduan-3.json` | `provincial-湖北-panduan-3.json` | — | 20 | 新增 |
| `hubei-none-shuliang-0.json` | `provincial-湖北-shuliang-0.json` | 150 | 200 | 覆盖 |
| `hubei-none-shuliang-1.json` | `provincial-湖北-shuliang-1.json` | 5 | 119 | 覆盖 |
| `hubei-none-yanyu-0.json` | `provincial-湖北-yanyu-0.json` | 150 | 200 | 覆盖 |
| `hubei-none-yanyu-1.json` | `provincial-湖北-yanyu-1.json` | 23 | 200 | 覆盖 |
| `hubei-none-yanyu-2.json` | `provincial-湖北-yanyu-2.json` | — | 200 | 新增 |
| `hubei-none-yanyu-3.json` | `provincial-湖北-yanyu-3.json` | — | 50 | 新增 |
| `hubei-none-ziliao-0.json` | `provincial-湖北-ziliao-0.json` | 120 | 200 | 覆盖 |
| `hubei-none-ziliao-1.json` | `provincial-湖北-ziliao-1.json` | — | 170 | 新增 |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 38,129 | 39,570 | +1,441 |
| 分片文件数 | 320 | 325 | +5 |
| 湖北分片数 | 10 | 15 | +5 |
| 湖北题目数 | 973 | 2,414 | +1,441 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 湖北 index key 数 | 5 | 5 | 0 |
| 未触碰分片 / 题目 | 310 / 37,156 | 310 / 37,156 | 0 |
| index key 总数 | 165 | 165 | 0 |
| idMap 条目数 | 35,213 | 36,810 | +1,597 |

**影响面**：只替换 `provincial-湖北-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 35,213 | 合并前线上反查表 |
| 删除旧湖北 ID | 817 | 旧前缀 `prov-湖北-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-湖北-*`，继续留在 idMap |
| 新增新湖北 ID | 2,414 | 新前缀 `prov-hubei-*` |
| 合并后 idMap | 36,810 | 按实际分片全量重建 |

- 旧湖北 ID 仍被其他分片引用：**0**
- 新旧湖北 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧湖北 973 题对应 817 个唯一 ID（旧数据内部重复 156 条）；因此 idMap 净增 2,414 - 817 = +1,597。
- 重建方式：扫描合并后目录内全部分片，不只做湖北增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 325 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 165 个 key 精确覆盖 325 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 36,810 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧湖北 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**15/15**
- 源 `questions.json` 与分片一致：**是**（2,414 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-湖北-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 湖北旧数据（被替换 / 删除部分） | 973 | 907 | 93.2% | 29 | 0 | 53 | 13 |
| 湖北新数据（v2） | 2,414 | 2,397 | 99.3% | 220 | 0 | 14 | 3 |
| 湖北保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 39,570 | 38,134 | 96.4% | 3,379 | 22 | 1,070 | 344 |

湖北可渲染题数（被替换部分）：**907 → 2,397**（+1,490）；图片题占位：29 → 220；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：970 / 973 题在中文标点旁残留空格。
- v2 新数据：**2,110 / 2,414** 题（87.4%）在中文标点旁残留空格。
- 示例：`孔子的学生们追忆孔子日常教诲和生活行为，整理成一部语录体书，称作（ ）,这部书成为儒家的经典，
后世有很大影响。`
- 已执行 `scripts/fix-hubei-ocr-spaces.cjs --apply`（清洗选项 / 解析 / keyPoints；题干与标题按福建同款规则未清洗）。本节计数含题干/标题及换行，仅作提示。

## 6. ID 策略（A1：不迁移）

- 旧湖北 ID：`prov-湖北-*`，被替换 / 删除分片共 817 个唯一 ID，退出 idMap 817 个。
- 新湖北 ID：`prov-hubei-*`，共 2,414 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 817 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行记录（已执行）

```powershell
node scripts/publish-merge-provinces.cjs --province 湖北 --drop-uncovered          # dry-run（已执行）
node scripts/publish-merge-provinces.cjs --province 湖北 --apply --drop-uncovered  # ✅ 已写入
node scripts/verify-question-loading.cjs                                          # ✅
npm run build                                                                     # ✅
```

- `--apply` 执行顺序：删除多余旧湖北分片 → 复制 15 个新分片（映射为 `provincial-湖北-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为执行前 git HEAD `270f600`（旧分片与 `index.json` / `idMap.json` 均在版本库中）。
- 失败回滚：`git checkout HEAD -- public/data/questions/` 后重新执行 dry-run。
- 结果：apply 后 index / idMap 一致性通过，`verify-question-loading` 与 `npm run build` 均通过；commit / push 待确认。
