# 题库索引（index/idMap）全量重建 + 线上部署核查 · 2026-10-23

## 1. 结论摘要

| 检查项 | 仓库 HEAD（`cc2ddbf`） | 线上站点（netlify） | 判定 |
| --- | --- | --- | --- |
| 分片数 | 565 | 440（旧） | 线上滞后 |
| `index.json` 键数 / 分片引用 | 174 / 565（完整） | 167 / 440（旧） | 线上滞后 |
| `idMap.json` 条目 | 95,486 | 65,464（旧） | 线上滞后 |
| 内蒙古分片 | 14 个 / 2,175 题 | `404` | 线上滞后 |
| 西藏分片 | 7 个 / 859 题 | `404` | 线上滞后 |
| 江苏 `changshi-0` | 6,311 题（全 5 模块） | 150 题（旧包） | 线上滞后 |

- **仓库侧没有任何缺陷**：昨晚的 `publish fourteen provinces`（`cc2ddbf`）已包含全部新省分片，且 `index.json` / `idMap.json` 已按全量重建，所有题目 ID 都能映射到真实分片。
- **问题出在部署**：线上站点仍是 `8ac4e6f`（`publish hainan shanxi beijing shanghai shenzhen heilongjiang tianjin guangdong`）那次构建的产物——其 `index.json` 正是 167 键 / 440 条引用，与线上完全吻合。`cc2ddbf` 的构建**未生效**（Netlify 未触发、构建失败或未自动发布）。
- 因此“内蒙古 / 西藏无输出、idMap 未同步”不是数据生成问题，而是**线上包没更新**。

## 2. 全量重建执行记录

新增可复用脚本 `scripts/rebuild-question-index.cjs`（口径与 `publish-merge-provinces.cjs` 完全一致）：

```bash
node scripts/rebuild-question-index.cjs --provinces 内蒙古,西藏,江苏,山东   # 只检查（默认）
node scripts/rebuild-question-index.cjs --apply --provinces 内蒙古,西藏,江苏,山东   # 全量重写
npm run index:check   # 等价于上面的检查模式
npm run index:rebuild # 等价于上面的 --apply
```

本次执行结果（`--apply`，`EXIT=0`）：

```text
分片 565 个 / 题目 95,486 道
index：174 键 / 565 条分片引用（覆盖完整）
idMap：95,486 个题目 ID（全部指向真实分片：是）
index.json：已写入，原有 24,731 B → 重建 24,731 B，字节一致
idMap.json：已写入，原有 6,515,947 B → 重建 6,515,947 B，字节一致
内蒙古：分片 14 / 题目 2,175 / idMap 命中 2,175 / index 键 5（changshi/panduan/shuliang/yanyu/ziliao）
山东：  分片 14 / 题目 2,414 / idMap 命中 2,414 / index 键 5（changshi/panduan/shuliang/yanyu/ziliao）
江苏：  分片 34 / 题目 6,311 / idMap 命中 6,311 / index 键 5（changshi/panduan/shuliang/yanyu/ziliao）
西藏：  分片  7 / 题目   859 / idMap 命中   859 / index 键 5（changshi/panduan/shuliang/yanyu/ziliao）
检查通过：索引与目录内容完全一致。
```

> 重建后文件与提交内容**字节级一致**，`git status -- public/data/questions/` 无输出，
> 说明“全量重建”已完成且无需产生数据改动。

## 3. 前端取值链路核对

- `src/hooks/useQuestions.ts` 以 `indexData[`${category}-${province}-${module}`]` 取分片列表，再逐片 `fetch`；
- `src/data/mockData.ts` 的 `PROVINCE_LIST` 含 `内蒙古`、`西藏`、`江苏`、`山东`（省级下拉可选）；
- `index.json` 键与上述拼接完全对应（见第 2 节 `index 键 5 / changshi…ziliao`），因此**新省在仓库侧可被前端正常取到**。

## 4. 线上滞后证据（2026-10-23 抓取）

```text
GET https://elaborate-faloodeh-f2ba0e.netlify.app/data/questions/index.json   → 200，167 键 / 440 条引用
GET .../idMap.json                                                          → 200，65,464 条
GET .../provincial-内蒙古-changshi-0.json                                    → 404
GET .../provincial-西藏-changshi-0.json                                      → 404
GET .../provincial-江苏-changshi-0.json                                      → 200，150 题（旧版）
GET .../provincial-山东-changshi-0.json                                      → 200， 71 题（旧版）
```

对照 `git log` 各版本 `index.json` 的键数：174（`cc2ddbf`）→ 167/440（`8ac4e6f`），线上正好是 `8ac4e6f`。

## 5. 处置与终验

1. 本次提交推送 `main` 后，Netlify 应重新构建；构建产物 `dist/data/questions/*` 会随 `public/` 一起发布。
2. 若 3–5 分钟后线上仍是旧值：到 Netlify 面板该站点 → **Deploys** 查看 `cc2ddbf` 之后的部署是否失败（重点看 build log 是否超时 / 内存 / `npm install` 失败），必要时 **Clear cache and deploy site**。
3. 终验断言（爬站脚本建议）：

```js
const idx = await (await fetch(BASE + '/data/questions/index.json?t=' + Date.now())).json();
Object.keys(idx).length === 174;                        // 应为 174
Object.values(idx).flat().length === 565;               // 应为 565
!!idx['provincial-内蒙古-changshi'] && !!idx['provincial-西藏-changshi'];
const im = await (await fetch(BASE + '/data/questions/idMap.json?t=' + Date.now())).json();
Object.keys(im).length === 95486;                       // 应为 95,486
(await fetch(BASE + '/data/questions/provincial-内蒙古-changshi-0.json')).status === 200;
```

> 本地 `dist/`（未被 Git 跟踪）已是 174 键 / 565 条，可作构建产物基线；
> 线上只要 `index.json` 达到 174/565、`内蒙古/西藏` 分片返回 200，即视为修复完成。
