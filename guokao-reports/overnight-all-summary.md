# 省考行测全量转换汇总

- 开始：2026-10-22 21:09:32
- 结束：2026-10-22 21:09:46
- 入口：`node scripts/overnight-provinces.cjs`
- 隔离输出：`public/data/questions-v2-provincial/<省>/`
- 范围：源目录 33 个；本批新增转换 27 个；既有六省 6 个仅重算报告与语义扫描。
- 口径说明：任务描述称新增 28 省，但当前源目录实际为 33 个；排除已上线六省后为 27 个。本汇总按实际目录如实记录，不补造省份。
- 注意：本次运行未写入 `public/data/questions/` 与 `public/data/questions-v2/`，未执行 git push。

## 总览

| 省份 | 题本 | 成功/失败 | 题数 | 答案覆盖 | 解析覆盖 | 配齐率 | 占位 | 图片 | ERROR | WARN | 输出 | 报告 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 广东 | 37 | 37/0 | 3854 | 81.2% | 81.7% | 73.5% | 504 | 451 | 2002 | 1014 | `public/data/questions-v2-provincial/广东/` | `guokao-reports/省考-广东-转换/` |
| 深圳 | 19 | 19/0 | 1862 | 88.0% | 86.5% | 79.6% | 191 | 188 | 702 | 301 | `public/data/questions-v2-provincial/深圳/` | `guokao-reports/省考-深圳-转换/` |
| 天津 | 20 | 20/0 | 2431 | 82.9% | 83.4% | 79.2% | 266 | 204 | 1125 | 446 | `public/data/questions-v2-provincial/天津/` | `guokao-reports/省考-天津-转换/` |

## 合计

- 总题数（含占位）：**8147**
- 有答案：**6783**（83.3%）
- 有解析：**6786**（83.3%）
- 答案+解析+四选项全配齐：**6239**（76.6%）
- 占位题：**961**
- ERROR：**3829**；WARN：**1761**

## 分省报告

### 广东

- 处理方式：本轮新增转换
- 账本：`guokao-reports/省考-广东-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-广东-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-广东-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-广东-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-广东-转换/paper-stats.json`
- 题本数：37；失败：0；占位：504；仅答案卷：0

### 深圳

- 处理方式：本轮新增转换
- 账本：`guokao-reports/省考-深圳-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-深圳-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-深圳-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-深圳-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-深圳-转换/paper-stats.json`
- 题本数：19；失败：0；占位：191；仅答案卷：0

### 天津

- 处理方式：本轮新增转换
- 账本：`guokao-reports/省考-天津-转换/ledger.md`
- 异常 CSV：`guokao-reports/省考-天津-转换/exceptions.csv`
- 20 题样本：`guokao-reports/省考-天津-转换/sample-20.md`
- 已知损失：`guokao-reports/省考-天津-转换/known-losses.md`
- 机器统计：`guokao-reports/省考-天津-转换/paper-stats.json`
- 题本数：20；失败：0；占位：266；仅答案卷：0

## 复核建议（按优先级）

1. 先看各省 `known-losses.md` 的「原卷文本缺号」与「无答案/无解析」清单。
2. 再看 `exceptions.csv` 中 `ERROR` 记录，重点排查 `OPT_NOT_4`、`MISSING_ANSWER`、`QNO_GAP`。
3. 检查 `sample-20.md` 的 20 题是否满足：题干完整、A-D 四项、答案 A-D、解析非空。
4. 资料分析材料含图片的题目，需对照原 PDF/图片人工核对。
5. 全部确认后再决定是否合并到正式题库；本次未触碰正式目录。

## 运行日志

- `guokao-reports/overnight-run.log`
