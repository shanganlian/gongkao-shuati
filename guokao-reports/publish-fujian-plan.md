# 福建 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 生成时间：2026-10-20T11:52:36.901Z
- 源目录：`public/data/questions-v2-provincial/福建/`（ID 前缀 `prov-fujian-`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧福建）
- 分片映射：`fujian-none-<module>-<chunk>.json` → `provincial-福建-<module>-<chunk>.json`

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `fujian-none-*` 会被解析成 `fujian / none / *`，福建分类无法命中，
> 因此 publish 必须改名为 `provincial-福建-*`；题目 ID 保持 `prov-fujian-*` 不变。

## 0. 三项 publish 前置对账

### 0.1 越界检查（只允许动 `provincial-福建-*`）

| 检查 | 结果 | 明细 |
|---|---|---|
| 变更文件全部命中 `provincial-福建-*` | **通过** | 16 个文件（覆盖 8 / 新增 8 / 删除 0） |
| 越界到国考 `national-*` | **通过** | 0 个；未触碰国考分片 35 个 |
| 越界到其他省 `provincial-*` | **通过** | 0 个；未触碰其他省分片 255 个 |
| 变更清单重复文件 | **通过** | 0 个 |
| 未触碰分片混入福建 | **通过** | 0 个（福建分片已全部进入替换 / 删除清单） |

> 国考 / 其他省文件仅参与 `index.json` / `idMap.json` 全量重建，题目内容不写不改：35 个国考分片 + 255 个其他省分片，合计 32,381 题。

### 0.2 覆盖 / 新增 / 删除对账

| 项目 | 文件数 | 题数 |
|---|---:|---:|
| 覆盖同名旧福建分片 | 8 | 1,600 新 / 712 旧 |
| 新增福建分片 | 8 | 964 |
| 删除多余旧福建分片 | 0 | 0 |
| 未触碰（国考 / 其他省） | 291 | 32,381 |
| 合并前线上合计 | 299 | 33,093 |
| 合并后（实际分片推演） | 307 | 34,945 |

守恒校验：

- 文件数：`299 - 8 + 16 = 307`，推演值 307 → **通过**
- 题目数：`33,093 - 712 + 2,564 = 34,945`，推演值 34,945 → **通过**
- 覆盖 / 删除去重：旧福建 8 个分片 = 覆盖 8 + 删除 0 → **通过**

### 0.3 总数守恒（定值 2,564）

- 合并后总题数 = 当前 33,093 − 旧福建 712 + 新福建 **2,564** = **34,945**；推演结果 **34,945**，一致 ✅
- 源目录分片 16 个 / 题目 2,564 题；与账本定值 2,564 一致：**通过**

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧福建分片 | 8 | 712 | 1,600 | 同名文件直接替换 |
| 新增福建分片 | 8 | 0 | 964 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧福建分片 | 0 | 0 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 未触碰（国考 / 其他省） | 291 | 32,381 | 32,381 | 文件与题目均保持 |

源分片合计 **16** 个 / **2,564** 道题；旧福建分片 **8** 个 / **712** 道题。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `fujian-none-changshi-0.json` | `provincial-福建-changshi-0.json` | 150 | 200 | 覆盖 |
| `fujian-none-changshi-1.json` | `provincial-福建-changshi-1.json` | 37 | 200 | 覆盖 |
| `fujian-none-changshi-2.json` | `provincial-福建-changshi-2.json` | — | 55 | 新增 |
| `fujian-none-panduan-0.json` | `provincial-福建-panduan-0.json` | 150 | 200 | 覆盖 |
| `fujian-none-panduan-1.json` | `provincial-福建-panduan-1.json` | 1 | 200 | 覆盖 |
| `fujian-none-panduan-2.json` | `provincial-福建-panduan-2.json` | — | 200 | 新增 |
| `fujian-none-panduan-3.json` | `provincial-福建-panduan-3.json` | — | 124 | 新增 |
| `fujian-none-shuliang-0.json` | `provincial-福建-shuliang-0.json` | 115 | 200 | 覆盖 |
| `fujian-none-shuliang-1.json` | `provincial-福建-shuliang-1.json` | — | 42 | 新增 |
| `fujian-none-yanyu-0.json` | `provincial-福建-yanyu-0.json` | 150 | 200 | 覆盖 |
| `fujian-none-yanyu-1.json` | `provincial-福建-yanyu-1.json` | 24 | 200 | 覆盖 |
| `fujian-none-yanyu-2.json` | `provincial-福建-yanyu-2.json` | — | 200 | 新增 |
| `fujian-none-yanyu-3.json` | `provincial-福建-yanyu-3.json` | — | 200 | 新增 |
| `fujian-none-yanyu-4.json` | `provincial-福建-yanyu-4.json` | — | 3 | 新增 |
| `fujian-none-ziliao-0.json` | `provincial-福建-ziliao-0.json` | 85 | 200 | 覆盖 |
| `fujian-none-ziliao-1.json` | `provincial-福建-ziliao-1.json` | — | 140 | 新增 |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 33,093 | 34,945 | +1,852 |
| 分片文件数 | 299 | 307 | +8 |
| 福建分片数 | 8 | 16 | +8 |
| 福建题目数 | 712 | 2,564 | +1,852 |
| 福建 index key 数 | 5 | 5 | 0 |
| 未触碰分片 / 题目 | 291 / 32,381 | 291 / 32,381 | 0 |
| index key 总数 | 167 | 167 | 0 |
| idMap 条目数 | 30,009 | 31,937 | +1,928 |

**影响面**：只替换 `provincial-福建-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 30,009 | 合并前线上反查表 |
| 删除旧福建 ID | 636 | 旧前缀 `prov-福建-*`；不做映射 |
| 新增新福建 ID | 2,564 | 新前缀 `prov-fujian-*` |
| 合并后 idMap | 31,937 | 按实际分片全量重建 |

- 旧福建 ID 仍被其他分片引用：**0**
- 新旧福建 ID 交集：**0**
- 旧福建 712 题对应 636 个唯一 ID（旧数据内部重复 76 条）；因此 idMap 净增 2,564 - 636 = +1,928。
- 重建方式：扫描合并后目录内全部分片，不只做福建增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 307 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 167 个 key 精确覆盖 307 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 31,937 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧福建 ID 交集：**0**
- 源 index 覆盖：**16/16**
- 源 `questions.json` 与分片一致：**是**（2,564 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-福建-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 福建旧数据（替换前） | 712 | 633 | 88.9% | 26 | 2 | 68 | 9 |
| 福建新数据（替换后） | 2,564 | 2,545 | 99.3% | 179 | 0 | 17 | 2 |
| 全库（合并后） | 34,945 | 33,482 | 95.8% | 2,827 | 22 | 1,079 | 362 |

福建可渲染题数：**633 → 2,545**（+1,912）；图片题占位：26 → 179。

## 6. ID 策略（A1：不迁移）

- 旧福建 ID：`prov-福建-*`，共 636 条，退出 idMap 636 条。
- 新福建 ID：`prov-fujian-*`，共 2,564 条，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；旧 ID 不再命中，属预期行为。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-fujian.cjs            # dry-run（本报告）
node scripts/publish-merge-fujian.cjs --apply    # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧福建分片 → 复制 16 个新分片（映射为 `provincial-福建-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：旧福建分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 失败回滚：用 git 恢复 `public/data/questions/` 后重新执行 dry-run。
- 不执行 `git push`。
