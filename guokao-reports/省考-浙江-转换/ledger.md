# 省考-浙江-转换 账本

- 生成时间：2026-10-19 18:46:42
- 开始时间：2026-10-19 18:46:31
- 源目录：`source-data/34省考真题合集/浙江公务员考试真题`
- 输出目录：`public/data/questions-v2-provincial/浙江`
- 解析器：`scripts/convert-guokao.js` + `scripts/overnight-provinces.cjs`

## 总览

| 指标 | 数值 |
| --- | ---: |
| 题本数 | 39 |
| 成功解析题本 | 39 |
| 解析失败题本 | 0 |
| 总题数（含占位） | 4743 |
| 原卷文本缺号占位 | 57 |
| 有答案 | 4474（94.3%） |
| 有解析 | 4475（94.3%） |
| 图片题 | 650 |
| 错误（ERROR） | 641 |
| 警告（WARN） | 1126 |
| 答案文件缺失/解析为空卷 | 0 |
| 仅答案无解析卷 | 0 |

## 分卷明细

| 年份 | 卷别 | 题数 | 最大题号 | 占位 | 答案 | 解析 | 图片 | 错误 | 警告 | 状态 | 备注 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 2005 | 未标注 | 103 | 103 | 0 | 81 | 81 | 7 | 44 | 4 | OK | blocks=81, answers=81, quick=0 |
| 2006 | 未标注 | 135 | 135 | 33 | 99 | 99 | 2 | 106 | 27 | OK | blocks=118, answers=99, quick=0 |
| 2007 | 未标注 | 125 | 125 | 2 | 123 | 123 | 16 | 7 | 14 | OK | blocks=125, answers=123, quick=0 |
| 2008 | 未标注 | 130 | 130 | 0 | 110 | 110 | 22 | 42 | 19 | OK | blocks=110, answers=110, quick=0 |
| 2009 | 未标注 | 130 | 130 | 0 | 128 | 128 | 19 | 4 | 16 | OK | blocks=128, answers=128, quick=0 |
| 2010 | 未标注 | 130 | 130 | 0 | 130 | 130 | 13 | 0 | 12 | OK | blocks=130, answers=130, quick=0 |
| 2011 | 未标注 | 130 | 130 | 0 | 130 | 130 | 20 | 2 | 11 | OK | blocks=130, answers=130, quick=0 |
| 2012 | 未标注 | 130 | 130 | 0 | 129 | 129 | 20 | 3 | 12 | OK | blocks=129, answers=129, quick=0 |
| 2013 | A卷 | 130 | 130 | 0 | 128 | 128 | 20 | 6 | 12 | OK | blocks=128, answers=128, quick=0 |
| 2013 | B卷 | 120 | 120 | 0 | 120 | 120 | 25 | 0 | 12 | OK | blocks=120, answers=120, quick=0 |
| 2014 | A卷 | 130 | 130 | 0 | 126 | 126 | 22 | 12 | 10 | OK | blocks=126, answers=126, quick=0 |
| 2014 | B卷 | 120 | 120 | 0 | 117 | 117 | 22 | 9 | 10 | OK | blocks=117, answers=117, quick=0 |
| 2015 | A卷 | 125 | 125 | 0 | 122 | 122 | 14 | 9 | 10 | OK | blocks=122, answers=122, quick=0 |
| 2015 | B卷 | 120 | 120 | 0 | 117 | 117 | 10 | 9 | 8 | OK | blocks=117, answers=117, quick=0 |
| 2016 | A卷 | 125 | 125 | 0 | 125 | 125 | 15 | 4 | 12 | OK | blocks=125, answers=125, quick=0 |
| 2016 | B卷 | 120 | 120 | 0 | 119 | 119 | 17 | 6 | 14 | OK | blocks=119, answers=119, quick=0 |
| 2017 | A卷 | 125 | 125 | 0 | 125 | 125 | 16 | 0 | 13 | OK | blocks=125, answers=125, quick=0 |
| 2017 | B卷 | 120 | 120 | 0 | 120 | 120 | 17 | 0 | 15 | OK | blocks=120, answers=120, quick=0 |
| 2018 | A卷 | 140 | 140 | 2 | 138 | 138 | 17 | 7 | 13 | OK | blocks=140, answers=138, quick=0 |
| 2018 | B卷 | 140 | 140 | 0 | 140 | 140 | 16 | 0 | 16 | OK | blocks=140, answers=140, quick=0 |
| 2019 | A类 | 130 | 130 | 0 | 130 | 130 | 22 | 0 | 19 | OK | blocks=130, answers=130, quick=0 |
| 2019 | B类 | 130 | 130 | 0 | 130 | 130 | 24 | 0 | 18 | OK | blocks=130, answers=130, quick=0 |
| 2020 | 选调 | 55 | 55 | 0 | 54 | 54 | 9 | 2 | 41 | OK | blocks=54, answers=54, quick=0 |
| 2020 | A卷 | 100 | 100 | 0 | 100 | 100 | 9 | 2 | 8 | OK | blocks=100, answers=100, quick=0 |
| 2020 | B卷 | 100 | 100 | 0 | 100 | 100 | 10 | 0 | 10 | OK | blocks=100, answers=100, quick=0 |
| 2021 | A类 | 130 | 130 | 0 | 130 | 130 | 16 | 0 | 134 | OK | blocks=130, answers=130, quick=0 |
| 2021 | B类 | 125 | 125 | 0 | 124 | 124 | 16 | 4 | 9 | OK | blocks=124, answers=124, quick=0 |
| 2021 | C类 | 120 | 120 | 0 | 118 | 118 | 14 | 4 | 113 | OK | blocks=118, answers=118, quick=0 |
| 2022 | A类 | 125 | 125 | 1 | 124 | 124 | 20 | 4 | 5 | OK | blocks=125, answers=124, quick=0 |
| 2022 | C类 | 120 | 120 | 1 | 118 | 118 | 20 | 6 | 5 | OK | blocks=119, answers=118, quick=0 |
| 2023 | A类 | 125 | 125 | 4 | 112 | 112 | 15 | 31 | 13 | OK | blocks=116, answers=112, quick=0 |
| 2023 | B类 | 120 | 120 | 4 | 107 | 107 | 13 | 31 | 12 | OK | blocks=111, answers=107, quick=0 |
| 2023 | C类 | 115 | 115 | 4 | 95 | 96 | 11 | 44 | 11 | OK | blocks=100, answers=96, quick=0 |
| 2024 | A类 | 125 | 125 | 1 | 124 | 124 | 21 | 4 | 9 | OK | blocks=125, answers=124, quick=0 |
| 2024 | B类 | 120 | 120 | 1 | 119 | 119 | 19 | 4 | 9 | OK | blocks=120, answers=119, quick=0 |
| 2024 | C类 | 115 | 115 | 1 | 114 | 114 | 19 | 4 | 8 | OK | blocks=115, answers=114, quick=0 |
| 2025 | A类 | 125 | 125 | 1 | 124 | 124 | 23 | 4 | 159 | OK | blocks=125, answers=124, quick=0 |
| 2025 | B类 | 120 | 120 | 1 | 119 | 119 | 21 | 4 | 147 | OK | blocks=120, answers=119, quick=0 |
| 2025 | C类 | 115 | 115 | 1 | 5 | 5 | 18 | 223 | 136 | OK | blocks=5, answers=5, quick=0 |

## 模块分布

| 模块 | 题数 | 有答案 | 有解析 | 占位 | 图片 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 常识（changshi） | 680 | 643 | 643 | 12 | 18 |
| 言语（yanyu） | 1234 | 1154 | 1154 | 10 | 25 |
| 数量（shuliang） | 819 | 761 | 761 | 6 | 193 |
| 判断（panduan） | 1370 | 1325 | 1325 | 4 | 335 |
| 资料（ziliao） | 640 | 591 | 592 | 25 | 79 |

## 异常代码统计

| 代码 | 次数 |
| --- | ---: |
| MODULE_INFERRED | 612 |
| IMAGE_OPTION | 355 |
| MISSING_ANSWER | 269 |
| MISSING_ANALYSIS | 268 |
| MATERIAL_MISSING | 90 |
| OPT_NOT_4 | 64 |
| MATERIAL_IMAGE | 64 |
| ANSWER_CONFLICT | 18 |
| QNO_PLACEHOLDER | 14 |
| OPT_SPLIT_FAIL | 7 |
| OPT_PARTIAL | 5 |
| ANSWER_COVERAGE_LOW | 1 |

## 产物

- `exceptions.csv`：逐条异常（含题号、模块、来源文件）
- `sample-20.md` / `sample-20.json`：20 题完整字段样本
- `known-losses.md`：已知损失与人工复核清单
- `paper-stats.json`：机器可读分卷统计
