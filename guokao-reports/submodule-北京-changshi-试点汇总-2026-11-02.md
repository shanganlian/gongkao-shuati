# 北京 · 常识判断二级分类试点汇总

- 生成时间：2026-11-02
- 范围：`public/data/questions/provincial-北京-changshi-*.json`（4 个分片）
- 源目录：`public/data/questions-v2-provincial/北京/`（已同步，含 `questions.json`）
- 模型：`deepseek-flash`（关闭 thinking，`submodule-v2` prompt）
- 结论：**656/656 全部写回，0 失败，37 道 low（5.6%）**；用户反馈核对通过（抽样 CSV 的「人工判定」列仍为空，具体准确率未落盘）；全库任务已启动。

## 1. 题量差异

需求写的是“北京常识 900 题”，当前线上/源目录实际都是 **656 题**（200 + 200 + 200 + 56）。本报告按实际 656 题执行，没有补造题目。

## 2. 子类分布

| 子类 | 题量 | 占比 |
|---|---:|---:|
| 政治时政 | 250 | 38.1% |
| 法律 | 130 | 19.8% |
| 人文历史 | 82 | 12.5% |
| 科技 | 65 | 9.9% |
| 经济管理 | 54 | 8.2% |
| 地理国情 | 53 | 8.1% |
| 生活常识 | 22 | 3.4% |
| **合计** | **656** | **100%** |

## 3. 耗时与费用

| 指标 | 实测 |
|---|---:|
| 总墙钟耗时 | 171.7 秒（约 2.9 分钟） |
| 并发 | 8 |
| 处理题量 | 656 道（0 失败；含 17 道补跑） |
| 每题平均墙钟 | 0.26 秒 |
| 每千题耗时（按本次并发外推） | **约 4.4 分钟** |
| 总 token（按成功写入的 656 条 checkpoint 汇总） | 606,456（输入 547,908 / 输出 58,548；缓存命中 327,289 / 未命中 220,619） |
| 总费用（峰值价） | **$0.1384**（约 **¥0.98**） |
| 每千题费用（峰值价） | **$0.2110**（约 **¥1.50**） |
| 每千题费用（off-peak 半价） | 约 **¥0.75** |

> 单价口径：DeepSeek 官方 `deepseek-flash` 峰时输入（缓存命中/未命中）$0.006 / $0.30 每 1M，输出 $1.20 每 1M；汇率按 7.1。费用按成功写入题目的 token 汇总，未计失败重试的少量 token，实际账单会略高；以 DeepSeek 控制台为准。

### 3.1 全库预估（仅行测五模块，基于本次单价/速度）

| 模块 | 题量 |
|---|---:|
| 常识判断 | 16,584 |
| 言语理解 | 25,820 |
| 判断推理 | 26,745 |
| 数量关系 | 12,079 |
| 资料分析 | 14,050 |
| **合计** | **95,278** |

- 并发 8：约 **7.0 小时**；峰值价约 **¥143**（off-peak 约 **¥71**）。
- 资料分析材料更长，实际 token 可能比常识高 10%~30%；全库跑之前建议先跑 500 题跨模块小样校准。
- 全库命令（人工核对 ≥90% 后再执行）：

```powershell
node scripts/classify-submodules.cjs --province all --module all --apply --sync-source --review-sample 50 --concurrency 8
```

## 4. 低置信题

- 共 37 道，`subModule_confidence=low`，已进入人工复核清单。
- 完整清单：`guokao-reports/submodule-北京-changshi-2026-11-02T02-58-29-775Z-low-confidence.csv`
- 主要集中在：
  - 2023 年题干/选项缺失的题（多道）；
  - 2010 年题干与解析错配的题；
  - 多选/图片选项题（绿色食品标志等）。

## 5. 50 题人工核对抽样

- 抽样文件：`guokao-reports/submodule-北京-changshi-2026-11-02T02-58-29-775Z-review-sample.csv`
- 分层抽样 50 题，覆盖 7 个子类；截至本报告更新时，`人工判定`、`是否正确`、`备注` 列仍为空，因此具体准确率无法由脚本复算（按用户反馈视为核对通过）。
- 填写后执行：

```powershell
node scripts/evaluate-submodule-sample.cjs --file "guokao-reports/submodule-北京-changshi-2026-11-02T02-58-29-775Z-review-sample.csv"
```

- 准确率 ≥90% 再进入全库；低于 90% 先调整 prompt/人工修正，不跑全量。

## 6. 数据写入与回滚

- 写回字段：
  - `subModule`：二级分类名；
  - `subModule_confidence`：`high` / `low`。
- 写回前备份：`guokao-reports/submodule-backups/2026-11-02T02-52-19-335Z/`（首轮 target）与 `.../2026-11-02T02-57-39-724Z/source/`（源目录）。
- 源目录同步：5 个文件 / 1,312 条字段（4 个分片 + `questions.json` 中各 656 条）。
- `index.json` / `idMap.json` 未变化，`npm run index:check` 通过。

## 7. 前端

- 练习页模块 pills 下方新增二级分类 chips；
- 仅展示当前“考试 + 省份 + 模块”范围**确实有已分类题目**的子类，避免未分类省份出现空 chips 或点进空分类；
- `subModule_confidence=low` 的暂定分类不进入二级筛选（仍在“全部”里正常显示），人工复核后再转为 high；
- 与省份筛选叠加；切模块、切省份或当前子类无数据时自动回到“全部”；
- 相关代码：`src/components/PracticeArena.tsx`、`src/hooks/useQuestions.ts`、`src/data/subModules.ts`、`shared/sub-modules.json`。

## 8. 全库与发布

- 全库（所有省份 × 五个模块）分类：已按用户指示启动，命令为
  `node scripts/classify-submodules.cjs --province all --module all --apply --sync-source --review-sample 50 --concurrency 16`；
  报告完成后写入 `guokao-reports/submodule-all-all-<时间戳>.md`，汇总见 `submodule-全库-汇总-2026-11-02.md`。
- 全库结束后自动执行国考 + 省考源目录同步、数据校验与 `index:check`；状态文件在
  `%TEMP%\submodule-postrun-status.txt`。
- 真实 `release:data` / `release:frontend` 上传：本机 SSH 非免密，需要人工输入服务器密码；等全库任务结束、源同步完成后再执行。
