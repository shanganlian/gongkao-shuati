# 辽宁 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T13:55:42.792Z
- 源目录：`public/data/questions-v2-provincial/辽宁/`（ID 前缀 `prov-liaoning-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`liaoning-none-<module>-<chunk>.json` → `provincial-辽宁-<module>-<chunk>.json`
- 基线快照：当前线上 **510 个分片 / 83,653 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 8 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `liaoning-none-*` 会被解析成 `liaoning / none / *`，辽宁分类无法命中，
> 因此 publish 必须改名为 `provincial-辽宁-*`；题目 ID 保持 `prov-liaoning-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-辽宁-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-辽宁-*` | **通过** | 16 个文件（覆盖 8 / 新增 7 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 465 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入辽宁 | **通过** | 0 个（旧辽宁分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-辽宁-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 465 个其他省分片，合计 82,818 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧辽宁分片 | 8 | 1,425 新 / 827 旧 |
| 新增辽宁分片 | 7 | 1,019 |
| 删除多余旧辽宁分片 | 1 | 8 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 501 | 82,818 |
| 合并前线上合计 | 510 | 83,653 |
| 合并后（实际分片推演） | 516 | 85,262 |

守恒校验：

- 文件数：`510 - 9 + 15 = 516`，推演值 516 → **通过**
- 题目数：`83,653 - 835 + 2,444 = 85,262`，推演值 85,262 → **通过**
- 覆盖 / 删除 / 保留去重：旧辽宁 9 个分片 = 覆盖 8 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,444）

- 合并后总题数 = 当前 83,653 − 旧辽宁 835 + 新辽宁 **2,444** = **85,262**；推演结果 **85,262**，一致 ✅
- 源目录分片 15 个 / 题目 2,444 题；与账本定值 2,444 一致：**通过**
- `--drop-uncovered` 已把旧主观题 8 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧辽宁分片 | 8 | 827 | 1,425 | 同名文件直接替换 |
| 新增辽宁分片 | 7 | 0 | 1,019 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧辽宁分片 | 1 | 8 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 501 | 82,818 | 82,818 | 文件与题目均保持 |

源分片合计 **15** 个 / **2,444** 道题；旧辽宁分片 **9** 个 / **835** 道题（替换 835 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `liaoning-none-changshi-0.json` | `provincial-辽宁-changshi-0.json` | 150 | 200 | 覆盖 |
| `liaoning-none-changshi-1.json` | `provincial-辽宁-changshi-1.json` | 150 | 200 | 覆盖 |
| `liaoning-none-changshi-2.json` | `provincial-辽宁-changshi-2.json` | 2 | 25 | 覆盖 |
| `liaoning-none-panduan-0.json` | `provincial-辽宁-panduan-0.json` | 112 | 200 | 覆盖 |
| `liaoning-none-panduan-1.json` | `provincial-辽宁-panduan-1.json` | — | 200 | 新增 |
| `liaoning-none-panduan-2.json` | `provincial-辽宁-panduan-2.json` | — | 185 | 新增 |
| `liaoning-none-shuliang-0.json` | `provincial-辽宁-shuliang-0.json` | 40 | 200 | 覆盖 |
| `liaoning-none-shuliang-1.json` | `provincial-辽宁-shuliang-1.json` | — | 44 | 新增 |
| `liaoning-none-yanyu-0.json` | `provincial-辽宁-yanyu-0.json` | 150 | 200 | 覆盖 |
| `liaoning-none-yanyu-1.json` | `provincial-辽宁-yanyu-1.json` | 98 | 200 | 覆盖 |
| `liaoning-none-yanyu-2.json` | `provincial-辽宁-yanyu-2.json` | — | 200 | 新增 |
| `liaoning-none-yanyu-3.json` | `provincial-辽宁-yanyu-3.json` | — | 185 | 新增 |
| `liaoning-none-ziliao-0.json` | `provincial-辽宁-ziliao-0.json` | 125 | 200 | 覆盖 |
| `liaoning-none-ziliao-1.json` | `provincial-辽宁-ziliao-1.json` | — | 200 | 新增 |
| `liaoning-none-ziliao-2.json` | `provincial-辽宁-ziliao-2.json` | — | 5 | 新增 |

### 1.2 待删除的多余旧辽宁分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-辽宁-shenlun-0.json` | 8 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 83,653 | 85,262 | +1,609 |
| 分片文件数 | 510 | 516 | +6 |
| 辽宁分片数 | 9 | 15 | +6 |
| 辽宁题目数 | 835 | 2,444 | +1,609 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 辽宁 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 501 / 82,818 | 501 / 82,818 | 0 |
| index key 总数 | 168 | 167 | -1 |
| idMap 条目数 | 82,560 | 84,215 | +1,655 |

**影响面**：只替换 `provincial-辽宁-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 82,560 | 合并前线上反查表 |
| 删除旧辽宁 ID | 789 | 旧前缀 `prov-辽宁-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-辽宁-*`，继续留在 idMap |
| 新增新辽宁 ID | 2,444 | 新前缀 `prov-liaoning-*` |
| 合并后 idMap | 84,215 | 按实际分片全量重建 |

- 旧辽宁 ID 仍被其他分片引用：**0**
- 新旧辽宁 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧辽宁 835 题对应 789 个唯一 ID（旧数据内部重复 46 条）；因此 idMap 净增 2,444 - 789 = +1,655。
- 重建方式：扫描合并后目录内全部分片，不只做辽宁增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 516 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 167 个 key 精确覆盖 516 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 84,215 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧辽宁 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**15/15**
- 源 `questions.json` 与分片一致：**是**（2,444 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-辽宁-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 辽宁旧数据（被替换 / 删除部分） | 835 | 775 | 92.8% | 29 | 0 | 43 | 17 |
| 辽宁新数据（v2） | 2,444 | 2,412 | 98.7% | 218 | 0 | 28 | 4 |
| 辽宁保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 85,262 | 82,277 | 96.5% | 8,491 | 1 | 2,895 | 89 |

辽宁可渲染题数（被替换部分）：**775 → 2,412**（+1,637）；图片题占位：29 → 218；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：814 / 835 题在中文标点旁残留空格。
- v2 新数据：**2,362 / 2,444** 题（96.6%）在中文标点旁残留空格。
- 示例：`负责主持辽宁省沈阳市人大代表选举的组织是：`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧辽宁 ID：`prov-辽宁-*`，被替换 / 删除分片共 789 个唯一 ID，退出 idMap 789 个。
- 新辽宁 ID：`prov-liaoning-*`，共 2,444 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 789 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 辽宁 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 辽宁 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧辽宁分片 → 复制 15 个新分片（映射为 `provincial-辽宁-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
