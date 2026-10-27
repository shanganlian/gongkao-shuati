# Netlify 环境变量配置指南 · DEEPSEEK_API_KEY

> 适用版本：面试大厅 v1（`POST /api/interview-review`）
> 操作时间：2026-10-30（周五，Netlify 额度重置、代码 push 之后）
> 目标：让线上 Netlify Functions 在运行时读到 `DEEPSEEK_API_KEY`，评分走 DeepSeek；未配置时接口自动降级为本地规则，不会 500。

## 0. 先确认三件事

1. 手里有有效的 DeepSeek Key（形如 `sk-...`）。**只粘贴到 Netlify 后台**，不要写进仓库、聊天或截图。
2. 站点已存在：`elaborate-faloodeh-f2ba0e`（以 Netlify 后台实际站点名为准）。
3. 代码已 push 并完成一次构建。环境变量修改后必须**重新部署**才能注入函数实例。

## 1. 打开环境变量页面（截图步骤文字版）

1. 浏览器打开 <https://app.netlify.com/> 并登录，确认左上角选中的 Team 正确。
2. 在 Sites 列表点进本项目站点。
3. 进入站点后，点顶部/左侧的 **Site configuration**。
   - 旧版界面该入口叫 **Site settings**，位置一致。
4. 在左侧栏找到 **Environment variables**（在 “Build & deploy” 分组下；新版也可能直接显示在 “Environment” 区域）。
5. 页面标题为 “Environment variables”，右上角按钮是 **Add a variable**（旧版叫 **New variable**）。

> 若看到的是 “Environment” 总览页，优先找 **Environment variables** 子项，不要进 “Build hooks” 或 “Notifications”。

## 2. 新增变量

6. 点 **Add a variable**，在下拉菜单选 **Add a single variable**。
   - 不要选 “Import from a .env file”，避免把本地其它变量一起带上去。
7. **Key** 填：`DEEPSEEK_API_KEY`
   - 全大写，前后不能有空格；建议直接复制本行，避免手打出错。
8. **Value** 粘贴你的 `sk-...`。
   - 不要加英文引号、不要带换行、不要带 “Bearer ” 前缀。
9. **Scopes**（作用域）只勾选 **Functions**。
   - 这是本项目的关键项：函数运行时通过 `process.env.DEEPSEEK_API_KEY` 读取。
   - 不建议勾 **Builds**：构建期不需要该 Key，勾了只会增加密钥出现在构建日志里的暴露面。
   - 若界面提供 **Runtime** / **Post processing**，本项目也不需要。
   - “Deploy contexts” 保持默认 **All deploys** 即可（至少覆盖 Production）。
10. 点 **Create variable**（旧版 **Save**）。
    - 保存后 Key 值不可再查看，只能替换；请自行确认粘贴无误。

## 3. 让变量生效

11. 回到站点顶部 **Deploys** 页。
12. 点右上角 **Trigger deploy** → **Deploy project**。
    - 不需要勾 “Clear cache”；只有怀疑缓存问题时才用 “Clear cache and deploy site”。
13. 等待最新部署状态变为 **Published**。
    - 若周五是首次 push 代码：先 `git push`，等自动构建完成，再执行第 12 步重新部署一次，确保变量已注入。

## 4. 线上验收（必做）

在项目根目录打开 PowerShell，执行：

```powershell
$env:INTERVIEW_API_BASE='https://elaborate-faloodeh-f2ba0e.netlify.app'
node scripts/smoke-interview-endpoint.mjs --expect=deepseek
Remove-Item Env:INTERVIEW_API_BASE
```

期望结果：

- 脚本输出 **全部 PASS**（deepseek 模式 11 项）；
- 响应中 `provider=deepseek`、`degraded=false`、无 `note`；
- 采分点条数与题目一致，总分在 0–100。

页面侧复核：

1. 打开站点 → 进入「面试」Tab → 抽一道题 → 作答 ≥30 字 → 结束作答。
2. 报告页应显示 **DeepSeek** 引擎标识，且**没有**「本地规则 / 降级」提示。
3. 若显示「本地规则」，打开浏览器 DevTools → Network → `interview-review` 请求，看响应里的 `note` 字段。

## 5. 常见失败与定位

| 现象 | `note` | 原因 | 处理 |
| --- | --- | --- | --- |
| 报告是本地规则版 | `missing-api-key` | Netlify 里没有该变量，或 scope 没勾 Functions | 回第 2 步核对 Key 名与 Scopes，保存后重新部署 |
| 报告是本地规则版 | `deepseek-failed` | Key 无效 / 余额不足 / DeepSeek 网络或超时（服务端 26s） | 到 Netlify → Functions → `api` → Logs 看 `DeepSeek interview review error`；核对 Key 与额度 |
| 报告是本地规则版 | `answer-too-short` | 有效作答不足 30 字，按设计不调 AI | 属正常行为，换一段 30 字以上的作答 |
| 接口 404 | 无 | 构建未发布 / 重定向失效 | 确认 `netlify.toml` 的 `/api/*` 重定向随本次提交已部署 |
| 接口 400 | 无 | 缺 `question` 或作答为空 | 属参数校验，按脚本用例检查请求体 |

## 6. 安全与回滚

- 变量值保存后不可查看，只可覆盖或删除；怀疑泄露时，先到 DeepSeek 控制台吊销旧 Key，再在 Netlify 覆盖为新 Key。
- 不要把 Key 写进 `.env.example`、`netlify.toml`、`README` 或任何 `VITE_` 前缀变量（Vite 会把 `VITE_` 变量打包进浏览器）。
- 回滚方式：删除 `DEEPSEEK_API_KEY` 或改错值 → 重新部署。接口会自动走 `provider=local` 本地规则，作答与报告仍可用，只是明确标注降级。

## 7. 成本提示

- 每次有效作答（≥30 字）发起 1 次 DeepSeek `chat/completions` 请求，`max_tokens=2200`、`temperature=0.3`。
- 不足 30 字、AI 异常、未配置 Key 都不会产生 AI 调用。
- 周五额度重置后再 push/部署，避免在额度未恢复时反复触发构建。
