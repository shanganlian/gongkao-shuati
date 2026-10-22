# 陕西 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 阻塞项：**无**
- 生成时间：2026-10-22T11:01:07.742Z
- 源目录：`public/data/questions-v2-provincial/陕西/`（ID 前缀 `prov-shaanxi-*`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧省数据）
- 分片映射：`shaanxi-none-<module>-<chunk>.json` → `provincial-陕西-<module>-<chunk>.json`
- 基线快照：当前线上 **330 个分片 / 41,384 题**（以当前磁盘快照为准，含此前已发布省份）

- **`--drop-uncovered`**：v2 未覆盖的旧分片全部删除，本省旧主观题 1 题会消失

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `shaanxi-none-*` 会被解析成 `shaanxi / none / *`，陕西分类无法命中，
> 因此 publish 必须改名为 `provincial-陕西-*`；题目 ID 保持 `prov-shaanxi-*` 不变。

> 本报告以当前线上快照为基线。逐省 apply 后，后续省份的“合并前/后”总数会按新快照重算；
> 本报告中的“本省旧题 / 新题 / 变更文件”不受影响。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-陕西-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-陕西-*` | **通过** | 15 个文件（覆盖 7 / 新增 7 / 删除 1） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 286 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入陕西 | **通过** | 0 个（旧陕西分片已全部进入替换 / 删除 / 保留清单） |
| 旧分片 ID 前缀 `prov-陕西-*` | **通过** | 757 个唯一 ID |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 286 个其他省分片，合计 40,582 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧陕西分片 | 7 | 1,400 新 / 801 旧 |
| 新增陕西分片 | 7 | 955 |
| 删除多余旧陕西分片 | 1 | 1 |
| 保留 v2 未覆盖的旧主观题分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 322 | 40,582 |
| 合并前线上合计 | 330 | 41,384 |
| 合并后（实际分片推演） | 336 | 42,937 |

守恒校验：

- 文件数：`330 - 8 + 14 = 336`，推演值 336 → **通过**
- 题目数：`41,384 - 802 + 2,355 = 42,937`，推演值 42,937 → **通过**
- 覆盖 / 删除 / 保留去重：旧陕西 8 个分片 = 覆盖 7 + 删除 1 + 保留 0 → **通过**

### 0.3 总数守恒（定值 2,355）

- 合并后总题数 = 当前 41,384 − 旧陕西 802 + 新陕西 **2,355** = **42,937**；推演结果 **42,937**，一致 ✅
- 源目录分片 14 个 / 题目 2,355 题；与账本定值 2,355 一致：**通过**
- `--drop-uncovered` 已把旧主观题 1 题计入“删除多余旧分片”，不再保留。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧陕西分片 | 7 | 801 | 1,400 | 同名文件直接替换 |
| 新增陕西分片 | 7 | 0 | 955 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧陕西分片 | 1 | 1 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 保留旧主观题分片 | 0 | 0 | 0 | v2 未覆盖 shenlun / gongji，不删不改 |
| 未触碰（国考 / 其他省） | 322 | 40,582 | 40,582 | 文件与题目均保持 |

源分片合计 **14** 个 / **2,355** 道题；旧陕西分片 **8** 个 / **802** 道题（替换 802 + 保留 0）。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `shaanxi-none-changshi-0.json` | `provincial-陕西-changshi-0.json` | 150 | 200 | 覆盖 |
| `shaanxi-none-changshi-1.json` | `provincial-陕西-changshi-1.json` | 82 | 200 | 覆盖 |
| `shaanxi-none-changshi-2.json` | `provincial-陕西-changshi-2.json` | — | 10 | 新增 |
| `shaanxi-none-panduan-0.json` | `provincial-陕西-panduan-0.json` | 88 | 200 | 覆盖 |
| `shaanxi-none-panduan-1.json` | `provincial-陕西-panduan-1.json` | — | 200 | 新增 |
| `shaanxi-none-panduan-2.json` | `provincial-陕西-panduan-2.json` | — | 181 | 新增 |
| `shaanxi-none-shuliang-0.json` | `provincial-陕西-shuliang-0.json` | 115 | 200 | 覆盖 |
| `shaanxi-none-shuliang-1.json` | `provincial-陕西-shuliang-1.json` | — | 74 | 新增 |
| `shaanxi-none-yanyu-0.json` | `provincial-陕西-yanyu-0.json` | 150 | 200 | 覆盖 |
| `shaanxi-none-yanyu-1.json` | `provincial-陕西-yanyu-1.json` | 134 | 200 | 覆盖 |
| `shaanxi-none-yanyu-2.json` | `provincial-陕西-yanyu-2.json` | — | 200 | 新增 |
| `shaanxi-none-yanyu-3.json` | `provincial-陕西-yanyu-3.json` | — | 130 | 新增 |
| `shaanxi-none-ziliao-0.json` | `provincial-陕西-ziliao-0.json` | 82 | 200 | 覆盖 |
| `shaanxi-none-ziliao-1.json` | `provincial-陕西-ziliao-1.json` | — | 160 | 新增 |

### 1.2 待删除的多余旧陕西分片

| 文件 | 题目数 | 模块 |
|---|---:|---|
| `provincial-陕西-shenlun-0.json` | 1 | shenlun |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 41,384 | 42,937 | +1,553 |
| 分片文件数 | 330 | 336 | +6 |
| 陕西分片数 | 8 | 14 | +6 |
| 陕西题目数 | 802 | 2,355 | +1,553 |
| 其中保留的旧主观题 | 0 | 0 | 0 |
| 陕西 index key 数 | 6 | 5 | -1 |
| 未触碰分片 / 题目 | 322 / 40,582 | 322 / 40,582 | 0 |
| index key 总数 | 164 | 163 | -1 |
| idMap 条目数 | 38,807 | 40,405 | +1,598 |

**影响面**：只替换 `provincial-陕西-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 38,807 | 合并前线上反查表 |
| 删除旧陕西 ID | 757 | 旧前缀 `prov-陕西-*`；不做映射 |
| 保留旧主观题 ID | 0 | 旧前缀 `prov-陕西-*`，继续留在 idMap |
| 新增新陕西 ID | 2,355 | 新前缀 `prov-shaanxi-*` |
| 合并后 idMap | 40,405 | 按实际分片全量重建 |

- 旧陕西 ID 仍被其他分片引用：**0**
- 新旧陕西 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 旧陕西 802 题对应 757 个唯一 ID（旧数据内部重复 45 条）；因此 idMap 净增 2,355 - 757 = +1,598。
- 重建方式：扫描合并后目录内全部分片，不只做陕西增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 336 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 163 个 key 精确覆盖 336 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 40,405 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧陕西 ID 交集：**0**
- 新 ID 与保留的旧主观题 ID 交集：**0**
- 源 index 覆盖：**14/14**
- 源 `questions.json` 与分片一致：**是**（2,355 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-陕西-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 陕西旧数据（被替换 / 删除部分） | 802 | 759 | 94.6% | 35 | 1 | 32 | 10 |
| 陕西新数据（v2） | 2,355 | 2,320 | 98.5% | 186 | 0 | 32 | 3 |
| 陕西保留的旧主观题（不变） | 0 | 0 | 0% | 0 | 0 | 0 | 0 |
| 全库（合并后） | 42,937 | 41,654 | 97.0% | 3,713 | 21 | 953 | 309 |

陕西可渲染题数（被替换部分）：**759 → 2,320**（+1,561）；图片题占位：35 → 186；保留主观题 0 题可渲染。

### 5.1 文本空格残留（提示，不阻塞）

- 旧数据（被替换 / 删除部分）：795 / 802 题在中文标点旁残留空格。
- v2 新数据：**2,299 / 2,355** 题（97.6%）在中文标点旁残留空格。
- 示例：`对于法律事实分类正确的是：`
- 本轮按“不做修复轮”的要求未清洗；若需要与福建发布后一致的观感，可在 apply 前补一次空格清洗。

## 6. ID 策略（A1：不迁移）

- 旧陕西 ID：`prov-陕西-*`，被替换 / 删除分片共 757 个唯一 ID，退出 idMap 757 个。
- 新陕西 ID：`prov-shaanxi-*`，共 2,355 个，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；被替换的 757 个旧 ID 不再命中，保留的 0 个主观题 ID 仍可命中。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-provinces.cjs --province 陕西 --drop-uncovered          # dry-run（本报告）
node scripts/publish-merge-provinces.cjs --province 陕西 --apply --drop-uncovered  # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧陕西分片 → 复制 14 个新分片（映射为 `provincial-陕西-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：被替换旧分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 备份：脚本不生成 publish 备份；回滚基线为 apply 前的 git HEAD（执行前先记录 `git rev-parse HEAD`），旧分片与 `index.json` / `idMap.json` 均在版本库中。
- 失败回滚：`git checkout <apply 前 HEAD> -- public/data/questions/` 后重新执行 dry-run。
- 脚本不执行 `git push`；如需发布，人工确认暂存清单后提交并推送。
