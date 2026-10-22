# 四川 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T13:56:28.646Z
- 源目录：`public/data/questions-v2-provincial/四川/`（ID 前缀 `prov-sichuan-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`sichuan-none-<module>-<chunk>.json` → `provincial-四川-<module>-<chunk>.json`
- 基线快照：当前线上 **542 个分片 / 90,544 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 5 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `sichuan-none-*` 会被解析成 `sichuan / none / *`，四川分类无法命中，
> 因此 publish 必须改名为 `provincial-四川-*`；题目 ID 保持 `prov-sichuan-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-四川-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-四川-*` | **通过** | 20 个文件（覆盖 8 / 新增 11 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 497 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入四川 | **通过** | 0 个（旧四川分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-四川-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 497 个其他省分片，合计 89,658 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧四川分片 | 8 | 1,600 新 / 881 旧 |
| 新增四川分片 | 11 | 1,634 |
| 删除多余旧四川分片 | 1 | 5 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 533 | 89,658 |
| 合并前线上合计 | 542 | 90,544 |
| 合并后（实际分片推演） | 552 | 92,892 |

守恒校验：

- 文件数：`542 - 9 + 19 = 552`，推演值 552 → **通过**
- 题目数：`90,544 - 886 + 3,234 = 92,892`，推演值 92,892 → **通过**
- 覆盖 / 删除 / 保留去重：旧四川 9 个分片 = 覆盖 8 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 3,234）

- 合并后总题数 = 当前 90,544 − 旧四川 886 + 新四川 **3,234** = **92,892**；推演结果 **92,892**，一致 ✅
- 源目录分片 19 个 / 题目 3,234 题；与账本定值 3,234 一致：**通过**
- `--drop-uncovered` 已把旧主观题 5 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧四川分片 | 8 | 881 | 1,600 | 同名文件直接替换 |
| 新增四川分片 | 11 | 0 | 1,634 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧四川分片 | 1 | 5 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 533 | 89,658 | 89,658 | 文件与题目均保持 |

源分片合计 **19** 个 / **3,234** 道题；旧四川分片 **9** 个 / **886** 道题（替换 886 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `sichuan-none-changshi-0.json` | `provincial-四川-changshi-0.json` | 150 | 200 | 覆盖 |
| `sichuan-none-changshi-1.json` | `provincial-四川-changshi-1.json` | 48 | 200 | 覆盖 |
| `sichuan-none-changshi-2.json` | `provincial-四川-changshi-2.json` | — | 35 | 新增 |
| `sichuan-none-panduan-0.json` | `provincial-四川-panduan-0.json` | 150 | 200 | 覆盖 |
| `sichuan-none-panduan-1.json` | `provincial-四川-panduan-1.json` | 75 | 200 | 覆盖 |
| `sichuan-none-panduan-2.json` | `provincial-四川-panduan-2.json` | — | 200 | 新增 |
| `sichuan-none-panduan-3.json` | `provincial-四川-panduan-3.json` | — | 200 | 新增 |
| `sichuan-none-panduan-4.json` | `provincial-四川-panduan-4.json` | — | 167 | 新增 |
| `sichuan-none-shuliang-0.json` | `provincial-四川-shuliang-0.json` | 65 | 200 | 覆盖 |
| `sichuan-none-shuliang-1.json` | `provincial-四川-shuliang-1.json` | — | 200 | 新增 |
| `sichuan-none-shuliang-2.json` | `provincial-四川-shuliang-2.json` | — | 42 | 新增 |
| `sichuan-none-yanyu-0.json` | `provincial-四川-yanyu-0.json` | 150 | 200 | 覆盖 |
| `sichuan-none-yanyu-1.json` | `provincial-四川-yanyu-1.json` | 123 | 200 | 覆盖 |
| `sichuan-none-yanyu-2.json` | `provincial-四川-yanyu-2.json` | — | 200 | 新增 |
| `sichuan-none-yanyu-3.json` | `provincial-四川-yanyu-3.json` | — | 200 | 新增 |
| `sichuan-none-yanyu-4.json` | `provincial-四川-yanyu-4.json` | — | 125 | 新增 |
| `sichuan-none-ziliao-0.json` | `provincial-四川-ziliao-0.json` | 120 | 200 | 覆盖 |
| `sichuan-none-ziliao-1.json` | `provincial-四川-ziliao-1.json` | — | 200 | 新增 |
| `sichuan-none-ziliao-2.json` | `provincial-四川-ziliao-2.json` | — | 65 | 新增 |

### 1.2 待删除的多余旧四川分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-四川-shenlun-0.json` | 5 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 90,544 | 92,892 | +2,348 |
| 分片文件数 | 542 | 552 | +10 |
| 四川分片数 | 9 | 19 | +10 |
| 四川题目数 | 886 | 3,234 | +2,348 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 四川 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 533 / 89,658 | 533 / 89,658 | 0 |
| index key 总数 | 171 | 170 | -1 |
| idMap 条目数 | 89,617 | 92,336 | +2,719 |

**影响面**：只替换 `provincial-四川-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 89,617 | 合并前线上反查表 |
| 删除旧四川 ID | 515 | 旧前缀 `prov-四川-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-四川-*`，继续留在 idMap |
| 新增新四川 ID | 3,234 | 新前缀 `prov-sichuan-*` |
| 合并后 idMap | 92,336 | 按实际分片全量重建 |

- 旧四川 ID 仍被其他分片引用：**0**
- 新旧四川 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧四川 886 题对应 515 个唯一 ID（旧数据内部重复 371 条）；因此 idMap 净增 3,234 - 515 = +2,719。
- 重建方式：扫描合并后目录内全部分片，不只做四川增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 552 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 170 个 key 精确覆盖 552 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 92,336 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧四川 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**19/19**
- 源 `questions.json` 与分片一致：**是**（3,234 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-四川-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 四川旧数据（被替换 / 删除部分） | 886 | 855 | 96.5% | 40 | 0 | 16 | 15 |
| 四川新数据（v2） | 3,234 | 3,192 | 98.7% | 314 | 0 | 40 | 2 |
| 四川保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 92,892 | 89,701 | 96.6% | 9,340 | 0 | 3,109 | 82 |

四川可渲染题数（被替换部分）：**855 → 3,192**（+2,337）；图片题占位：40 → 314；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：881 / 886 题在中文标点旁残留空格。
- v2 新数据：**3,046 / 3,234** 题（94.2%）在中文标点旁残留空格。
- 示例：`“树不修不直，人不教不才 ”，“遇良医得生，遇庸医致死 ”，这说明( )。`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧四川 ID：`prov-四川-*`，被替换 / 删除分片共 515 个唯一 ID，退出 idMap 515 个。
- 新四川 ID：`prov-sichuan-*`，共 3,234 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 515 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 四川 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 四川 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧四川分片 → 复制 19 个新分片（映射为 `provincial-四川-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
