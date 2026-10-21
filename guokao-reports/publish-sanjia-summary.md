# 湘鄂赣 publish 批量执行汇总（已 apply）

- 执行完成：2026-10-21T11:17:21Z
- 基线：`public/data/questions/` 执行前 **315 个分片 / 36,670 题 / 166 个 index key / 33,735 条 idMap**
- 口径：同浙 / 闽 / 皖 publish 模式；三省均使用 `--drop-uncovered`，旧 `provincial-<省>-*` 分片全量替换，旧 ID 不迁移（A1）
- 发布前已对三省 v2 执行福建同款空格清洗（选项 / 解析 / keyPoints；题干与标题未清洗）

## 三份报告

| 省 | 报告 | 源分片 / 题 | 旧分片 / 题 | 变更文件（覆盖/新增/删除） | 按 315 基线单独 dry-run |
|---|---|---:|---:|---|---|
| 湖南 | `guokao-reports/publish-hunan-plan.md` | 14 / 2,239 | 9 / 780 | 15（8 / 6 / 1） | 320 分片 / 38,129 题 / 165 keys / 35,213 idMap |
| 湖北 | `guokao-reports/publish-hubei-plan.md` | 15 / 2,414 | 10 / 973 | 15（10 / 5 / 0） | 320 分片 / 38,111 题 / 166 keys / 35,332 idMap |
| 江西 | `guokao-reports/publish-jiangxi-plan.md` | 17 / 3,164 | 12 / 1,350 | 18（11 / 6 / 1） | 320 分片 / 38,484 题 / 165 keys / 35,732 idMap |

> 上表最后一列为三省各自单独按 315 分片基线 dry-run 的理论值；实际连续执行后的累计值见下表。

## 逐省 apply 累计基线

| 步骤 | 分片 | 题目 | index keys | idMap |
|---|---:|---:|---:|---:|
| 当前基线 | 315 | 36,670 | 166 | 33,735 |
| ① 湖南 apply | 320 | 38,129 | 165 | 35,213 |
| ② 湖北 apply | 325 | 39,570 | 165 | 36,810 |
| ③ 江西 apply | 330 | 41,384 | 164 | 38,807 |

## 三项检查结论

| 省 | 增减对账 | 零越界 | 索引一致 |
|---|---|---|---|
| 湖南 | 315 − 9 + 14 = 320；36,670 − 780 + 2,239 = 38,129 ✅ | 15 个变更文件全部命中 `provincial-湖南-*`；国考 / 其他省 0 改动 ✅ | index 320 个分片无悬空、165 keys 精确覆盖；idMap 35,213 条全覆盖 ✅ |
| 湖北 | 315 − 10 + 15 = 320；36,670 − 973 + 2,414 = 38,111 ✅ | 15 个变更文件全部命中 `provincial-湖北-*`；国考 / 其他省 0 改动 ✅ | index 320 个分片无悬空、166 keys 精确覆盖；idMap 35,332 条全覆盖 ✅ |
| 江西 | 315 − 12 + 17 = 320；36,670 − 1,350 + 3,164 = 38,484 ✅ | 18 个变更文件全部命中 `provincial-江西-*`；国考 / 其他省 0 改动 ✅ | index 320 个分片无悬空、165 keys 精确覆盖；idMap 35,732 条全覆盖 ✅ |

补充：三省新旧 ID 交集均为 0，新分片内部重复 ID 均为 0，与未触碰分片 ID 冲突均为 0；源 `questions.json` 与分片一致；目标分片名全部可被 loader 解析。

## 旧时代残留清理

- 湖南：删除 `provincial-湖南-shenlun-0.json`（5 题）。
- 湖北：无旧主观题分片，删除 0 个。
- 江西：删除 `provincial-江西-shenlun-0.json`（6 题）。
- 旧分片 ID 唯一数：湖南 761、湖北 817、江西 1,167；旧数据内部重复分别为 19 / 156 / 183 条，均不迁移。

## 执行顺序（已按此顺序完成）

```powershell
node scripts/publish-merge-provinces.cjs --province 湖南 --apply --drop-uncovered   # ✅
node scripts/publish-merge-provinces.cjs --province 湖北 --apply --drop-uncovered   # ✅
node scripts/publish-merge-provinces.cjs --province 江西 --apply --drop-uncovered   # ✅
node scripts/verify-question-loading.cjs                                           # ✅
npm run build                                                                      # ✅
```

- 脚本不生成 publish 备份；回滚基线为执行前 git HEAD `270f600`（旧分片与 `index.json` / `idMap.json` 均在版本库中）。空格清洗备份位于 `guokao-reports/backup-<slug>-v2-spaces-<时间戳>/`（`backup-*` 已被 `.gitignore` 忽略）。
- 最终线上：**330 个分片 / 41,384 题 / 164 个 index key / 38,807 条 idMap**；index 精确覆盖 330 个分片，idMap 无悬空。
- `verify-question-loading`：结论 ✅；`npm run build`：Vite 构建成功。
- 数据与报告已就绪，**尚未 commit / push**（等待确认暂存清单）。
