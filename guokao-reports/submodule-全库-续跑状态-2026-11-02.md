# 全库二级分类 · 续跑状态（2026-11-02 13:43 起）

## 1. 上次中断时的状态（12:35 已收尾）

- 上次进程：PID `4784`，已于 12:35:47 退出；postrun 于 12:35:55 跑完（状态文件已出现 `postrun-done`），没有进程空转。
- 上次结果：分类 `43,831 / 95,278` 题；待补 `51,447` 题。
- 失败原因分布（共 51,447）：
  - `402 Insufficient Balance`（余额耗尽）：51,393
  - `429` 并发上限随余额下降：51
  - `子类不在允许列表`（模型输出越界，可重试）：3
- 断点缓存：`guokao-reports/.cache/submodule-all-all.jsonl`，43,175 行 / 43,175 个唯一 key（无重复、无坏行），最后写入 `2026-11-02T04:14:22Z`（北京时间 12:14:22）。
  - 缓存只在“成功”时追加（`classifyRecord` 成功 → `appendCheckpoint`），失败不入缓存，所以续跑不会对已成功题目重复计费，失败题目会被重新请求。

## 2. 本次续跑（已完成）

- 余额校验：`GET https://api.deepseek.com/user/balance` → `HTTP 200`，可用余额 **¥299.93**。
- 进程：PID `3200`（后台，`--concurrency 16`），**13:43:47 启动、14:27:09 结束，实际耗时 43.2 分钟**。
- 命令：
  ```powershell
  node scripts/classify-submodules.cjs --province all --module all --apply --sync-source --review-sample 50 --concurrency 16
  ```
- 启动确认：`已有分类 43,831 道 / 待处理 51,447 道`，即从断点继续，未重复处理已完成的题。
- 实时日志：`%TEMP%\submodule-retry-20261102134347.out.txt`（stderr 为 0 字节，无任何报错）
- 进度状态：`%TEMP%\submodule-retry-status.txt`
- 结果：
  - 待处理 51,447 题：成功 **51,444**，失败 **3**，缓存命中 0
  - 全库：**95,275 / 95,278** 题已有子类（缺 3 题），非法子类 0 题，低置信 8,884 题（9.3%）
  - 耗时 2,591.8 秒；总 token 35,441,244（输入 34,227,799 / 输出 1,213,445；缓存命中 16,700,464）
  - 费用（峰值价）$6.8145 ≈ **¥48.38**；每千题约 ¥0.94（off-peak 半价约 ¥0.47）
  - 源目录同步：329 个文件 / 102,884 条字段，备份在 `guokao-reports\submodule-backups\2026-11-02T06-27-02-245Z\`

## 2.1 关于"进度文件 35 分钟全是 no progress line yet"

**分类进程没有挂，是守护脚本读数失败导致的误报。** 已复现并修复：

- 复现：用 `Start-Process -RedirectStandardOutput` 启动一个持续写日志的进程，另开一个进程读取同一文件 →
  - `[System.IO.File]::ReadAllText(...)` **抛异常**："文件正由另一进程使用，因此该进程无法访问此文件。"
  - `Get-Content` 正常；改用 `FileShare.ReadWrite` 打开也正常。
- 原因：`Start-Process` 重定向句柄不允许 `FileShare.Read` 语义的普通读取，而原守护脚本的 `Read-ClassifierLog` 用 `ReadAllText` 并把异常吞成空串 → 每 5 分钟只能写 `progress=unknown (no progress line yet)`。
- 修复：`%TEMP%\submodule-retry-watch-v2.ps1` 改用
  `[System.IO.File]::Open(..., FileAccess.Read, FileShare.ReadWrite)` + `StreamReader` 读取，
  读失败时写 `progress=unreadable (<真实异常>)`，并在心跳行附带原始进度行。
- 注意：进程退出后文件句柄释放，原脚本的"收尾判定"仍能正常读到日志——所以 14:27:23 的 `classifier-finished`/postrun 全部正确执行（sync/validate/index/summary 均 exit=0）。

## 2.2 剩余 3 题：题库模块标注错误，不是分类器问题

| 题目 ID | 省份 | 现有 module | 题干（截断） | 模型返回 | 建议真实模块 |
|---|---|---|---|---|---|
| prov-tianjin-2022-未标注-42 | 天津 | yanyu | 关于太阳系相关常识，下列说法错误的是 | 常识判断 | 常识判断 / 科技 |
| prov-anhui-2025-未标注-28 | 安徽 | yanyu | 以下关于我国航母的说法错误的是 | 常识判断 | 常识判断 / 科技 |
| prov-hainan-2014-412联考-63 | 海南 | yanyu | 某单位利用业余时间举行了 3 次义务劳动……人数之比 5:4:1 | 数量关系 | 数量关系 / 计算杂题 |

- 这 3 题都在"未标注"卷里被转换器按关键词误判成言语理解；模型拒绝给出言语子类（因为题面确实不是言语理解），属**正确拒答**。
- 因温度/提示固定，重跑会得到同样结果，**重试无意义**，所以保留为"缺子类 3 题"（占全库 0.003%），前端仍在"全部"里可见。
- 若要彻底清零，应修正这 3 题的 `module`（及对应 `subModule`），这会改动五模块题量分布，需单独确认后再做（不建议在分类流程里静默改 module）。

> 口径补充：`public/data/questions` 共 95,486 题，其中 208 题为 **申论 207 题 + 公基 1 题**（`national-none-shenlun-*`、`provincial-none-gongji-0`），不属于行测五模块，分类与校验均按设计跳过，因此"全库 95,278"指行测口径。



## 3. 跑完自动执行的 postrun

守护脚本 `%TEMP%\submodule-retry-watch.ps1`（v1，本次实际使用；修复版见 `submodule-retry-watch-v2.ps1`）会等待 PID 3200 退出，随后依次：

1. `node scripts/classify-submodules.cjs --province all --module all --sync-only`
   → 把 `subModule` 同步回国考源目录 `public/data/questions-v2/` 与省考源目录 `public/data/questions-v2-provincial/`；
2. `node %TEMP%\submodule-validate-full.cjs`
   → 生成 `guokao-reports/submodule-full-validation.json`；
3. `node scripts/rebuild-question-index.cjs`
   → 索引检查（只检查，不写回）；
4. `node %TEMP%\submodule-summary.cjs`
   → 重新生成 `guokao-reports/submodule-全库-汇总-2026-11-02.md`。

完成后状态文件出现 `postrun-done`。

**本次 postrun 实测（14:27:23 → 14:27:31，全部 exit=0）：**

| 步骤 | 结果 |
|---|---|
| `submodule:sync`（sync-only） | `0 个文件 / 0 道题`（分类器 `--sync-source` 已同步 329 文件，无需再补） |
| 全库校验 | 562 分片 / 95,278 题；已写 95,275；缺 3；非法 0；低置信 8,884 |
| `rebuild-question-index.cjs`（只检查） | 565 分片 / 95,486 条；`index.json` 24,731 B 与重建字节一致、`idMap.json` 6,515,952 B 一致 → **索引无需重建** |
| 汇总 Markdown | `guokao-reports\submodule-全库-汇总-2026-11-02.md` 已按新数据重写 |

> 提示：运行期间请用 v2 守护脚本（`submodule-retry-watch-v2.ps1`），v1 的进度行会一直报 `no progress line yet`（读数被 `Start-Process` 的写句柄挡住，不影响分类本身与收尾判定）。

## 4. 如何看进度

```powershell
Get-Content "$env:TEMP\submodule-retry-status.txt" -Tail 5
Get-Content "$env:TEMP\submodule-retry-20261102134347.out.txt" -Tail 3
```

## 5. 如果再次中断

直接重跑同一条命令即可，已成功题目会按题库字段跳过、缓存命中不扣费：

```powershell
npm run submodule:all
```

## 6. 发布（等 postrun-done 之后）

```powershell
npm run release:data
npm run release:frontend
```

SSH 非免密，需要人工输入服务器密码。
