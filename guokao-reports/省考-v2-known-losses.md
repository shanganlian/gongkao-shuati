# 省考 v2 known-losses 账本

> 记录**已知且接受**的数据损失，不计入待修缺陷。记账口径参照国考 `guokao-reports/v2-known-losses.md`
> （国考 144 道「无官方答案」即按此口径放行）。新增条目需注明原因与产品决策。
> 数据源：`public/data/questions-v2-provincial/`（2026-10-22，上海 / 深圳 / 黑龙江 / 天津 / 广东 修复版）。

## 1. 源册缺失导致的答案缺口（P2 源册补录，不阻塞 publish）

| # | 省 | 年份-卷别 | 有效题数 | 有答案 | 缺口 | 原因 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 天津 | 2025 | 114 | 13 | **101** | 源册仅 5KB，只带 13 题答案；其余题目答案表未收录 |
| 2 | 上海 | 2007 | — | — | **13** | 源册答案表缺 13 题 |
| 3 | 广东 | 2008 | — | — | **24** | 源册为裸字母答案，24 题无对应答案 |
| 4 | 黑龙江 | 2010 | — | — | **53** | 源册答案表缺 53 题 |
| 5 | 广东 | 2021 县级 | 9 | — | **整卷截断** | 源 docx 约 2KB，题本在转换前已被截断（非解析规则问题） |

**决策**：接受为 known-loss，**不补占位文本、不臆造答案**；上述缺口在后续「批量 OCR / 源册补录」波次统一处理。
补录完成后须重跑 `node scripts/overnight-provinces.cjs --province <省>` 重转，再走 publish dry-run → apply → 校验 → 构建。

## 2. `--drop-uncovered` 删除的旧申论分片（主观题缺口）

五省首次按新管线全量替换时，旧 `provincial-<省>-shenlun-0.json` 不在 v2 客观题源目录内，按 `--drop-uncovered` 一并删除：

| 省 | 删除的旧分片 | 题数 | 备注 |
| --- | --- | --- | --- |
| 上海 | `provincial-上海-shenlun-0.json` | 8 | 旧 ID `prov-上海-*`，可从 Git 历史取回原文 |
| 黑龙江 | `provincial-黑龙江-shenlun-0.json` | 6 | 同上 |
| 天津 | `provincial-天津-shenlun-0.json` | 1 | 同上 |
| 广东 | `provincial-广东-shenlun-0.json` | 7 | 同上 |
| 深圳 | — | 0 | 旧数据无申论分片 |

**决策**：与安徽申论 12 题先例一致——客观题全量替换优先，旧申论分片接受为 known-loss，
待正规申论转换流水线（`scripts/convert-provincial-shenlun.cjs`）补录后重建 `index.json` / `idMap.json`。

## 3. 同批处理但不计入 known-loss

- **广东旧分片混入外省 ID**：旧 14 个 `provincial-广东-*` 分片中 252 个唯一 ID 属于贵州 / 海南等省，
  随旧分片整体替换 / 删除一并消失，不迁移、不合并；`publish-merge-provinces.cjs` 现仅对**保留件**校验 ID 前缀，
  被替换 / 删除的旧分片混入外省 ID 只记数不阻塞（本轮 `badOldIds=252`，`badKeptIds=0`）。
- **图片题 / 公式题选项文本化丢失**：沿用国考 `v2-known-losses.md` 第 1 节口径（`isImageQuestion: true` + 占位渲染），
  省考侧不单独记账。
