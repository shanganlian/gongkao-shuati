# 北京 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T12:35:19.314Z
- 源目录：`public/data/questions-v2-provincial/北京/`（ID 前缀 `prov-beijing-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`beijing-none-<module>-<chunk>.json` → `provincial-北京-<module>-<chunk>.json`
- 基线快照：当前线上 **378 个分片 / 52,700 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除（本省无旧主观题分片）

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `beijing-none-*` 会被解析成 `beijing / none / *`，北京分类无法命中，
> 因此 publish 必须改名为 `provincial-北京-*`；题目 ID 保持 `prov-beijing-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-北京-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-北京-*` | **通过** | 15 个文件（覆盖 8 / 新增 7 / 删除 0） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 334 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入北京 | **通过** | 0 个（旧北京分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-北京-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 334 个其他省分片，合计 51,941 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧北京分片 | 8 | 1,600 新 / 759 旧 |
| 新增北京分片 | 7 | 997 |
| 删除多余旧北京分片 | 0 | 0 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 370 | 51,941 |
| 合并前线上合计 | 378 | 52,700 |
| 合并后（实际分片推演） | 385 | 54,538 |

守恒校验：

- 文件数：`378 - 8 + 15 = 385`，推演值 385 → **通过**
- 题目数：`52,700 - 759 + 2,597 = 54,538`，推演值 54,538 → **通过**
- 覆盖 / 删除 / 保留去重：旧北京 8 个分片 = 覆盖 8 + 删除 0 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,597）

- 合并后总题数 = 当前 52,700 − 旧北京 759 + 新北京 **2,597** = **54,538**；推演结果 **54,538**，一致 ✅
- 源目录分片 15 个 / 题目 2,597 题；与账本定值 2,597 一致：**通过**

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧北京分片 | 8 | 759 | 1,600 | 同名文件直接替换 |
| 新增北京分片 | 7 | 0 | 997 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧北京分片 | 0 | 0 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 370 | 51,941 | 51,941 | 文件与题目均保持 |

源分片合计 **15** 个 / **2,597** 道题；旧北京分片 **8** 个 / **759** 道题（替换 759 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `beijing-none-changshi-0.json` | `provincial-北京-changshi-0.json` | 150 | 200 | 覆盖 |
| `beijing-none-changshi-1.json` | `provincial-北京-changshi-1.json` | 52 | 200 | 覆盖 |
| `beijing-none-changshi-2.json` | `provincial-北京-changshi-2.json` | — | 200 | 新增 |
| `beijing-none-changshi-3.json` | `provincial-北京-changshi-3.json` | — | 56 | 新增 |
| `beijing-none-panduan-0.json` | `provincial-北京-panduan-0.json` | 150 | 200 | 覆盖 |
| `beijing-none-panduan-1.json` | `provincial-北京-panduan-1.json` | 12 | 200 | 覆盖 |
| `beijing-none-panduan-2.json` | `provincial-北京-panduan-2.json` | — | 191 | 新增 |
| `beijing-none-shuliang-0.json` | `provincial-北京-shuliang-0.json` | 69 | 200 | 覆盖 |
| `beijing-none-shuliang-1.json` | `provincial-北京-shuliang-1.json` | — | 130 | 新增 |
| `beijing-none-yanyu-0.json` | `provincial-北京-yanyu-0.json` | 150 | 200 | 覆盖 |
| `beijing-none-yanyu-1.json` | `provincial-北京-yanyu-1.json` | 64 | 200 | 覆盖 |
| `beijing-none-yanyu-2.json` | `provincial-北京-yanyu-2.json` | — | 200 | 新增 |
| `beijing-none-yanyu-3.json` | `provincial-北京-yanyu-3.json` | — | 65 | 新增 |
| `beijing-none-ziliao-0.json` | `provincial-北京-ziliao-0.json` | 112 | 200 | 覆盖 |
| `beijing-none-ziliao-1.json` | `provincial-北京-ziliao-1.json` | — | 155 | 新增 |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 52,700 | 54,538 | +1,838 |
| 分片文件数 | 378 | 385 | +7 |
| 北京分片数 | 8 | 15 | +7 |
| 北京题目数 | 759 | 2,597 | +1,838 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 北京 index key 数 | 5 | 5 | 0 |
| 未触碰分片 / 题目 | 370 / 51,941 | 370 / 51,941 | 0 |
| index key 总数 | 164 | 164 | 0 |
| idMap 条目数 | 50,401 | 52,245 | +1,844 |

**影响面**：只替换 `provincial-北京-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 50,401 | 合并前线上反查表 |
| 删除旧北京 ID | 753 | 旧前缀 `prov-北京-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-北京-*`，继续留在 idMap |
| 新增新北京 ID | 2,597 | 新前缀 `prov-beijing-*` |
| 合并后 idMap | 52,245 | 按实际分片全量重建 |

- 旧北京 ID 仍被其他分片引用：**0**
- 新旧北京 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧北京 759 题对应 753 个唯一 ID（旧数据内部重复 6 条）；因此 idMap 净增 2,597 - 753 = +1,844。
- 重建方式：扫描合并后目录内全部分片，不只做北京增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 385 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 164 个 key 精确覆盖 385 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 52,245 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧北京 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**15/15**
- 源 `questions.json` 与分片一致：**是**（2,597 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-北京-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 北京旧数据（被替换 / 删除部分） | 759 | 753 | 99.2% | 24 | 0 | 6 | 0 |
| 北京新数据（v2） | 2,597 | 2,585 | 99.5% | 180 | 0 | 10 | 2 |
| 北京保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 54,538 | 53,265 | 97.7% | 4,833 | 17 | 994 | 262 |

北京可渲染题数（被替换部分）：**753 → 2,585**（+1,832）；图片题占位：24 → 180；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：759 / 759 题在中文标点旁残留空格。
- v2 新数据：**2,467 / 2,597** 题（95.0%）在中文标点旁残留空格。
- 示例：`要鼓励市民采取绿色交通方式出行，首先要提供充足和优质的公共交通。这表明政府在履行：`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧北京 ID：`prov-北京-*`，被替换 / 删除分片共 753 个唯一 ID，退出 idMap 753 个。
- 新北京 ID：`prov-beijing-*`，共 2,597 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 753 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 北京 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 北京 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧北京分片 → 复制 15 个新分片（映射为 `provincial-北京-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
