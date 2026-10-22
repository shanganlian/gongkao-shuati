# 上海 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T12:35:26.842Z
- 源目录：`public/data/questions-v2-provincial/上海/`（ID 前缀 `prov-shanghai-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`shanghai-none-<module>-<chunk>.json` → `provincial-上海-<module>-<chunk>.json`
- 基线快照：当前线上 **385 个分片 / 54,538 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 8 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `shanghai-none-*` 会被解析成 `shanghai / none / *`，上海分类无法命中，
> 因此 publish 必须改名为 `provincial-上海-*`；题目 ID 保持 `prov-shanghai-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-上海-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-上海-*` | **通过** | 26 个文件（覆盖 8 / 新增 17 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 340 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入上海 | **通过** | 0 个（旧上海分片已全部进入替换 / 删除 / 保留清单） |
| 保留旧分片 ID 前缀 `prov-上海-*` | **通过** | 0 个唯一 ID |
| 替换 / 删除旧分片混入外省 ID | 忽略 | 0 个（随旧分片一并消失） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 340 个其他省分片，合计 53,605 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧上海分片 | 8 | 1,600 新 / 925 旧 |
| 新增上海分片 | 17 | 2,705 |
| 删除多余旧上海分片 | 1 | 8 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 376 | 53,605 |
| 合并前线上合计 | 385 | 54,538 |
| 合并后（实际分片推演） | 401 | 57,910 |

守恒校验：

- 文件数：`385 - 9 + 25 = 401`，推演值 401 → **通过**
- 题目数：`54,538 - 933 + 4,305 = 57,910`，推演值 57,910 → **通过**
- 覆盖 / 删除 / 保留去重：旧上海 9 个分片 = 覆盖 8 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 4,305）

- 合并后总题数 = 当前 54,538 − 旧上海 933 + 新上海 **4,305** = **57,910**；推演结果 **57,910**，一致 ✅
- 源目录分片 25 个 / 题目 4,305 题；与账本定值 4,305 一致：**通过**
- `--drop-uncovered` 已把旧主观题 8 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧上海分片 | 8 | 925 | 1,600 | 同名文件直接替换 |
| 新增上海分片 | 17 | 0 | 2,705 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧上海分片 | 1 | 8 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 376 | 53,605 | 53,605 | 文件与题目均保持 |

源分片合计 **25** 个 / **4,305** 道题；旧上海分片 **9** 个 / **933** 道题（替换 933 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `shanghai-none-changshi-0.json` | `provincial-上海-changshi-0.json` | 97 | 200 | 覆盖 |
| `shanghai-none-changshi-1.json` | `provincial-上海-changshi-1.json` | — | 200 | 新增 |
| `shanghai-none-changshi-2.json` | `provincial-上海-changshi-2.json` | — | 200 | 新增 |
| `shanghai-none-changshi-3.json` | `provincial-上海-changshi-3.json` | — | 200 | 新增 |
| `shanghai-none-changshi-4.json` | `provincial-上海-changshi-4.json` | — | 200 | 新增 |
| `shanghai-none-changshi-5.json` | `provincial-上海-changshi-5.json` | — | 200 | 新增 |
| `shanghai-none-changshi-6.json` | `provincial-上海-changshi-6.json` | — | 39 | 新增 |
| `shanghai-none-panduan-0.json` | `provincial-上海-panduan-0.json` | 150 | 200 | 覆盖 |
| `shanghai-none-panduan-1.json` | `provincial-上海-panduan-1.json` | 150 | 200 | 覆盖 |
| `shanghai-none-panduan-2.json` | `provincial-上海-panduan-2.json` | 150 | 200 | 覆盖 |
| `shanghai-none-panduan-3.json` | `provincial-上海-panduan-3.json` | 64 | 200 | 覆盖 |
| `shanghai-none-panduan-4.json` | `provincial-上海-panduan-4.json` | — | 200 | 新增 |
| `shanghai-none-panduan-5.json` | `provincial-上海-panduan-5.json` | — | 200 | 新增 |
| `shanghai-none-panduan-6.json` | `provincial-上海-panduan-6.json` | — | 62 | 新增 |
| `shanghai-none-shuliang-0.json` | `provincial-上海-shuliang-0.json` | — | 200 | 新增 |
| `shanghai-none-shuliang-1.json` | `provincial-上海-shuliang-1.json` | — | 200 | 新增 |
| `shanghai-none-shuliang-2.json` | `provincial-上海-shuliang-2.json` | — | 7 | 新增 |
| `shanghai-none-yanyu-0.json` | `provincial-上海-yanyu-0.json` | 150 | 200 | 覆盖 |
| `shanghai-none-yanyu-1.json` | `provincial-上海-yanyu-1.json` | 150 | 200 | 覆盖 |
| `shanghai-none-yanyu-2.json` | `provincial-上海-yanyu-2.json` | 14 | 200 | 覆盖 |
| `shanghai-none-yanyu-3.json` | `provincial-上海-yanyu-3.json` | — | 200 | 新增 |
| `shanghai-none-yanyu-4.json` | `provincial-上海-yanyu-4.json` | — | 166 | 新增 |
| `shanghai-none-ziliao-0.json` | `provincial-上海-ziliao-0.json` | — | 200 | 新增 |
| `shanghai-none-ziliao-1.json` | `provincial-上海-ziliao-1.json` | — | 200 | 新增 |
| `shanghai-none-ziliao-2.json` | `provincial-上海-ziliao-2.json` | — | 31 | 新增 |

### 1.2 待删除的多余旧上海分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-上海-shenlun-0.json` | 8 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 54,538 | 57,910 | +3,372 |
| 分片文件数 | 385 | 401 | +16 |
| 上海分片数 | 9 | 25 | +16 |
| 上海题目数 | 933 | 4,305 | +3,372 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 上海 index key 数 | 4 | 5 | +1 |
| 未触碰分片 / 题目 | 376 / 53,605 | 376 / 53,605 | 0 |
| index key 总数 | 164 | 165 | +1 |
| idMap 条目数 | 52,245 | 55,656 | +3,411 |

**影响面**：只替换 `provincial-上海-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 52,245 | 合并前线上反查表 |
| 删除旧上海 ID | 894 | 旧前缀 `prov-上海-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-上海-*`，继续留在 idMap |
| 新增新上海 ID | 4,305 | 新前缀 `prov-shanghai-*` |
| 合并后 idMap | 55,656 | 按实际分片全量重建 |

- 旧上海 ID 仍被其他分片引用：**0**
- 新旧上海 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧上海 933 题对应 894 个唯一 ID（旧数据内部重复 39 条）；因此 idMap 净增 4,305 - 894 = +3,411。
- 重建方式：扫描合并后目录内全部分片，不只做上海增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 401 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 165 个 key 精确覆盖 401 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 55,656 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧上海 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**25/25**
- 源 `questions.json` 与分片一致：**是**（4,305 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-上海-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 上海旧数据（被替换 / 删除部分） | 933 | 867 | 92.9% | 88 | 6 | 37 | 23 |
| 上海新数据（v2） | 4,305 | 4,048 | 94.0% | 715 | 0 | 256 | 1 |
| 上海保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 57,910 | 56,446 | 97.5% | 5,460 | 11 | 1,213 | 240 |

上海可渲染题数（被替换部分）：**867 → 4,048**（+3,181）；图片题占位：88 → 715；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：914 / 933 题在中文标点旁残留空格。
- v2 新数据：**3,993 / 4,305** 题（92.8%）在中文标点旁残留空格。
- 示例：`6，7，9，13，21，（ ）。`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧上海 ID：`prov-上海-*`，被替换 / 删除分片共 894 个唯一 ID，退出 idMap 894 个。
- 新上海 ID：`prov-shanghai-*`，共 4,305 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 894 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 上海 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 上海 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧上海分片 → 复制 25 个新分片（映射为 `provincial-上海-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
