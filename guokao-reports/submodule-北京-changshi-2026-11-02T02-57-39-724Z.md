# 二级分类写回报告

- 生成时间：2026-11-02T02:57:39.723Z
- 范围：北京 / 常识判断
- 模型：deepseek-flash（submodule-v2）
- 分片：4 个；匹配题目：656 道
- 已有分类：639 道；待处理：17 道；本次实际处理：17 道
- 本次成功：17 道；缓存命中：0 道；失败：0 道；低置信：37 道
- 源目录同步：5 个文件 / 1,312 道题
- 耗时：2.8 秒；单请求平均 0.2 秒；按并发 8 估算每千题约 0.3 分钟
- 费用：本次 $0.0036（峰值价，约 ¥0.025）；每千题约 $0.2099（约 ¥1.49）

## 子类分布

| 模块 | 子类 | 题量 |
|---|---|---:|
| 常识判断 | 政治时政 | 250 |
| 常识判断 | 法律 | 130 |
| 常识判断 | 地理国情 | 53 |
| 常识判断 | 经济管理 | 54 |
| 常识判断 | 人文历史 | 82 |
| 常识判断 | 科技 | 65 |
| 常识判断 | 生活常识 | 22 |

## 低置信题

共 37 道，完整清单见 `submodule-北京-changshi-2026-11-02T02-57-39-724Z-low-confidence.csv`。

| 题目 ID | 子类 | 理由 |
|---|---|---|
| prov-beijing-2009-社招-61 | 经济管理 | 已有字段 |
| prov-beijing-2009-应届-58 | 人文历史 | 已有字段 |
| prov-beijing-2010-未标注-2 | 政治时政 | 已有字段 |
| prov-beijing-2010-未标注-3 | 生活常识 | 已有字段 |
| prov-beijing-2010-未标注-4 | 地理国情 | 世界地球日属环保节日，题干与解析不符，存疑 |
| prov-beijing-2010-未标注-7 | 人文历史 | 已有字段 |
| prov-beijing-2010-未标注-8 | 地理国情 | 已有字段 |
| prov-beijing-2010-未标注-10 | 地理国情 | 已有字段 |
| prov-beijing-2010-未标注-12 | 政治时政 | 已有字段 |
| prov-beijing-2010-未标注-18 | 科技 | 已有字段 |
| prov-beijing-2010-未标注-19 | 地理国情 | 已有字段 |
| prov-beijing-2010-未标注-21 | 地理国情 | 已有字段 |
| prov-beijing-2010-未标注-22 | 政治时政 | 已有字段 |
| prov-beijing-2010-未标注-23 | 政治时政 | 已有字段 |
| prov-beijing-2010-未标注-24 | 生活常识 | 已有字段 |
| prov-beijing-2010-未标注-25 | 人文历史 | 已有字段 |
| prov-beijing-2012-未标注-2 | 政治时政 | 已有字段 |
| prov-beijing-2012-未标注-3 | 政治时政 | 已有字段 |
| prov-beijing-2012-未标注-4 | 法律 | 已有字段 |
| prov-beijing-2012-未标注-5 | 政治时政 | 已有字段 |
| prov-beijing-2012-未标注-6 | 政治时政 | 已有字段 |
| prov-beijing-2013-未标注-26 | 政治时政 | 已有字段 |
| prov-beijing-2014-未标注-29 | 经济管理 | 已有字段 |
| prov-beijing-2020-未标注-6 | 生活常识 | 已有字段 |
| prov-beijing-2020-乡镇-8 | 生活常识 | 已有字段 |
| prov-beijing-2023-未标注-15 | 政治时政 | 已有字段 |
| prov-beijing-2023-未标注-17 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-18 | 政治时政 | 已有字段 |
| prov-beijing-2023-未标注-19 | 政治时政 | 题干选项均缺失，无法判断，暂归政治时政 |
| prov-beijing-2023-未标注-20 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-21 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-22 | 政治时政 | 已有字段 |
| prov-beijing-2023-未标注-23 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-24 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-25 | 法律 | 已有字段 |
| prov-beijing-2023-未标注-26 | 政治时政 | 已有字段 |
| prov-beijing-2023-未标注-27 | 政治时政 | 已有字段 |

## 人工核对抽样

已抽取 50 题，填写 `submodule-北京-changshi-2026-11-02T02-57-39-724Z-review-sample.csv` 的「人工判定」列后运行 `node scripts/evaluate-submodule-sample.cjs --file "submodule-北京-changshi-2026-11-02T02-57-39-724Z-review-sample.csv"`。

## 输出文件

- JSON：`submodule-北京-changshi-2026-11-02T02-57-39-724Z.json`
- 低置信 CSV：`submodule-北京-changshi-2026-11-02T02-57-39-724Z-low-confidence.csv`
- 抽样 CSV：`submodule-北京-changshi-2026-11-02T02-57-39-724Z-review-sample.csv`
