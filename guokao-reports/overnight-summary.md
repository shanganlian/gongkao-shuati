# 省考行测夜间转换汇总

- 开始：2026-10-21 18:18:25
- 结束：2026-10-21 18:18:39
- 入口：`node scripts/overnight-provinces.cjs`
- 隔离输出：`public/data/questions-v2-provincial/<省>/`
- 注意：本次运行未写入 `public/data/questions/` 与 `public/data/questions-v2/`，未执行 git push。

## 总览

| 省份 | 题本 | 成功/失败 | 题数 | 答案覆盖 | 解析覆盖 | 占位 | 图片 | ERROR | WARN | 输出 | 报告 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 湖南 | 18 | 18/0 | 2239 | 98.4% | 98.7% | 16 | 207 | 107 | 147 | `public/data/questions-v2-provincial/湖南/` | `guokao-reports/省考-湖南-转换/` |
| 湖北 | 19 | 19/0 | 2414 | 98.1% | 98.8% | 11 | 220 | 101 | 335 | `public/data/questions-v2-provincial/湖北/` | `guokao-reports/省考-湖北-转换/` |
| 江西 | 24 | 24/0 | 3164 | 97.2% | 97.5% | 31 | 249 | 240 | 210 | `public/data/questions-v2-provincial/江西/` | `guokao-reports/省考-江西-转换/` |

## 合计

- 总题数（含占位）：**7817**
- 有答案：**7645**（97.8%）
- 有解析：**7678**（98.2%）
- 占位题：**58**
- ERROR：**448**；WARN：**692**

## 分省报告

### 湖南

- 账本：`guokao-reports/省考-湖南-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-湖南-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-湖南-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-湖南-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-湖南-转换/paper-stats.json`
- 题本数：18；失败：0；占位：16；仅答案卷：0

### 湖北

- 账本：`guokao-reports/省考-湖北-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-湖北-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-湖北-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-湖北-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-湖北-转换/paper-stats.json`
- 题本数：19；失败：0；占位：11；仅答案卷：0

### 江西

- 账本：`guokao-reports/省考-江西-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-江西-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-江西-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-江西-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-江西-转换/paper-stats.json`
- 题本数：24；失败：0；占位：31；仅答案卷：0

## 复核建议（按优先级）

1. 先看各省 `known-losses.md` 的「原卷文本缺号」与「无答案/无解析」清单。
2. 再看 `exceptions.csv` 中 `ERROR` 记录，重点排查 `OPT_NOT_4`、`MISSING_ANSWER`、`QNO_GAP`。
3. 检查 `sample-20.md` 的 20 题是否满足：题干完整、A-D 四项、答案 A-D、解析非空。
4. 资料分析材料含图片的题目，需对照原 PDF/图片人工核对。
5. 全部确认后再决定是否合并到正式题库；本次未触碰正式目录。

## 运行日志

- `guokao-reports/overnight-run.log`
