# 省考行测夜间转换汇总

- 开始：2026-10-19 18:46:31
- 结束：2026-10-19 18:46:53
- 入口：`node scripts/overnight-provinces.cjs`
- 隔离输出：`public/data/questions-v2-provincial/<省>/`
- 注意：本次运行未写入 `public/data/questions/` 与 `public/data/questions-v2/`，未执行 git push。
- 福建重出：2026-10-19 21:43:51（按修复后数据 `--reports-only` 重算账本与样本；浙江/安徽仍为 18:46 运行结果）

## 总览

| 省份 | 题本 | 成功/失败 | 题数 | 答案覆盖 | 解析覆盖 | 占位 | 图片 | ERROR | WARN | 输出 | 报告 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 浙江 | 39 | 39/0 | 4743 | 94.3% | 94.3% | 57 | 650 | 641 | 1126 | `public/data/questions-v2-provincial/浙江/` | `guokao-reports/省考-浙江-转换/` |
| 福建 | 21 | 21/0 | 2564 | 97.1% | 97.2% | 11 | 179 | 183 | 270 | `public/data/questions-v2-provincial/福建/` | `guokao-reports/省考-福建-转换/` |
| 安徽 | 21 | 21/0 | 2322 | 96.7% | 96.9% | 29 | 235 | 201 | 314 | `public/data/questions-v2-provincial/安徽/` | `guokao-reports/省考-安徽-转换/` |

## 合计

- 总题数（含占位）：**9629**
- 有答案：**9209**（95.6%）
- 有解析：**9218**（95.7%）
- 占位题：**97**
- ERROR：**1025**；WARN：**1710**

## 分省报告

### 浙江

- 账本：`guokao-reports/省考-浙江-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-浙江-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-浙江-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-浙江-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-浙江-转换/paper-stats.json`
- 题本数：39；失败：0；占位：57；仅答案卷：0

### 福建

- 账本：`guokao-reports/省考-福建-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-福建-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-福建-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-福建-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-福建-转换/paper-stats.json`
- 题本数：21；失败：0；占位：11；仅答案卷：0
- 回归样本：`prov-fujian-2011-917联考-11`（已强制纳入 `sample-20.md`）

### 安徽

- 账本：`guokao-reports/省考-安徽-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-安徽-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-安徽-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-安徽-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-安徽-转换/paper-stats.json`
- 题本数：21；失败：0；占位：29；仅答案卷：0

## 复核建议（按优先级）

1. 先看各省 `known-losses.md` 的「原卷文本缺号」与「无答案/无解析」清单。
2. 再看 `exceptions.csv` 中 `ERROR` 记录，重点排查 `OPT_NOT_4`、`MISSING_ANSWER`、`QNO_GAP`。
3. 检查 `sample-20.md` 的 20 题是否满足：题干完整、A-D 四项、答案 A-D、解析非空。
4. 资料分析材料含图片的题目，需对照原 PDF/图片人工核对。
5. 全部确认后再决定是否合并到正式题库；本次未触碰正式目录。

## 运行日志

- `guokao-reports/overnight-run.log`
