# 全库二级分类运行状态（2026-11-02）

- 命令：`node scripts/classify-submodules.cjs --province all --module all --apply --sync-source --review-sample 50 --concurrency 16`
- 范围：562 个分片 / 95,278 题；已有分类 656 题（北京常识），待处理 94,622 题。
- 进程：PID `4784`（后台运行）。
- 实时日志：`C:\Users\CLM\AppData\Local\Temp\submodule-full16-20261102-113558.out.txt`
- 最近进度（2026-11-02 11:58）：25,375 / 94,622（成功 22,222 / 失败 2 / 缓存 3,151）。
- 预计：按当前约 7~12 题/秒，剩余约 2 小时左右；以日志进度为准。

## 完成后会自动执行

`submodule-postrun.ps1` 正在等待 PID 4784 退出，随后依次：

1. `npm run submodule:sync`：把 `subModule` 同步回国考源目录 `public/data/questions-v2/` 和省考源目录 `public/data/questions-v2-provincial/`；
2. 跑全库数据校验，输出 `guokao-reports/submodule-full-validation.json`；
3. 跑 `node scripts/rebuild-question-index.cjs`（只检查，不写回）；
4. 生成汇总 `guokao-reports/submodule-全库-汇总-2026-11-02.md`。

状态文件：`C:\Users\CLM\AppData\Local\Temp\submodule-postrun-status.txt`，看到 `postrun-done` 后再发布。

## 如果进程中断

直接重跑同一条命令即可从 `guokao-reports/.cache/submodule-all-all.jsonl` 断点续跑，不会重复计费：

```powershell
npm run submodule:all
```

## 发布顺序

等状态文件出现 `postrun-done` 后：

```powershell
npm run release:data
npm run release:frontend
```

SSH 非免密，需要人工输入服务器密码。
