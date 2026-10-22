# 内蒙古 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T13:55:53.479Z
- 源目录：`public/data/questions-v2-provincial/内蒙古/`（ID 前缀 `prov-neimenggu-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`neimenggu-none-<module>-<chunk>.json` → `provincial-内蒙古-<module>-<chunk>.json`
- 基线快照：当前线上 **516 个分片 / 85,262 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除（本省无旧主观题分片）

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `neimenggu-none-*` 会被解析成 `neimenggu / none / *`，内蒙古分类无法命中，
> 因此 publish 必须改名为 `provincial-内蒙古-*`；题目 ID 保持 `prov-neimenggu-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-内蒙古-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-内蒙古-*` | **通过** | 14 个文件（覆盖 0 / 新增 14 / 删除 0） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 480 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入内蒙古 | **通过** | 0 个（旧内蒙古分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-内蒙古-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 480 个其他省分片，合计 85,262 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧内蒙古分片 | 0 | 0 新 / 0 旧 |
| 新增内蒙古分片 | 14 | 2,175 |
| 删除多余旧内蒙古分片 | 0 | 0 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 516 | 85,262 |
| 合并前线上合计 | 516 | 85,262 |
| 合并后（实际分片推演） | 530 | 87,437 |

守恒校验：

- 文件数：`516 - 0 + 14 = 530`，推演值 530 → **通过**
- 题目数：`85,262 - 0 + 2,175 = 87,437`，推演值 87,437 → **通过**
- 覆盖 / 删除 / 保留去重：旧内蒙古 0 个分片 = 覆盖 0 + 删除 0 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,175）

- 合并后总题数 = 当前 85,262 − 旧内蒙古 0 + 新内蒙古 **2,175** = **87,437**；推演结果 **87,437**，一致 ✅
- 源目录分片 14 个 / 题目 2,175 题；与账本定值 2,175 一致：**通过**

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧内蒙古分片 | 0 | 0 | 0 | 同名文件直接替换 |
| 新增内蒙古分片 | 14 | 0 | 2,175 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧内蒙古分片 | 0 | 0 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 516 | 85,262 | 85,262 | 文件与题目均保持 |

源分片合计 **14** 个 / **2,175** 道题；旧内蒙古分片 **0** 个 / **0** 道题（替换 0 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `neimenggu-none-changshi-0.json` | `provincial-内蒙古-changshi-0.json` | — | 200 | 新增 |
| `neimenggu-none-changshi-1.json` | `provincial-内蒙古-changshi-1.json` | — | 190 | 新增 |
| `neimenggu-none-panduan-0.json` | `provincial-内蒙古-panduan-0.json` | — | 200 | 新增 |
| `neimenggu-none-panduan-1.json` | `provincial-内蒙古-panduan-1.json` | — | 200 | 新增 |
| `neimenggu-none-panduan-2.json` | `provincial-内蒙古-panduan-2.json` | — | 200 | 新增 |
| `neimenggu-none-panduan-3.json` | `provincial-内蒙古-panduan-3.json` | — | 10 | 新增 |
| `neimenggu-none-shuliang-0.json` | `provincial-内蒙古-shuliang-0.json` | — | 200 | 新增 |
| `neimenggu-none-shuliang-1.json` | `provincial-内蒙古-shuliang-1.json` | — | 69 | 新增 |
| `neimenggu-none-yanyu-0.json` | `provincial-内蒙古-yanyu-0.json` | — | 200 | 新增 |
| `neimenggu-none-yanyu-1.json` | `provincial-内蒙古-yanyu-1.json` | — | 200 | 新增 |
| `neimenggu-none-yanyu-2.json` | `provincial-内蒙古-yanyu-2.json` | — | 200 | 新增 |
| `neimenggu-none-yanyu-3.json` | `provincial-内蒙古-yanyu-3.json` | — | 21 | 新增 |
| `neimenggu-none-ziliao-0.json` | `provincial-内蒙古-ziliao-0.json` | — | 200 | 新增 |
| `neimenggu-none-ziliao-1.json` | `provincial-内蒙古-ziliao-1.json` | — | 85 | 新增 |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 85,262 | 87,437 | +2,175 |
| 分片文件数 | 516 | 530 | +14 |
| 内蒙古分片数 | 0 | 14 | +14 |
| 内蒙古题目数 | 0 | 2,175 | +2,175 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 内蒙古 index key 数 | 0 | 5 | +5 |
| 未触碰分片 / 题目 | 516 / 85,262 | 516 / 85,262 | 0 |
| index key 总数 | 167 | 172 | +5 |
| idMap 条目数 | 84,215 | 86,390 | +2,175 |

**影响面**：只替换 `provincial-内蒙古-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 84,215 | 合并前线上反查表 |
| 删除旧内蒙古 ID | 0 | 旧前缀 `prov-内蒙古-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-内蒙古-*`，继续留在 idMap |
| 新增新内蒙古 ID | 2,175 | 新前缀 `prov-neimenggu-*` |
| 合并后 idMap | 86,390 | 按实际分片全量重建 |

- 旧内蒙古 ID 仍被其他分片引用：**0**
- 新旧内蒙古 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧内蒙古 0 题对应 0 个唯一 ID（旧数据内部重复 0 条）；因此 idMap 净增 2,175 - 0 = +2,175。
- 重建方式：扫描合并后目录内全部分片，不只做内蒙古增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 530 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 172 个 key 精确覆盖 530 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 86,390 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧内蒙古 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**14/14**
- 源 `questions.json` 与分片一致：**是**（2,175 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-内蒙古-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 内蒙古旧数据（被替换 / 删除部分） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 内蒙古新数据（v2） | 2,175 | 2,125 | 97.7% | 212 | 0 | 49 | 1 |
| 内蒙古保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 87,437 | 84,402 | 96.5% | 8,703 | 1 | 2,944 | 90 |

内蒙古可渲染题数（被替换部分）：**0 → 2,125**（+2,125）；图片题占位：0 → 212；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：0 / 0 题在中文标点旁残留空格。
- v2 新数据：**2,078 / 2,175** 题（95.5%）在中文标点旁残留空格。
- 示例：`甲在现场观看比赛，乙在家里观看比赛，已知乙家距离比赛现场 30 公里，问甲、乙谁先听到枪声？`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧内蒙古 ID：`prov-内蒙古-*`，被替换 / 删除分片共 0 个唯一 ID，退出 idMap 0 个。
- 新内蒙古 ID：`prov-neimenggu-*`，共 2,175 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 0 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 内蒙古 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 内蒙古 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧内蒙古分片 → 复制 14 个新分片（映射为 `provincial-内蒙古-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
