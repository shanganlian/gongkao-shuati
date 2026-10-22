# 江苏 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T13:55:32.310Z
- 源目录：`public/data/questions-v2-provincial/江苏/`（ID 前缀 `prov-jiangsu-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`jiangsu-none-<module>-<chunk>.json` → `provincial-江苏-<module>-<chunk>.json`
- 基线快照：当前线上 **490 个分片 / 78,823 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 4 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `jiangsu-none-*` 会被解析成 `jiangsu / none / *`，江苏分类无法命中，
> 因此 publish 必须改名为 `provincial-江苏-*`；题目 ID 保持 `prov-jiangsu-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-江苏-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-江苏-*` | **通过** | 35 个文件（覆盖 13 / 新增 21 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 440 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入江苏 | **通过** | 0 个（旧江苏分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-江苏-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 440 个其他省分片，合计 77,342 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧江苏分片 | 13 | 2,600 新 / 1,477 旧 |
| 新增江苏分片 | 21 | 3,711 |
| 删除多余旧江苏分片 | 1 | 4 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 476 | 77,342 |
| 合并前线上合计 | 490 | 78,823 |
| 合并后（实际分片推演） | 510 | 83,653 |

守恒校验：

- 文件数：`490 - 14 + 34 = 510`，推演值 510 → **通过**
- 题目数：`78,823 - 1,481 + 6,311 = 83,653`，推演值 83,653 → **通过**
- 覆盖 / 删除 / 保留去重：旧江苏 14 个分片 = 覆盖 13 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 6,311）

- 合并后总题数 = 当前 78,823 − 旧江苏 1,481 + 新江苏 **6,311** = **83,653**；推演结果 **83,653**，一致 ✅
- 源目录分片 34 个 / 题目 6,311 题；与账本定值 6,311 一致：**通过**
- `--drop-uncovered` 已把旧主观题 4 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧江苏分片 | 13 | 1,477 | 2,600 | 同名文件直接替换 |
| 新增江苏分片 | 21 | 0 | 3,711 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧江苏分片 | 1 | 4 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 476 | 77,342 | 77,342 | 文件与题目均保持 |

源分片合计 **34** 个 / **6,311** 道题；旧江苏分片 **14** 个 / **1,481** 道题（替换 1,481 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `jiangsu-none-changshi-0.json` | `provincial-江苏-changshi-0.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-changshi-1.json` | `provincial-江苏-changshi-1.json` | 47 | 200 | 覆盖 |
| `jiangsu-none-changshi-2.json` | `provincial-江苏-changshi-2.json` | — | 137 | 新增 |
| `jiangsu-none-panduan-0.json` | `provincial-江苏-panduan-0.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-panduan-1.json` | `provincial-江苏-panduan-1.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-panduan-10.json` | `provincial-江苏-panduan-10.json` | — | 132 | 新增 |
| `jiangsu-none-panduan-2.json` | `provincial-江苏-panduan-2.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-panduan-3.json` | `provincial-江苏-panduan-3.json` | 92 | 200 | 覆盖 |
| `jiangsu-none-panduan-4.json` | `provincial-江苏-panduan-4.json` | — | 200 | 新增 |
| `jiangsu-none-panduan-5.json` | `provincial-江苏-panduan-5.json` | — | 200 | 新增 |
| `jiangsu-none-panduan-6.json` | `provincial-江苏-panduan-6.json` | — | 200 | 新增 |
| `jiangsu-none-panduan-7.json` | `provincial-江苏-panduan-7.json` | — | 200 | 新增 |
| `jiangsu-none-panduan-8.json` | `provincial-江苏-panduan-8.json` | — | 200 | 新增 |
| `jiangsu-none-panduan-9.json` | `provincial-江苏-panduan-9.json` | — | 200 | 新增 |
| `jiangsu-none-shuliang-0.json` | `provincial-江苏-shuliang-0.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-shuliang-1.json` | `provincial-江苏-shuliang-1.json` | 46 | 200 | 覆盖 |
| `jiangsu-none-shuliang-2.json` | `provincial-江苏-shuliang-2.json` | — | 200 | 新增 |
| `jiangsu-none-shuliang-3.json` | `provincial-江苏-shuliang-3.json` | — | 200 | 新增 |
| `jiangsu-none-shuliang-4.json` | `provincial-江苏-shuliang-4.json` | — | 200 | 新增 |
| `jiangsu-none-shuliang-5.json` | `provincial-江苏-shuliang-5.json` | — | 7 | 新增 |
| `jiangsu-none-yanyu-0.json` | `provincial-江苏-yanyu-0.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-yanyu-1.json` | `provincial-江苏-yanyu-1.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-yanyu-2.json` | `provincial-江苏-yanyu-2.json` | 10 | 200 | 覆盖 |
| `jiangsu-none-yanyu-3.json` | `provincial-江苏-yanyu-3.json` | — | 200 | 新增 |
| `jiangsu-none-yanyu-4.json` | `provincial-江苏-yanyu-4.json` | — | 200 | 新增 |
| `jiangsu-none-yanyu-5.json` | `provincial-江苏-yanyu-5.json` | — | 200 | 新增 |
| `jiangsu-none-yanyu-6.json` | `provincial-江苏-yanyu-6.json` | — | 200 | 新增 |
| `jiangsu-none-yanyu-7.json` | `provincial-江苏-yanyu-7.json` | — | 138 | 新增 |
| `jiangsu-none-ziliao-0.json` | `provincial-江苏-ziliao-0.json` | 150 | 200 | 覆盖 |
| `jiangsu-none-ziliao-1.json` | `provincial-江苏-ziliao-1.json` | 82 | 200 | 覆盖 |
| `jiangsu-none-ziliao-2.json` | `provincial-江苏-ziliao-2.json` | — | 200 | 新增 |
| `jiangsu-none-ziliao-3.json` | `provincial-江苏-ziliao-3.json` | — | 200 | 新增 |
| `jiangsu-none-ziliao-4.json` | `provincial-江苏-ziliao-4.json` | — | 200 | 新增 |
| `jiangsu-none-ziliao-5.json` | `provincial-江苏-ziliao-5.json` | — | 97 | 新增 |

### 1.2 待删除的多余旧江苏分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-江苏-shenlun-0.json` | 4 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 78,823 | 83,653 | +4,830 |
| 分片文件数 | 490 | 510 | +20 |
| 江苏分片数 | 14 | 34 | +20 |
| 江苏题目数 | 1,481 | 6,311 | +4,830 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 江苏 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 476 / 77,342 | 476 / 77,342 | 0 |
| index key 总数 | 169 | 168 | -1 |
| idMap 条目数 | 77,727 | 82,560 | +4,833 |

**影响面**：只替换 `provincial-江苏-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 77,727 | 合并前线上反查表 |
| 删除旧江苏 ID | 1,478 | 旧前缀 `prov-江苏-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-江苏-*`，继续留在 idMap |
| 新增新江苏 ID | 6,311 | 新前缀 `prov-jiangsu-*` |
| 合并后 idMap | 82,560 | 按实际分片全量重建 |

- 旧江苏 ID 仍被其他分片引用：**0**
- 新旧江苏 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧江苏 1,481 题对应 1,478 个唯一 ID（旧数据内部重复 3 条）；因此 idMap 净增 6,311 - 1,478 = +4,833。
- 重建方式：扫描合并后目录内全部分片，不只做江苏增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 510 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 168 个 key 精确覆盖 510 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 82,560 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧江苏 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**34/34**
- 源 `questions.json` 与分片一致：**是**（6,311 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-江苏-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 江苏旧数据（被替换 / 删除部分） | 1,481 | 1,453 | 98.1% | 179 | 2 | 2 | 24 |
| 江苏新数据（v2） | 6,311 | 6,115 | 96.9% | 979 | 0 | 194 | 2 |
| 江苏保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 83,653 | 80,640 | 96.4% | 8,302 | 1 | 2,910 | 102 |

江苏可渲染题数（被替换部分）：**1,453 → 6,115**（+4,662）；图片题占位：179 → 979；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：1,418 / 1,481 题在中文标点旁残留空格。
- v2 新数据：**5,810 / 6,311** 题（92.1%）在中文标点旁残留空格。
- 示例：`9AGUKL RHGJA`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧江苏 ID：`prov-江苏-*`，被替换 / 删除分片共 1,478 个唯一 ID，退出 idMap 1,478 个。
- 新江苏 ID：`prov-jiangsu-*`，共 6,311 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 1,478 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 江苏 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 江苏 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧江苏分片 → 复制 34 个新分片（映射为 `provincial-江苏-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
