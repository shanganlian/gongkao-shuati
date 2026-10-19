# 省考-安徽-转换 账本

- 生成时间：2026-10-19 18:46:53
- 开始时间：2026-10-19 18:46:31
- 源目录：`source-data/34省考真题合集/安徽省公务员考试真题`
- 输出目录：`public/data/questions-v2-provincial/安徽`
- 解析器：`scripts/convert-guokao.js` + `scripts/overnight-provinces.cjs`

## 总览

| 指标 | 数值 |
| --- | ---: |
| 题本数 | 21 |
| 成功解析题本 | 21 |
| 解析失败题本 | 0 |
| 总题数（含占位） | 2322 |
| 原卷文本缺号占位 | 29 |
| 有答案 | 2246（96.7%） |
| 有解析 | 2250（96.9%） |
| 图片题 | 235 |
| 错误（ERROR） | 201 |
| 警告（WARN） | 314 |
| 答案文件缺失/解析为空卷 | 0 |
| 仅答案无解析卷 | 0 |

## 分卷明细

| 年份 | 卷别 | 题数 | 最大题号 | 占位 | 答案 | 解析 | 图片 | 错误 | 警告 | 状态 | 备注 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 2006 | 未标注 | 100 | 100 | 2 | 98 | 98 | 11 | 7 | 10 | OK | blocks=100, answers=98, quick=0 |
| 2007 | 未标注 | 100 | 100 | 7 | 76 | 76 | 10 | 58 | 10 | OK | blocks=83, answers=76, quick=0 |
| 2008 | 未标注 | 140 | 140 | 0 | 140 | 140 | 12 | 0 | 13 | OK | blocks=140, answers=140, quick=0 |
| 2009 | 未标注 | 140 | 140 | 0 | 140 | 140 | 14 | 0 | 18 | OK | blocks=140, answers=140, quick=0 |
| 2010 | 未标注 | 130 | 130 | 0 | 129 | 130 | 11 | 1 | 11 | OK | blocks=130, answers=130, quick=0 |
| 2011 | 未标注 | 130 | 130 | 0 | 130 | 130 | 13 | 0 | 13 | OK | blocks=130, answers=130, quick=0 |
| 2012 | 未标注 | 130 | 130 | 0 | 130 | 130 | 13 | 1 | 12 | OK | blocks=130, answers=130, quick=0 |
| 2013 | 未标注 | 140 | 140 | 0 | 137 | 137 | 7 | 13 | 8 | OK | blocks=137, answers=137, quick=0 |
| 2014 | 未标注 | 110 | 110 | 0 | 108 | 108 | 11 | 7 | 7 | OK | blocks=108, answers=108, quick=0 |
| 2015 | 联考 | 110 | 110 | 0 | 105 | 105 | 7 | 12 | 7 | OK | blocks=105, answers=105, quick=0 |
| 2016 | 联考 | 110 | 110 | 1 | 101 | 101 | 8 | 20 | 5 | OK | blocks=102, answers=101, quick=0 |
| 2017 | 联考 | 110 | 110 | 0 | 110 | 110 | 10 | 0 | 8 | OK | blocks=110, answers=110, quick=0 |
| 2018 | 联考 | 110 | 110 | 2 | 108 | 108 | 9 | 7 | 6 | OK | blocks=110, answers=108, quick=0 |
| 2019 | 联考 | 110 | 110 | 0 | 109 | 110 | 8 | 1 | 6 | OK | blocks=110, answers=110, quick=0 |
| 2020 | 未标注 | 110 | 110 | 0 | 110 | 110 | 18 | 2 | 9 | OK | blocks=110, answers=110, quick=0 |
| 2020 | 选调 | 40 | 40 | 0 | 38 | 40 | 3 | 2 | 3 | OK | blocks=40, answers=40, quick=0 |
| 2021 | 未标注 | 110 | 110 | 0 | 108 | 108 | 16 | 6 | 8 | OK | blocks=108, answers=108, quick=0 |
| 2022 | 未标注 | 110 | 110 | 0 | 109 | 109 | 12 | 2 | 3 | OK | blocks=109, answers=109, quick=0 |
| 2023 | 未标注 | 47 | 47 | 17 | 25 | 25 | 0 | 62 | 1 | OK | blocks=39, answers=25, quick=0 |
| 2024 | 未标注 | 110 | 110 | 0 | 110 | 110 | 28 | 0 | 5 | OK | blocks=110, answers=110, quick=0 |
| 2025 | 未标注 | 125 | 125 | 0 | 125 | 125 | 14 | 0 | 151 | OK | blocks=125, answers=125, quick=0 |

## 模块分布

| 模块 | 题数 | 有答案 | 有解析 | 占位 | 图片 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 常识（changshi） | 465 | 450 | 451 | 0 | 15 |
| 言语（yanyu） | 501 | 487 | 487 | 1 | 13 |
| 数量（shuliang） | 406 | 371 | 373 | 26 | 60 |
| 判断（panduan） | 656 | 648 | 649 | 2 | 127 |
| 资料（ziliao） | 294 | 290 | 290 | 0 | 20 |

## 异常代码统计

| 代码 | 次数 |
| --- | ---: |
| IMAGE_OPTION | 136 |
| MODULE_INFERRED | 125 |
| MISSING_ANSWER | 76 |
| MISSING_ANALYSIS | 72 |
| OPT_NOT_4 | 33 |
| MATERIAL_IMAGE | 26 |
| MATERIAL_MISSING | 25 |
| ANSWER_CONFLICT | 9 |
| QNO_PLACEHOLDER | 5 |
| OPT_SPLIT_FAIL | 4 |
| OPT_PARTIAL | 2 |
| OPT_EMPTY | 2 |

## 产物

- `exceptions.csv`：逐条异常（含题号、模块、来源文件）
- `sample-20.md` / `sample-20.json`：20 题完整字段样本
- `known-losses.md`：已知损失与人工复核清单
- `paper-stats.json`：机器可读分卷统计
