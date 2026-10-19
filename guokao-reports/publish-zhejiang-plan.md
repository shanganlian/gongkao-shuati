# 浙江 publish 合并计划（方案 A：并入 /data/questions/）

- 模式：**APPLIED（已写入）**
- 生成时间：2026-10-19T11:26:56.193Z
- 源目录：`public/data/questions-v2-provincial/浙江/`（ID 前缀 `prov-zhejiang-`）
- 目标目录：`public/data/questions/`（线上目录，国考 + 其他省 + 旧浙江）
- 分片映射：`zhejiang-none-<module>-<chunk>.json` → `provincial-浙江-<module>-<chunk>.json`

> loader（`src/hooks/useQuestions.ts`）按 `<category>-<province>-<module>` 解析 index key。
> 源分片名 `zhejiang-none-*` 会被解析成 `zhejiang / none / *`，浙江分类无法命中，
> 因此 publish 必须改名为 `provincial-浙江-*`；题目 ID 保持 `prov-zhejiang-*` 不变。

## 1. 变更清单

| 动作 | 文件数 | 旧题数 | 新题数 | 说明 |
|---|---:|---:|---:|---|
| 覆盖同名旧浙江分片 | 11 | 1,337 | 2,080 | 同名文件直接替换 |
| 新增浙江分片 | 16 | 0 | 2,663 | v2 分片更细，旧目录没有同名文件 |
| 删除多余旧浙江分片 | 0 | 0 | 0 | 旧分片名没有对应新分片，不删会残留旧题 |
| 未触碰（国考 / 其他省） | 272 | 28,350 | 28,350 | 文件与题目均保持 |

源分片合计 **27** 个 / **4,743** 道题；旧浙江分片 **11** 个 / **1,337** 道题。

### 1.1 分片替换清单

| 源文件 | 目标文件 | 旧题数 | 新题数 | 动作 |
|---|---|---:|---:|---|
| `zhejiang-none-changshi-0.json` | `provincial-浙江-changshi-0.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-changshi-1.json` | `provincial-浙江-changshi-1.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-changshi-2.json` | `provincial-浙江-changshi-2.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-changshi-3.json` | `provincial-浙江-changshi-3.json` | 143 | 80 | 覆盖 |
| `zhejiang-none-panduan-0.json` | `provincial-浙江-panduan-0.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-panduan-1.json` | `provincial-浙江-panduan-1.json` | 100 | 200 | 覆盖 |
| `zhejiang-none-panduan-2.json` | `provincial-浙江-panduan-2.json` | — | 200 | 新增 |
| `zhejiang-none-panduan-3.json` | `provincial-浙江-panduan-3.json` | — | 200 | 新增 |
| `zhejiang-none-panduan-4.json` | `provincial-浙江-panduan-4.json` | — | 200 | 新增 |
| `zhejiang-none-panduan-5.json` | `provincial-浙江-panduan-5.json` | — | 200 | 新增 |
| `zhejiang-none-panduan-6.json` | `provincial-浙江-panduan-6.json` | — | 170 | 新增 |
| `zhejiang-none-shuliang-0.json` | `provincial-浙江-shuliang-0.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-shuliang-1.json` | `provincial-浙江-shuliang-1.json` | 5 | 200 | 覆盖 |
| `zhejiang-none-shuliang-2.json` | `provincial-浙江-shuliang-2.json` | — | 200 | 新增 |
| `zhejiang-none-shuliang-3.json` | `provincial-浙江-shuliang-3.json` | — | 200 | 新增 |
| `zhejiang-none-shuliang-4.json` | `provincial-浙江-shuliang-4.json` | — | 19 | 新增 |
| `zhejiang-none-yanyu-0.json` | `provincial-浙江-yanyu-0.json` | 150 | 200 | 覆盖 |
| `zhejiang-none-yanyu-1.json` | `provincial-浙江-yanyu-1.json` | 56 | 200 | 覆盖 |
| `zhejiang-none-yanyu-2.json` | `provincial-浙江-yanyu-2.json` | — | 200 | 新增 |
| `zhejiang-none-yanyu-3.json` | `provincial-浙江-yanyu-3.json` | — | 200 | 新增 |
| `zhejiang-none-yanyu-4.json` | `provincial-浙江-yanyu-4.json` | — | 200 | 新增 |
| `zhejiang-none-yanyu-5.json` | `provincial-浙江-yanyu-5.json` | — | 200 | 新增 |
| `zhejiang-none-yanyu-6.json` | `provincial-浙江-yanyu-6.json` | — | 34 | 新增 |
| `zhejiang-none-ziliao-0.json` | `provincial-浙江-ziliao-0.json` | 133 | 200 | 覆盖 |
| `zhejiang-none-ziliao-1.json` | `provincial-浙江-ziliao-1.json` | — | 200 | 新增 |
| `zhejiang-none-ziliao-2.json` | `provincial-浙江-ziliao-2.json` | — | 200 | 新增 |
| `zhejiang-none-ziliao-3.json` | `provincial-浙江-ziliao-3.json` | — | 40 | 新增 |

## 2. 波及范围

| 指标 | 合并前 | 合并后 | 变化 |
|---|---:|---:|---:|
| 总题目数 | 29,687 | 33,093 | +3,406 |
| 分片文件数 | 283 | 299 | +16 |
| 浙江分片数 | 11 | 27 | +16 |
| 浙江题目数 | 1,337 | 4,743 | +3,406 |
| 浙江 index key 数 | 5 | 5 | 0 |
| 未触碰分片 / 题目 | 272 / 28,350 | 272 / 28,350 | 0 |
| index key 总数 | 167 | 167 | 0 |
| idMap 条目数 | 26,590 | 30,009 | +3,419 |

**影响面**：只替换 `provincial-浙江-*` 分片；国考 `national-*` 与其他省 `provincial-*` 文件不删不改，但全量 `index.json` / `idMap.json` 会按合并后的实际文件重建。

## 3. idMap 重建

| 项目 | 条目数 | 说明 |
|---|---:|---|
| 当前 idMap | 26,590 | 合并前线上反查表 |
| 删除旧浙江 ID | 1,324 | 旧前缀 `prov-浙江-*`；不做映射 |
| 新增新浙江 ID | 4,743 | 新前缀 `prov-zhejiang-*` |
| 合并后 idMap | 30,009 | 按实际分片全量重建 |

- 旧浙江 ID 仍被其他分片引用：**0**
- 新旧浙江 ID 交集：**0**
- 旧浙江 1,337 题对应 1,324 个唯一 ID（旧数据内部重复 13 条）；因此 idMap 净增 4,743 - 1,324 = +3,419。
- 重建方式：扫描合并后目录内全部分片，不只做浙江增量；国考 / 其他省 ID 一并写入。

## 4. 一致性检查（国考同款三项）

| # | 检查 | 结果 | 说明 |
|---|---|---|---|
| 1 | index 引用的分片都存在 | **通过** | 299 个分片，引用无悬空 |
| 2 | index 未遗漏 / 未多引分片 | **通过** | 167 个 key 精确覆盖 299 个实际分片 |
| 3 | idMap 覆盖全部题目 ID | **通过** | 30,009 个 ID 均可反查到存在的分片 |

补充预检：

- 新分片内部重复 ID：**0**
- 新分片与未触碰分片 ID 冲突：**0**
- 新旧浙江 ID 交集：**0**
- 源 index 覆盖：**27/27**
- 源 `questions.json` 与分片一致：**是**（4,743 题）
- 目标分片名可被 loader 解析：**是**（全部为 `provincial-浙江-*`）

## 5. 前端可渲染性预检

口径同 `src/lib/questionValidation.ts`：题干为空或客观题选项不足会被 `filterValidQuestions` 跳过。

| 数据集 | 题目数 | 可渲染 | 占比 | 图片题占位 | 跳过：空题干 | 跳过：选项不足 | 跳过：空选项文本 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 浙江旧数据（替换前） | 1,337 | 1,284 | 96.0% | 83 | 14 | 10 | 29 |
| 浙江新数据（替换后） | 4,743 | 4,679 | 98.7% | 650 | 0 | 64 | 0 |
| 全库（合并后） | 33,093 | 31,570 | 95.4% | 2,674 | 24 | 1,130 | 369 |

浙江可渲染题数：**1,284 → 4,679**（+3,395）；图片题占位：83 → 650。

## 6. ID 策略（A1：不迁移）

- 旧浙江 ID：`prov-浙江-*`，共 1,324 条，退出 idMap 1,324 条。
- 新浙江 ID：`prov-zhejiang-*`，共 4,743 条，写入 idMap。
- 新旧 ID 交集：**0**；**不做一一映射、不做错题记录迁移**。
- 错题本 / 复习 / 知识点筛选按 `idMap.json` 反查；旧 ID 不再命中，属预期行为。
- 对外更新文案照旧：**“题库已整体翻新，历史做题记录已重置”**。

## 7. 执行计划

```powershell
node scripts/publish-merge-zhejiang.cjs            # dry-run（本报告）
node scripts/publish-merge-zhejiang.cjs --apply    # 审核通过后执行
node scripts/verify-question-loading.cjs
npm run build
```

- `--apply` 执行顺序：删除多余旧浙江分片 → 复制 27 个新分片（映射为 `provincial-浙江-*`）→ 全量重建 `index.json` / `idMap.json`。
- `--apply` 自检：旧浙江分片清零、分片数 / 题目数与计划一致、index 精确覆盖、idMap 覆盖全部 ID；任一失败即中止。
- 失败回滚：用 git 恢复 `public/data/questions/` 后重新执行 dry-run。
- 不执行 `git push`。
