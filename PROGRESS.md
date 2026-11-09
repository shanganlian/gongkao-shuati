# 项目进度总结

> 更新时间：2026-11-08

## 0. 题库数据治理（2026-10-17）

### 0.1 笔试专区空白问题 —— 已解决

**根因**：`useQuestions` 中 `o[r][0]` 只加载了匹配分类的**首个分片**，导致 1,427 个跨分片 ID 的题目大量丢失，页面渲染为空。

**修复**：改为加载匹配分类的**全部分片**并渐进加载（`src/hooks/useQuestions.ts`）。

### 0.2 渲染防护 —— 已上线

- `src/lib/questionValidation.ts`：题干为空 / 选项为空 / 选项不足 2 项 → 跳过该题
- `src/components/QuestionErrorBoundary.tsx`：单题渲染崩溃不影响整页
- `PracticeArena.tsx` 所有题目列表（专项刷题 / 试卷 / 错题本）均已包裹错误边界 + 数据校验

### 0.3 脏数据修复记录

| 批次 | 问题 | 处理 | 结果 |
|---|---|---|---|
| 1 | 空 stem | 扫描 → `empty_stem.csv` | 38 道，title 仅为截断摘要无法重建，记入 `repair_failed.csv` |
| 2 | 缺选项 | 从 stem 末尾拆分重建 | 36 道修复；1,180 道图形题标记 `isImageQuestion`（前端显示占位提示） |
| 3 | **stem 末尾粘 A 选项** | 截出 A 重建 options | **238 道 REPAIR + 22 道 CLEAN**，197 道进人工清单 |

**批次 3 详情**（`scripts/fix-stem-trailing-option.cjs`）：
- `[REPAIR]` options 缺 A + stem 末尾有 A 标记 → 截出尾部作为 A 选项插到最前，stem 保留干净题干
- `[CLEAN]` options 已含 A + stem 末尾有重复 A 标记 → 只清理 stem 尾部
- `[MANUAL]` 进 `stem_trailing_option_manual.csv`，不改数据

**边界防护**（任一命中即判 MANUAL，避免误切）：
1. 尾部 ≥ 100 字（多为 "A、B 两地" 这类正常引用）
2. 尾部为空
3. 尾部含后续选项标记（B、/C、/D、）→ 多题合并
4. 尾部含题号 → 多题合并
5. options key 重复（如 `[CDABCDABC]`）→ 多题合并
6. 截断后题干为空
7. **截断后题干以连接词结尾**（的/是/为/在/和/与/、/，）→ A 是句中成分
8. **截断后题干无句末标点**（：/？/。/！/；）→ 语义不完整

> 防护 7、8 是二次 dry-run 时新增的：首次 dry-run 误判了 `real-2020-副省级-111`（"坐在同一排的 A、B、C、D、F 五个座位"，A 是座位名），加防护后 CLEAN 从 92 降到 22。

### 0.4 数据层验证结果

`node scripts/verify-question-loading.cjs`

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 可渲染题目 | 21,537 | **22,771** |
| 被校验跳过 | 2,226 | **992** |
| 跳过率 | 9.37% | **4.18%** |

各模块有效题数：常识 6,460 / 言语 5,816 / 判断 5,378 / 数量 2,526 / 资料 2,471 / 申论 119。

### 0.5 题库导入校验器 —— 新增

`node scripts/validate-questions.cjs [--strict] [--limit N]`

> 注意：项目 `package.json` 为 `"type": "module"`，故脚本用 `.cjs` 扩展名。

| 规则 | 说明 |
|---|---|
| E01 | 题干为空 |
| E02 | 客观题缺少选项（图片题除外） |
| E03 | 选项文本为空 |
| E04 | 选项 key 重复（多题合并） |
| E05 | 选项 key 非标准序列（无重复时才报，避免与 E04 重复计数） |
| E06 | 答案不在选项范围 |
| **E07** | **stem 含选项标记**（选项被粘进题干） |
| W01~W06 | 题干过短 / 缺解析 / 缺 thinkingTip / 题干含题号 / 题干过长 / 图片题未标记 |

当前基线：22,492 道（去重后），ERROR 2,086 / WARN 21,394。明细见 `validate-questions-report.csv`。

### 0.6 遗留问题

- **992 道题仍被前端跳过**：题干为空 38 道 + 选项文本为空/数量不足等，均为源数据缺失，需重新采集。
- **197 道 stem 粘 A 选项进人工清单**：多为多题合并（选项数组如 `[BCDABCDACDABCDABDAC]`）或正常引用，需人工拆分。
- **825 道选项 key 重复**：多题合并，需重新切分原始试卷。

### 0.7 多题合并脏数据治理（本轮）

**问题**：题库分片中存在「多题合并」脏数据——一道题的 options 里塞了多道题的选项
（如 `[A,A,A,A]`、`[CDABCDABC]`），导致选项重复、题干串题，前端渲染混乱。

**处理策略**：不尝试自动拆分（拆分风险高、易产生错误答案），改为**标记 + 占位**。

| 步骤 | 脚本 / 文件 | 结果 |
|---|---|---|
| 扫描识别 | `scripts/scan-abnormal-merged.cjs` | 命中 **933 道**（省考 765 / 国考 168） |
| 写入标记 | `scripts/mark-abnormal-merged.cjs --apply` | 933 道写入 `isAbnormal: true`，涉及 200 个分片 |
| 前端校验 | `src/lib/questionValidation.ts` | 新增 `isMergedAbnormal` 等 8 个校验函数 |
| 占位组件 | `src/components/AbnormalQuestionPlaceholder.tsx` | 「本题数据整理中」卡片（完整/紧凑两态） |
| 渲染接入 | `src/components/PracticeArena.tsx` | 试卷 / 专项刷题 / 错题本 三处接入 |

**判定信号**（脚本与前端完全一致）：
- a. options 存在重复 key
- b. stem 或任一 option.text 含题号串 `/[0-9]{1,3}、[\u4e00-\u9fa5]/`
- c. stem + options 总长 > 500（**仅作 a/b 的佐证，单独命中不标记**，避免资料分析长题干误伤）

**按模块分布**：常识 365 / 言语 206 / 判断 176 / 资料 110 / 数量 76

**口径注意**：`scan-abnormal-merged.cjs` 与 `mark-abnormal-merged.cjs` 均按**分片文件**去重，
不按题目 id 去重（同一题可能被多个分类 key 引用）。早期扫描脚本按 id 去重导致少计 77 道（856 vs 933），已修正。

**回滚**：`node scripts/mark-abnormal-merged.cjs --clear --apply`

### 0.8 分片加载修复验证

`node scripts/verify-question-loading.cjs` 确认各分类均加载**全部分片**
（如 `national-none-changshi` 7 个分片、`provincial-浙江-changshi` 4 个分片），
新逻辑（全部分片）可找到 **1,427 道**，旧逻辑（仅首分片）远少于此。

### 0.9 本轮验证

- `node node_modules/typescript/bin/tsc --noEmit` → 无错误
- `npm run dev` → `http://localhost:3002`，HTTP 200
- 笔试专区专项刷题 / 试卷 / 错题本三处均正常渲染，异常题显示「本题数据整理中」占位

## 0.10 国考真题转换器（2021 试点已完成）

**目标**：把 `source-data/国考真题（2000--2026)/` 的 docx 真题转为 v2 分片题库，
线上 `public/data/questions/` 不动。

**产出**：`public/data/questions-v2/national-none-{module}-{n}.json` + `index.json`；
报告写入 `guokao-reports/`（每卷 validation.csv、summary.json、all-issues.csv）。

### 0.10.1 本轮修复（材料与解析）

| 问题 | 根因 | 处理 |
|---|---|---|
| 两份行测材料块均为 0 | 材料正文在普通段落，但原扫描只认「回答 N～M 题」范围句；2021 卷只有「（材料 N）」标题 | 新增材料标题识别 `（材料N）` / `(材料)` / 行尾 `(材料 2)` / `材料N：`，并支持表格作为材料骨架 |
| 材料绑定过多（53/59 题） | 排版用的空表格被当成材料骨架；`(材料)`、行尾 `(材料 2)` 未识别 | 表格按**有效文本行**计数并忽略空表；补齐无编号与行尾标记 |
| 表格/图片材料丢失 | `extractRawText` 不输出表格结构，图片只留空行 | 题目文档改走 `convertToHtml` → 按块还原行文本：表格按行展开（单元格 ` \| ` 分隔），图片记为 `[[IMG]]` |
| 纯图片材料无法表达 | 无文本可提取 | `material = '【图片材料】'`，并给该组题目标 `isImageQuestion` |
| 下一组材料被上一题吞掉 | 非题目段落一律 `appendToLast` | 选项已闭合（A-D 齐全且有正文）时不再追加，转入新材料块 |
| 副省级解析全空 | 解析文件是 4.9MB 扫描图片版（仅 622 字可提取），不是题号问题 | 判定 `ANSWER_SOURCE_EMPTY` 只报 1 条 ERROR；另加「【答案】/故正确答案为」顺序兜底，供自动编号卷使用 |
| 图片题选项报 ERROR | 图形推理选项本身是图片，拆不出文本 | `isImageQuestion` 时 `OPT_SPLIT_FAIL`/`OPT_COUNT`/`OPT_NOT_4`/`OPT_EMPTY` 降级为 WARN |
| 申论卷整卷跳过 | 文件名含「答案/解析」时全部被判为答案文件 | `pairShenlunFiles` 在题干文件为空时退回全量，并避免自配对 |

**新增校验码**：`MATERIAL_MISSING`（资料分析未绑定材料）、`MATERIAL_IMAGE`（材料含图片）、
`ANALYSIS_SEQUENTIAL`（解析按顺序兜底）——均为 WARN。

### 0.10.2 2021 试点结果（2026-10-18）

| 卷 | 题数 | 材料块（含图） | 带材料 | 答案/解析 | ERROR | WARN |
|---|---|---|---|---|---|---|
| 2021 副省级 行测 | 135 | 7（3） | 30 | 0 / 0 | 1 | 18 |
| 2021 地市级 行测 | 130 | 5（3） | 25 | 129 / 129 | 4 | 21 |
| 2021 副省级 申论 | 5 | 7624 字材料 | 5 | 5 | 0 | 0 |
| 2021 地市级 申论 | 5 | 7269 字材料 | 5 | 5 | 0 | 0 |

`node scripts/validate-questions.cjs --dir public/data/questions-v2` → **275 题，ERROR 0，WARN 150**
（WARN 主要为副省级 135 题缺解析 + 13 条题干含题号提示）。

**剩余已知问题（源头数据）**：
- 副省级行测解析文件是 4.9MB 扫描图片版（可提取文本仅 622 字），标记 `ANSWER_SOURCE_EMPTY`，
  需 OCR 或换一份文字版解析；因此答案/解析为 0 只报 1 条 ERROR。
  **本轮决定**：无答案题保留为空，抽查/前端标注「无官方答案」，不阻塞试点，后续从文字版资源补。
- 地市级 q55 在解析文件中缺块（原文件本身缺），`MISSING_ANSWER`/`MISSING_ANALYSIS` 各报两次
  （mergeAnswers 与 validatePaper 各一次），共 4 条 ERROR。
- 资料分析的图表本身是图片（非 Word 表格），材料以 `MATERIAL_IMAGE` WARN 提示人工核对；
  纯图片材料记为 `material='【图片材料】'` 并置 `isImageQuestion`。

**产出**：`public/data/questions-v2/` 共 6 个分片 + `index.json`；线上 `public/data/questions/` 未改动。

### 0.10.3 复跑命令

```bash
node scripts/convert-guokao.js --year 2021 --papers 副省级,地市级 --dry-run --verbose
node scripts/convert-guokao.js --year 2021 --papers 副省级,地市级
node scripts/validate-questions.cjs --dir public/data/questions-v2
node scripts/inspect-v2.js --seed=20261018
```

> `scripts/inspect-v2.js`：按模块分层随机抽查（常识/言语/数量/判断/资料各 4 道 + 申论 2 道），
> 打印题干/选项/答案/解析/材料/source；答案为空标注「（无官方答案）」；`--seed` 可复现同一次抽取，
> 还支持 `--per-module=4 --shenlun=2 --dir=...`。

### 0.10.4 备查：document.xml 方案

若后续遇到「材料/题号全为自动编号」的卷子，可读取 docx zip 内
`word/document.xml` + `word/numbering.xml`，按 `w:numPr`（numId/ilvl）与 `w:lvlText` 还原编号后
再切块。2021 卷材料正文为普通文本，暂不需要。

### 0.10.5 全量验收与无答案总账（2026-10-18）

**验收结论**：`node scripts/convert-guokao.js --all --dry-run` → **92 卷 / 6,210 题，
QNO_GAP = 0**；ERROR 9 / WARN 1,551。

本轮修复的 5 项缺陷：

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | 材料范围首题被吞（如 2017 副省 Q51） | 新增 `FIRST_Q_PROMPT_RE` / `findFirstQuestionStemStart()`；`RANGE_RE` 识别「范围首题号被当材料」并记 `firstQuestion`，遇到首个选项行切出题干补成一题 |
| 2 | `scanBlocks` 材料边界把首题题干并入材料 | 题干切出后只保留材料正文，`material.text` 不再含题干 |
| 3 | Q52/Q53 选项行尾黏连题号未拆 | `preSplitText` 增加同行选项尾切分；同时支持「128、2018 年」这类数字开头题干，并限制为**不跨行**，避免把独立的「125、」「126、」粘成一行 |
| 4 | 图片题选项报 ERROR | 新增 `WARN_CODES.IMAGE_OPTION`，图片题选项问题统一报 `IMAGE_OPTION`（WARN）；普通文本题仍保留 `OPT_*` ERROR |
| 5 | 同题号 `MISSING_ANSWER` 重复 | 新增 `dedupeIssues()` 按 `code|num` 去重；`stats` 增加 `missingAnswers`，summary 增加 `totalWithAnswer` / `totalMissingAnswers` / `papersWithMissingAnswers` / `qnoGapCount` |

**逐卷结果（全量）**：

| 指标 | 数值 |
|---|---|
| 卷数 | 92（行测 46 / 申论 46） |
| 题目 | 6,210 |
| 有官方答案 | 6,066（97.7%） |
| 无官方答案 | **144（涉及 8 卷）** |
| QNO_GAP | **0** |
| ERROR | 9（全部为 `MISSING_ANSWER`，7 卷） |
| WARN | 1,551 |
| 图片题 | 721 |

**无官方答案总账**（`scripts/audit-missing-answers.js` → `guokao-reports/missing-answers.csv/json`）：

| 卷 | 无答案/总题数 | 说明 |
|---|---|---|
| 2021-副省级-行测 | 135/135 | 解析文件为扫描图片版（`ANSWER_SOURCE_EMPTY`），已登记答案空洞 |
| 2018-副省级-行测 | 2/135 | 源文件答案缺失 |
| 2017-副省级-行测 | 1/135 | 源文件答案缺失（Q60） |
| 2021-副省级-申论 | 2/7 | 申论含 Q3 两个子问（1./2.），子问无独立答案；答案段共 5 段 |
| 2022-副省级-行测 | 1/135 | 源文件答案缺失 |
| 2022-地市级-行测 | 1/130 | 源文件答案缺失 |
| 2022-副省级-申论 | 1/5 | 源文件答案缺失 |
| 2022-地市级-申论 | 1/5 | 源文件答案缺失 |
| **合计** | **144/6,210** | 97.7% 有答案 |

**其他确认**：

- `source-data/国考真题（2000--2026)/` 下 **2026 年文件为 0 个**，确认是源数据缺失，按约定忽略。
- 2008 行测 Q125 源文件本身只有题号、无题干；修复后 Q125/Q126 不再粘连，QNO_GAP 为 0，但 Q125 仍需人工补题干。
- 2021 副省申论 `ANSWER_COUNT_MISMATCH`（7 题 / 5 段答案）源于 Q3 的两个子问，暂按现有口径统计，未并入本轮修复。

**复跑命令**：

```powershell
node scripts/test-convert-guokao.js
powershell -ExecutionPolicy Bypass -File scripts/run-guokao-tests.ps1
powershell -ExecutionPolicy Bypass -File scripts/run-guokao-full-check.ps1
node scripts/audit-missing-answers.js
```

**工具链保障**：

- `scripts/run-guokao-tests.ps1` 在回归测试前备份 `summary.json` / `all-issues.csv` / `summary.md`，结束后恢复；避免 2017/2021 子集 dry-run 覆盖全量账本。
- `scripts/run-guokao-full-check.ps1` 将全量 dry-run 直接重定向到 `guokao-reports/all-dryrun.log`，再生成 `summary.md` 与无答案总账。
- 2026-10-18 复跑：`run-guokao-tests.ps1` 退出码 0（PASS 10 / FAIL 0，2017/2021 dry-run QNO_GAP 0）；全量 `--all --dry-run` 退出码 0，`summary.json` 过滤条件为 `{all:true, year:null, papers:[]}`。

### 0.11 源文件手动修复后的重转规则（2026-10-19）

**规则**：用户手动修复 / 替换 `source-data/国考真题（2000--2026)/` 下的源 docx 后，
**必须重转对应年份并重新落盘 v2**；否则 `public/data/questions-v2/` 仍是旧源产物，修复不会生效。

**标准流程**：

1. 单年 dry-run 验证（只解析，不写 `questions-v2`）：

   ```powershell
   cd D:\行岸公考
   node scripts/convert-guokao.js --year 2008 --dry-run
   ```

   只重转行测（2008 OCR 场景）：`node scripts/convert-guokao.js --year 2008 --no-shenlun --dry-run`。

   > 注意：dry-run 仍会覆盖 `guokao-reports/summary.json`、`all-issues.csv` 和该年
   > `{year}-{paper}-{kind}-validation.csv`。如需保留全量账本，先备份这三个文件
   > （`scripts/run-guokao-tests.ps1` 已采用同样做法）。

2. 对比该年「答案 / 解析配齐率」与重转前基线，确认 OCR 版生效。

3. **正式落盘必须用 `--all`**：

   ```powershell
   node scripts/convert-guokao.js --all
   ```

   > **严禁用 `--year 2008` 直接落盘**：`writeShards()` 会先
   > `fs.rmSync(OUT_DIR, { recursive: true, force: true })` 再写分片，
   > 单年非 dry-run 会清空整个 `public/data/questions-v2/`，只剩该年数据。

4. 落盘后校验：

   ```powershell
   node scripts/validate-questions.cjs --dir public/data/questions-v2
   node scripts/report-v2.js
   node scripts/audit-missing-answers.js
   ```

**2008 年重转记录**：

- 2026-10-18 22:24 用户手动替换 `4-行测/1-行测-真题/word/2008年国家公务员考试《行测》真题卷.docx`
  （OCR 文字版：可提取 25,982 字 / 1,655 行 / 539 个选项标记 / 无 `[[IMG]]`）。
- 重转前全量基线（2026-10-18 22:15 dry-run）：
  - 2008 行测：140 题，答案 140/140（100%），解析 140/140（100%），图片题 13，WARN 10，ERROR 0。
  - 2008 申论：6 题，答案 6/6（100%），解析 6/6（100%），WARN 0，ERROR 0。
- 2026-10-19 复跑 `--year 2008 --dry-run --no-shenlun`（OCR 版）：
  140 题，答案 140/140，解析 140/140，图片题 11，ERROR 0，WARN 10，QNO_GAP 0；
  Q125 不再空题干，仅剩 `OPT_PARTIAL`（选项 BCD 不全）。dry-run 前已备份并恢复全量
  `summary.json` / `summary.md` / `all-issues.csv` / `missing-answers.*`，全量账本未被覆盖。
- **已确认（2026-10-19）**：2026-10-18 22:24 OCR 替换的是 **2008 行测真题卷**，不是申论。
  2008 申论“解析出 0 题”是已知损耗（申论解析源文件本身为扫描版），本轮不处理；
  `5-申论/word/` 下该文件时间戳未变（仍为 2026-10-18 09:11）。
- 当前实际落盘状态（2026-10-19 检查）：`public/data/questions-v2/` 仅 6 个分片 / 145 题，
  年份全部为 2011，说明此前有一次单年非 dry-run 落盘覆盖了全量；需按上述 `--all` 重建。

### 0.12 2021 副省级行测答案 OCR 回收（2026-10-19）

**本节数据取代 0.10.5 的「6,066 有答案 / 144 缺失 / ERROR 9」基线。**

**根因**：`4-行测/2-行测-答案及解析/word/2021年国家公务员考试《行测》真题（副省级）参考答案及解析.docx`
是 36 页 JPEG 扫描件，无文本层（可提取 622 字），`ANSWER_SOURCE_EMPTY` → 全卷 135 题答案为空。

**方案：旁挂 OCR 文本 + 转换器三处改动**（不伪造解析）

1. 新增 `同目录/2021年…参考答案及解析.ocr.txt`（135 行 `N、正确答案：X` + 来源说明头注释）。
   生成链路：Windows.Media.Ocr（zh-Hans）逐页识别 36 页 → 按「标题行答案字母」+「解析末句
   因此/故 正确…为 X」双读交叉校验，两者可读时 134/135 一致。
2. `loadText()`：`xxx.docx` 若存在同名 `xxx.ocr.txt` 则优先读取并打印 `[旁挂] …` 日志（仅旁挂卷生效）。
3. `mergeAnswers(questions, answerText, meta)`：识别「整卷块文本都是 `正确答案：X`」的纯答案清单
   （`answerOnlySource`），只填 `answer`，不把清单本身塞进 `explanation`，并置 `meta.answerOnlySource`。
4. `validatePaper()`：`answerOnlySource` 时不再逐题刷 `MISSING_ANALYSIS` ERROR，改为卷级一条
   `ANSWER_FROM_OCR_KEY`（WARN），`WARN_CODES` 同步登记。

**答案可信度处理**：

- 第 2 题标题字母被 OCR 识别为「·」，取同年市地级同题（题干与四个选项完全一致）答案 **D**。
- 第 47 题原书标注为争议题（本书 B，并注明粉笔 D），**保留原书 B**，已在 `.ocr.txt` 头注释写明。

**重转结果（`node scripts/convert-guokao.js --all` → 35 个分片）**：

| 指标 | 0.10.5 基线 | 本轮 |
|---|---|---|
| 有官方答案 | 6,066（97.7%） | **6,210（100%）** |
| 无官方答案 | 144（8 卷） | **0** |
| ERROR | 9 | **0** |
| WARN | 1,551 | 1,543 |
| QNO_GAP | 0 | 0 |

- 2021 副省级行测：135 题 / 答案 **135** / 解析 0 / ERROR **0** / WARN 12
  （8 `IMAGE_OPTION` + 3 `MATERIAL_IMAGE` + 1 `ANSWER_FROM_OCR_KEY`），答案分布 A32 / B32 / C36 / D35。
- 其余 9 题随 0.10.5 的解析修复自动回收，已逐条核对源文结论句：
  2017 副省 Q60（"故正确选项为 C"）、2018 副省 Q75（A）/ Q115（C）、2022 副省 Q78（B）、
  2022 地市 Q110（B）；申论 4 处 `MISSING_ANSWER` 与 3 卷 `ANSWER_COUNT_MISMATCH` 因题目段
  与答案段对齐修复而消解（2021 副省申论现为 5 题 5 答案）。
- 落盘后 `node scripts/validate-questions.cjs --dir public/data/questions-v2` 退出码 0：
  6,210 题，`W02 缺少解析` 的 135 条即本卷（答案/结构 0 报错）。

**遗留**：本卷 135 题解析仍为空（扫描件 OCR 正文数字/公式噪声大，按「不编造」原则不写入），
补录入口为 `.ocr.txt` 同目录文本或后续文字版解析；届时删除旁挂文件即可回退到 docx 提取。

**复跑命令**：

```powershell
node scripts/convert-guokao.js --year 2021 --papers 副省级 --no-shenlun --dry-run   # 单卷验证
node scripts/convert-guokao.js --all                                                # 正式落盘
node scripts/report-v2.js; node scripts/audit-missing-answers.js
```

> 本轮改动前的账本与分片备份：`guokao-reports.bak-ocr/`、`public/data/questions-v2.bak-ocr/`。

**独立复核（2026-10-19）**

- `scripts/run-guokao-full-check.ps1`（全量 dry-run → summary.md → 缺失账本）：92 卷 / 6,210 题 /
  答案 100.0% / ERROR **0** / WARN 1,543 / QNO_GAP 0；异常分布含 `ANSWER_FROM_OCR_KEY ×1`、
  `ANSWER_FROM_QUICKKEY ×1`。
- `scripts/run-guokao-tests.ps1`：回归测试 **PASS 10 / FAIL 0**；2017、2021 两卷 dry-run 均 ERROR 0、
  无缺失答案，2021 副省日志出现 `[旁挂] 解析 使用 OCR 文本 …（1752 字）`。
- **顺带修复**：dry-run 生成的 `summary.json` 原本丢失 `shardFiles` / `shardIndex`（只有落盘才写），
  复核一次就会把账本降级。已将 `writeShards` 拆出纯函数 `planShards`，dry-run 只计算不落盘；
  实测 dry-run 账本与落盘账本除 `generatedAt` 外逐字段一致（35 个分片、`shardIndex` 深度相等）。
- **收尾清理（2026-10-19）**：`audit-missing-answers.js` 的 `KNOWN_GAP_RE` 移除
  `^2021-副省级-行测$`、`^2022-地市级-行测$` 两条豁免（两卷缺失均已归零，规则不再可能触发；
  留着只会掩盖将来新出现的缺失）。重跑账本：92 卷 / 6,210 题 / 6,210 答案 / 缺失 0 / QNO_GAP 0。
  同时删除 `guokao-reports.bak-ocr/`（15.1 MB）与 `public/data/questions-v2.bak-ocr/`（16.9 MB）
  两个本地回滚副本——OCR 回收已稳定通过两轮独立复核，回滚点改由 Git 提交承担。
- **v2 题库结构体检现状（`validate-questions.cjs --dir public/data/questions-v2`，2026-10-19）**：
  ERROR **97** / WARN 412。97 条按真实根因拆分见 §0.12 之后的“97 ERROR 归因”；其中 23 条是
  `E07` 正则误伤“A、B 两地”这类变量枚举，属于**校验规则缺陷**而非数据缺陷。


### 0.12.1 v2 题库 97 ERROR 归因（2026-10-19，待立项）

`node scripts/validate-questions.cjs --dir public/data/questions-v2` → 6,210 题，**ERROR 97 / WARN 412**。
注意这是**落盘后的数据模型体检**，与 `convert-guokao.js` 的 `validatePaper`（转换过程自检，现 ERROR 0）
是两套规则：97 条在转换器视角下都不算错，所以“转换 0 错”与“体检 97 错”可以同时成立。

| 真实根因 | 条数 | 涉及题 | 处理方向 |
|---|---|---|---|
| `E07` 图片/公式选项：`options: []`，选项标记残留在题干 | 44 | 2000–2025 各卷，集中在数量关系/资料分析 | 需图片资源；建议先降级为 WARN（与 `IMAGE_OPTION` 同口径），不阻塞题库 |
| `E07` 正则误伤：题干中“A、B 两地”“A、B、C 三个部门”这类变量枚举 | 23 | 2011 未标注 6、2023 行政执法 6… | **修规则**：选项标记后紧跟中文/非选项文本时应放行（不是数据问题） |
| `E06` 多选答案：2003 A/B 卷第 71–80 题为多项选择，答案 `AC`/`BD` | 20 | 2003-A卷、2003-B卷 | 题库需支持多选题（answer 长度 > 1）与前端多选交互 |
| `E05`/`E06` 选项丢一条：只剩 3 个 key，答案可能正好落在丢失项 | 7（其中 3 条同时报 E06） | 2002-B-79、2003-A-84、2004-A-38、2004-B-35、2008-未标注-125、2022-地市级-114/128 | **真数据缺陷**：回源补选项文本 |

样例（原文取自分片）：

- `gk-2022-行政执法-68`（yanyu）：stem 末尾 `A.\nB.\nC.\nD.`，`options: []`，answer `D`——选项是公式图片，前端渲染不出。
- `gk-2003-A卷-71`（changshi）：options 为 国务院总理／国家主席／青岛市人民政府秘书长／海关总署署长，answer `AC`——真题多选题。
- `gk-2002-B卷-79`（shuliang）：`25，15，10，5，5，( )`，options 仅 A 10／B 5／D −5，answer `C`——C 选项缺失，题目不可作答。
- 误报样例 `gk-2011-未标注-76`：stem“某单位共有 A、B、C 三个部门…”（选项完整、answer C），被 `STEM_OPTION_MARK` 判成含选项标记。

WARN 412 构成：`W01` 题干过短 121、`W02` 缺少解析 135（全部是 2021 副省行测）、`W04` 题干含题号 153
（疑似多题合并，需抽检）、`W05` 题干过长 3（2024 三卷申论第 5 题）。

### 0.12.2 P0/P2/P3 执行结果（2026-10-19，已落地）

批准范围：P0 放宽 E07（带回归测试）、P2 输出 7 题缺选项清单移交 Codex、P1 不排期、P3 前端占位核查后记账放行。

**P0｜E07 放宽（规则缺陷，非数据缺陷）**

- 实现：新增 `scripts/lib/stem-option-mark.cjs`，`validate-questions.cjs` 改为调用 `hasStemOptionMark(stem, options)`。
  放行条件是**两个条件同时满足**：① 题目已有 ≥2 个选项；② 题干中**所有**选项标记后面紧跟的都是
  「另一个字母 + 、/,/空白」（`A、B 两地`、`a、b、c、d 四个部分`）。
- 为什么没有照字面实现“标记后紧跟汉字≥2 字就放行”：实测该口径会放掉真错。
  `gk-2021-地市级-10` 的题干是「……主要违反党的组织纪律\n**D、某市畜牧兽医局原党组书记、局长郭某……**\n10、中共中央……」
  ——选项 D 粘进题干且下一题题号合并，标记后正是汉字。按字面规则它会被放行，违反“真错误一条都不许漏网”。
  最终规则只放行**字母链**，该题继续报 E07（它也同时命中 W04）。
- 为什么必须加“已有 ≥2 个选项”前提：44 道图片题的题干残留 `A、\n\nB、\n\nC、\n\nD、`，同样构成字母链；
  若只看文本会把这 44 道真缺口一起放行（实测无该前提时被误放 29 道）。
- 结果（`node scripts/validate-questions.cjs --dir public/data/questions-v2`）：
  **ERROR 97 → 75**（E07 67 → 45），WARN 412 不变；E05 7 / E06 23 / W01 121 / W02 135 / W04 153 / W05 3 全部不变，
  无新增条目。22 条被放行的题目全部为 `optCount=4 + 字母链`（CSV 逐条 diff 见提交说明）。
- 回归测试：`node scripts/test-e07-rule.cjs`（或 `npm run test:e07`）→ **PASS**，四条不变量：
  ① 新命中 ⊆ 旧命中；② 被放行者必须 `optCount≥2` 且全为字母链；③ 旧命中且无选项者必须仍命中（44 道一条不漏）；
  ④ 标记后跟正文的有选项题目必须仍命中（保留 `gk-2021-地市级-10`）。

**P2｜7 道缺选项题移交 Codex**

- 清单：`guokao-reports/v2-缺选项待回填.md`（含总览表 + 每题题干/现有选项/缺失 key/答案）。
  7 题：`gk-2002-B卷-79`（缺 C）、`gk-2003-A卷-84`（缺 A）、`gk-2004-A卷-38`（缺 B）、`gk-2004-B卷-35`（缺 B）、
  `gk-2008-未标注-125`（缺 A）、`gk-2022-地市级-114`（缺 C）、`gk-2022-地市级-128`（缺 B）。
  其中 2002-B-79、2004-A-38、2004-B-35 的答案正落在缺失项上（当前必然判错）。
- 约定已写入文档：联网核对原卷回填原文；图片选项则标 `isImageQuestion`；确实找不到写 `missing` 并在此记账，不补占位文本。
- 另：粗筛时发现的 `gk-2020-地市级-70`、`gk-2020-副省级-74`、`gk-2024-地市级-67`、`gk-2024-行政执法-64`、
  `gk-2025-副省级-26` 也是“只剩 BC 两个 key”，但它们是图片题（选项为图），归 P3，不属于缺文本选项。

**P3｜图片/公式选项：确认前端已占位，记账放行**

- 前端：`PracticeArena.tsx:964-971` 在 `options` 为空且 `isImageQuestion === true` 时渲染
  「本题为图片题（图形推理 / 图表类）… 原题选项为图片，文本化时未能保留」；`questionValidation.isValidQuestion`
  对图片题放行，不会被 `filterValidQuestions` 过滤掉。**无需改动。**
- 线上数据佐证：v1（`public/data/questions`，前端实际加载的目录）有 1,180 道 `isImageQuestion`，其中 **1,031 道无选项**
  ——占位分支已在线上大量使用。
- v2 现状：图片题 350 道（全部无选项、全部会走占位），其中 **44 道**题干残留 A./B./C./D. 标记（即那 44 条 E07）。
  这 44 道目前**不在 v1 中**（v1/v2 ID 不重叠），前端尚未切到 v2；接入 v2 后即按占位渲染，属于“上线前已知损失”。
- 账本：`guokao-reports/v2-known-losses.md`（图片题 44 道 + 多选 20 道），不改数据、不改校验规则。

**P1｜多选支持**

按批准不排期：2003 A/B 卷 71–80 共 20 题保持现状（E06 继续报出，作为待产品化的显式债务），面试季之后再立项。

### 0.12.3 决策归档：E07 保留项与 backlog 口径（2026-10-19，已确认）

**E07 保留项**

- `gk-2021-地市级-10` 继续作为真错报出：题干混入上一题选项 D，并合并下一题题号「10、」。
  确认原则：**出现题号串 / 选项粘连时不豁免**。P0 后 ERROR 75 中包含此条，规则层不再讨论豁免。
- 已记入 `guokao-reports/v2-known-losses.md` §3（同时保留 W04 命中，作为“题号串”样本）。

**backlog 处理口径**

- v1（`public/data/questions`，2002–2014 等旧数据）现存 **2,086 ERROR 不修**：
  publish 时由 v2 整体替换，属自然消亡；替换完成前不投入修复人力，也不作为验收指标。
- 2021 副省级 **135 条“缺少解析”（W02）不单独补**：等扫描件 OCR/文字版对齐后随重转自然解决。
  当前 `.ocr.txt` 只提供答案，按“不编造”原则不写入解析。
- 后续 ERROR/WARN 只对 v2 计数负责（P0 基线：ERROR 75 / WARN 412）。

**publish 前置（核查结论）**

- 仓库**没有 `--apply` 开关**：`run-guokao-full-check.ps1` 全程 dry-run；正式落盘命令是 `node scripts/convert-guokao.js --all`。
- 该命令**按源文件重建** `public/data/questions-v2/`（35 分片 + `index.json`），会覆盖手工修改的分片
  → 缺选项回填等数据修复必须安排在 apply **之后**，否则会被重转冲掉。
- 前端仍加载 `/data/questions/`（v1），且 v2 目录**没有 `idMap.json`**（错题本 / 知识点筛选依赖它查分片）。
  直接切目录会导致这两个功能取不到数据 → 已由 **§0.12.4 方案 A** 定稿：不改 loader，publish 时合并并重建 idMap。

### 0.12.4 publish 方案定稿：方案 A（合并进 /data/questions/）（2026-10-19，已确认）

**顺序锁定**：dry-run（`run-guokao-full-check.ps1`）→ apply（`node scripts/convert-guokao.js --all`）
→ Codex 回填 7 道缺选项 → `validate-questions.cjs` 复校验 → 提交 → publish 合并。

**1. 数据回填必须双写（已写入 Codex 移交清单第 6/7 条）**

- 只改 `public/data/questions-v2/` 分片不算完成：必须同时改 `source-data` 源文档，或提供幂等 patch 脚本
  `scripts/patches/<名称>.cjs`，保证 `convert-guokao.js --all` 重转后不丢。
- 重转必须发生在回填**之前**；回填之后只跑校验与合并。

**2. loader 不切目录（方案 A）**

- `src/hooks/useQuestions.ts` 继续读 `/data/questions/`；publish = 把 v2 的 `national-*` 分片并入该目录，
  删除 v1 多出的旧国考分片（`national-none-changshi-6.json`，68 题），再重建索引
  → 一个数据目录、一套索引，省考老数据零影响。
- 只覆盖同名文件是不够的：v1 多出的分片不删会以旧题继续留在索引里。

**3. 索引随 publish 重建（硬性）**

- 合并脚本 `scripts/publish-merge-v2.cjs`：`npm run publish:dry`（只写报告）/ `npm run publish:apply`。
- `index.json` 与 `idMap.json` 按合并后的**实际文件全量重建**（167 keys / 约 2.66 万 ID），覆盖省考老数据；
  错题本、知识点筛选的反查表不再缺。
- `--apply` 自检：旧国考分片清零、题目数与计划一致、index 精确覆盖全部文件、idMap 覆盖全部 ID，任一失败即中止。

**4. 错题 ID 不迁移（A1）**

- v1 `real-*` 与 v2 `gk-*` 无交集，历史错题记录自然失效，不做映射。
- 对外更新日志口径：**“题库已整体翻新，历史做题记录已重置”**。

**dry-run 基线（2026-10-19 实测，报告 `guokao-reports/publish-plan.md`）**

- 覆盖同名 17 / 新增 18 / 删除 1（68 题）/ 未触碰 248；合并后 283 文件 / 29,687 题。
- 可渲染 28,175（图片题占位 2,107、主观题 312），跳过 1,512（多为 v1 旧省考脏数据，前端本就会过滤）。
- v2 内部重复 ID 0、与省考老数据 ID 冲突 0；index / idMap 自检通过。

### 0.12.5 浙江 publish 合并（2026-10-19，已 apply）

- 合并脚本 `scripts/publish-merge-zhejiang.cjs`：`npm run publish:zj:dry`（只写报告）/ `npm run publish:zj:apply`。
- 源分片名 `zhejiang-none-*` 必须映射为 `provincial-浙江-*`；否则 loader 按 `zhejiang / none` 解析，浙江分类加载不到。
- dry-run：源 27 分片 / 4,743 题；旧浙江 11 分片 / 1,337 题（1,324 个唯一 ID）。
- 覆盖 11 / 新增 16 / 删除 0 / 未触碰 272；合并后 299 文件 / 33,093 题 / 167 index keys / 30,009 idMap。
- 三项检查：index 引用存在、index 精确覆盖、idMap 覆盖全部 ID，全部通过；新分片重复 ID 0、跨省冲突 0。
- 新浙江可渲染 4,679 / 4,743（98.7%）；旧浙江 1,284 / 1,337。
- ID 策略 A1：旧 `prov-浙江-*` 不迁移；对外文案照旧“题库已整体翻新，历史做题记录已重置”。
- **2026-10-19 已执行 `npm run publish:zj:apply`**：写入 27 个浙江分片并重建 index/idMap；合并后 299 分片 / 33,093 题 / 167 index keys / 30,009 idMap，自检通过。
- 加载校验：浙江 4,743 题，可渲染 4,679（98.7%）；全库有效 31,262 题，可渲染 30,271，跳过率 3.170%。`npm run build` 通过（8.22s）。
- 报告：`guokao-reports/publish-zhejiang-plan.md`（模式 APPLIED）。

- **前端完整实现**：行岸公考刷题平台（React + Vite + TypeScript + Supabase），包含笔试专区、面试专区、学情总览、全局成长、备考社区等模块。
- **Git 仓库**：已初始化并提交全部代码（50 个文件）。
- **GitHub 仓库**：公开仓库 `shanganlian/gongkao-shuati` 已创建并推送。
- **Netlify 部署**：已成功上线并自动部署，线上地址：https://elaborate-faloodeh-f2ba0e.netlify.app
- **构建链路修复**：添加了 `netlify.toml`（构建命令 & 发布目录）、`.nvmrc`（Node 20）、`.npmrc`（legacy-peer-deps），并放宽了 `tsconfig.json` 严格检查。

### 0.12.6 v2 缺选项回填（2026-10-19）

- `v2-缺选项待回填.md` 的 7 道 E05 题已全部找到原文选项并回填，没有触发 2007 Q21 的 `missing` 分支。
- 分片：`national-none-yanyu-0.json`、`national-none-shuliang-0.json`、`national-none-ziliao-1.json`、`national-none-ziliao-3.json`。
- 校验：ERROR 75→65，E05 7→0，E06 23→20（3 道题的标准答案原先落在缺失项上）。
- 幂等命令：`node scripts/patches/2026-10-19-gk-missing-options.cjs`。
- 对照记录：`guokao-reports/v2-缺选项回填对照-2026-10-19.md`。

### 0.12.7 三省 v2 解析错配扫描（2026-10-19，福建已修复）

- 脚本：`scripts/audit-v2-explanation-module.cjs`（只读，不改数据）。
- 修复前：57 分片、9,629 条记录（9,389 个唯一 ID）；常识→言语核心 31 / 扩展 53，言语→资料核心 11 / 扩展 59；人工分层真候选 44 条（A2 25 + A1 19，全部福建）。
- 福建修复后重跑：58 分片、9,629 条记录（9,629 个唯一 ID）；常识→言语 7/8、言语→资料 11/53，分层全部为 A3 / B2 / B4 误报，真候选 **0**。
- 福建 2010 春季 Q36–Q60 已迁回 `yanyu`；2011 917 常识 Q2–Q20 已挂回 917 自己的解析（Q11 已复核）。
- 报告 / 明细：`guokao-reports/v2-解析错配-三省.md`、`guokao-reports/v2-解析错配-三省.csv`。

### 0.12.8 福建 v2 定向修复（2026-10-19）

- 根因：① 2010 春季模块标题为「二、言语能力」，旧 `HEADER_RE` 未识别；② 2011 / 2012 同年两套联考共用 label「联考」，产生同 ID 覆盖并导致答案解析串挂。
- 解析器修复：`convert-guokao.js` 增加精确标题「言语能力」；`overnight-provinces.cjs` 的 `parsePaperLabel` 将同一年联考按文件名日期拆为 `424联考 / 917联考 / 421联考 / 915联考`。
- 定向重转 5 套卷：2010 福建春季、2011 424、2011 917、2012 421、2012 915；未按关键词批量改 `module`。
- 结果：福建 2,564 题 / 唯一 ID 2,564 / 重复 ID 组 0；2010 Q36–Q60 言语 25/25；2011 917 常识 Q1–Q20 20/20 且解析归位。
- 账本 / 对照：`guokao-reports/fujian-v2-修复后账本.md`、`guokao-reports/fujian-v2-修复对照.md`、`guokao-reports/fujian-v2-修复对照.csv`、`guokao-reports/fujian-v2-校验.txt`。
- 写入后清理：首次写入误带审计字段 `__file` 1,964 条，已用 `scripts/clean-fujian-v2-internal.cjs --apply` 清除；分片与 `questions.json` 残留 0，记录见 `guokao-reports/fujian-v2-内部字段清理.txt`。
- 备份：`guokao-reports/backup-fujian-v2-2026-10-19T11-36-56-040Z/`（修复前干净数据）。
- 边界：只改 `public/data/questions-v2-provincial/福建/`；线上 `public/data/questions/` 本次仅含浙江 apply 变更，未写福建。

### 0.12.9 福建 v2 文本层清洗 + publish apply（2026-10-20）

- 清洗脚本 `scripts/fix-fujian-ocr-spaces.cjs`（dry-run 默认，`--apply` 写入并备份）；备份 `guokao-reports/backup-fujian-v2-spaces-2026-10-20T11-32-22-388Z`。
- 结果：2,564 题全部过检，2,496 条有变更（选项 2,050 处 / 764 题、解析 2,463 条、keyPoints 1,250 条）；残留空格 32,448 → 1,046（记录 2,487 → 132），剩余均为并列项 / 表格 / 英文词组空格。
- keyPoints：删除模板残句 430 项；整组残句时首句回填 53 条、置空 119 条；`本题考查…` 作为考点标签保留。
- 写后自检：分片与 `questions.json` 一致（2,564 / 2,564 唯一 ID）、清洗幂等、index 自检通过；空白不变式 4,513 处 / 失败 0。
- 回归：`verify-fujian-repair` ✅（Q40 改为去空白比对）；`verify-fujian-v2` ✅（16 分片 / 2,564 题 / 重复 ID 0）；福建 `validate-questions` 清洗前后均为 ERROR 25 / WARN 192（E02 17 + E03 2 + E07 6）；全库 `validate-questions`（apply 前）30,009 题 / ERROR 1,970 / WARN 20,811 不变；`verify-question-loading`（apply 前）31,262 题 / 可渲染 30,271 / 跳过率 3.170%。
- publish 脚本 `scripts/publish-merge-fujian.cjs`（`publish:fj:dry` / `publish:fj:apply`）完成 dry-run：源 16 分片 / 2,564 题；旧福建 8 分片 / 712 题；覆盖 8 / 新增 8 / 删除 0 / 未触碰 291；合并后 307 分片 / 34,945 题 / index 167 keys / idMap 31,937。
- 三项对账全通过：① 变更文件全部命中 `provincial-福建-*`，国考 / 其他省 0 改动；② `299 − 8 + 16 = 307`、`33,093 − 712 + 2,564 = 34,945`；③ index / idMap 三项一致性检查通过，无阻塞项。
- 报告：`guokao-reports/publish-fujian-plan.md`；账本：`guokao-reports/fujian-v2-修复后账本.md` 第 6–8 节；清洗明细 `guokao-reports/fujian-v2-空格清洗.md`。
- **已执行 apply（2026-10-20）**：`npm run publish:fj:apply` 写入 16 个 `provincial-福建-*` 分片并重建 index / idMap；线上 `public/data/questions/` = 307 分片 / 34,945 题 / index 167 keys / idMap 31,937，福建 16 分片 / 2,564 题。
- 写后复核：三项对账复跑通过；`verify-question-loading` 全库 33,160 题 / 可渲染 32,189 / 跳过率 2.928%，福建 2,564 题 / 可渲染 2,545；全库 `validate-questions` 31,937 题 / ERROR 1,935 / WARN 20,335（旧福建 712 题换成新 2,564 题后 ERROR 净减 35）。
- `npm run build` 通过（exit 0，1,728 模块 / 1.51s）。

### 0.12.10 安徽 v2 文本层清洗 + publish apply（2026-10-20，已 apply + drop）

- 清洗脚本 `scripts/fix-anhui-ocr-spaces.cjs`（dry-run 默认，`--apply` 写入并备份）：只清洗 `options[].text` / `explanation` / `keyPoints`，不改 `stem` / `title` / `answer` / `module` / `id`，不动线上目录；`questions.json` 保留原始试卷顺序，分片按模块顺序，两者 ID 集合 / 内容一致。
- 清洗结果：2,322 题全部过检，2,226 条有变更（选项 1,923 处 / 688 题、解析 2,207 条、keyPoints 1,136 条）；空白变更 4,130 处 / 失败 0；keyPoints 删除模板残句 355 项、首句回填 58 条、置空 80 条（空数组 201 → 281）；行内残留空格 34,042 → 464 处（记录 2,227 → 62），剩余为并列项 / 表格 / 英文词组空格。
- 写后自检：2,322 题 / 2,322 唯一 ID；分片与 `questions.json` 内容一致；清洗幂等（复跑 0 变更）；index 自检通过。备份 `guokao-reports/backup-anhui-v2-spaces-2026-10-20T12-56-47-890Z/`（不入 Git）。
- publish 脚本 `scripts/publish-merge-anhui.cjs` 以 `--apply --drop-uncovered` 执行（`npm run publish:ah:apply:drop`）：源 15 分片 / 2,322 题；旧安徽 7 分片 / 597 题；覆盖 6（1,200 新 / 585 旧）、新增 9（1,122）、删除 1（旧 `provincial-安徽-shenlun-0.json`，12 题）、未触碰 300 / 34,348 题。
- 合并后线上 `public/data/questions/`：315 分片 / 36,670 题 / index 166 keys / idMap 33,735；安徽 15 分片 / 2,322 题（常识 465、判断 656、数量 406、言语 501、资料 294），旧 `prov-安徽省-*` 524 个唯一 ID 全部退出 idMap，无残留。
- 三项对账全通过：① 变更文件全部命中 `provincial-安徽-*`，国考 / 其他省 0 改动；② `307 − 7 + 15 = 315`、`34,945 − 597 + 2,322 = 36,670`；③ index 精确覆盖 / idMap 覆盖全部 33,735 个 ID / 无悬空引用。
- 写后复核：`verify-question-loading` 全库 34,933 题 / 可渲染 33,939 / 跳过率 2.845%；安徽 2,322 题 / 可渲染 2,287（98.5%）；浙江 4,743、国考 6,210、福建 2,564 均未变。`npm run build` 通过（exit 0，1,728 模块 / 1.65s）。
- 报告：`guokao-reports/publish-anhui-plan.md`（APPLIED，含 `--drop-uncovered` 说明）、`guokao-reports/anhui-v2-空格清洗.md` / `.csv`。
- **待办：安徽申论补录**。按 A1 原则本次全量替换已删除旧 `provincial-安徽-shenlun-0.json`（2024 A/B/C 卷 12 题，旧 ID `prov-安徽省-2024-*`，可从 Git 历史取回原文），安徽暂为 100% 新管线客观题、申论缺口 12 题；后续用正规申论流水线补录后，重建 index / idMap 并复跑 `verify-question-loading` + `npm run build`。

## 2. 正在进行、尚未完成的改动

- **AI 功能**：依赖 `server.ts`（Express 后端），纯静态部署后不可用，尚未改造为 Netlify Serverless Functions，也未配置 `GEMINI_API_KEY` 环境变量。
- **数据库迁移**：`supabase/migrations/create_knowledge_progress.sql`（知识点掌握进度表 + RLS）尚未应用到远程 Supabase。
- **安徽申论补录**：2024 A/B/C 卷 12 题（旧 `provincial-安徽-shenlun-0.json` 已按 A1 全量替换删除），待正规申论流水线补录；补录后重建 index / idMap 并复跑加载校验与构建。

## 3. 下一个任务从哪里继续

- **若继续做数据库**：先调用 `supabase_get_project` 确认连接，再用 `supabase_apply_migration` 应用 `create_knowledge_progress.sql`。
- **若继续做 AI**：在 Netlify 配置 `GEMINI_API_KEY` 环境变量，并将 `server.ts` 改造为 Netlify Serverless Functions。
- 日常开发推送至 GitHub `main` 分支后，Netlify 会自动构建部署。

## 4. 2026-10-22 省考 v2：五省上线 + 重复卷 ID + 五省修复轮

### 4.0 远端基线核对

- 昨晚提交 `3868fc7 add provincial shenlun v2 draft` **已在 GitHub 远端**（本次 push 前 `origin/main` 即该提交）。
- 本轮 push 后远端 HEAD：`43878a1 publish shaanxi ningxia yunnan gansu hebei`。

### 4.1 五省 publish（陕西 / 宁夏 / 云南 / 甘肃 / 河北，已 apply + build + push）

- 逐省执行 `node scripts/publish-merge-provinces.cjs --province <省> --apply --drop-uncovered`，五省均 `EXIT=0`、阻塞项 0。
- 线上规模：**330 分片 / 41,384 题 → 365 分片 / 49,467 题**，`index` 165 keys。
- 增量：陕西 2,355（旧分片 −802）、宁夏 1,972（−446）、云南 1,360、甘肃 1,316、河北 2,328（首次上线，无旧河北分片）。
- 加载校验 `node scripts/verify-question-loading.cjs`：`EXIT=0`，**47,943 题 / 可渲染 46,979 / 跳过率 2.011%**。
- 构建 `vite build`：`EXIT=0`，1,728 模块 / 2.85s。
- 提交 `43878a1`（75 files），普通 `git push` 6.6s 成功：`3868fc7..43878a1`。
- 报告：`guokao-reports/publish-{shaanxi,ningxia,yunnan,gansu,hebei}-plan.md`（均为 APPLIED）。

### 4.2 同年重复卷 ID 修复（海南 / 山西 / 北京）

- `scripts/overnight-provinces.cjs`：`pairDocs` 按 `${year}|${label}` 分组，第二套起 `dupIndex>0`；`buildPaperQuestions` 的正题与占位题 ID 统一追加 `-2` / `-3` 后缀，卷别 label 不变。
- 重转结果：海南 2,219 / 2,219 唯一 ID（120 个 `-2`）、山西 2,431 / 2,431（135）、北京 2,597 / 2,597（135），`dupGroups=0`。
- 三份 dry-run 重出（`EXIT=0`、**阻塞项：无**、`dupInSource=0`）：
  - 海南：源 13 分片 / 2,219 题（旧 6 / 699）→ 372 分片 / 50,987 题；
  - 山西：源 14 分片 / 2,431 题（旧 7 / 714）→ 372 分片 / 51,184 题；
  - 北京：源 15 分片 / 2,597 题（旧 8 / 759）→ 372 分片 / 51,305 题。
- 报告：`guokao-reports/publish-{hainan,shanxi,beijing}-plan.md`；已在 §4.5 一并 apply。

### 4.3 五省诊断修复（逐省重转，未 publish）

有效覆盖 = `withAnswer ÷ (questionCount − placeholderCount)`。

| 省 | 根因 | 修复 | 有效覆盖 |
| --- | --- | --- | --- |
| 上海 | 多选 `正确答案：BC/ABCD` 被单字母规则截断 | 多选优先模式 + `故正确答案为X{1,4}` + `【N—正确答案X】` 标记 + 同 label 多答案按“纯答案册 → 相似度”消歧 | 3,615/4,088 **88.4% → 4,020/4,088 98.3%** |
| 深圳 | 2025 速查表 `1、D` 在 HTML 文本层压成一行；2020 行测1/2/思维能力同 label 串答案 | 速查逐行 + 连续 token 解析；速查覆盖 ≥80% 时以表为准；新增 行测1 / 行测2 / 思维能力 卷别 | 1,583/1,671 **94.7% → 1,639/1,671 98.1%**；2025 答案 2 → 20 |
| 黑龙江 | 2009/2015/2018/2019/2021 多套卷同 label 串答案；2019 `2 本题…` 无标点合并题块 | 新增 省直/公检法/边远/边境/公安/B卷 卷别；无标点题号仅在“题号==期望值”时接受；`【N—正确答案X】` 标记 | 3,056/3,474 **88.0% → 3,321/3,474 95.6%**；2019 省直 1→126、公检法 1→83；2024 1→117 |
| 天津 | 2025 源册仅 5KB、只有 13 题答案（有效 114 题）；2015 0322/0919 同 label | 未标注多候选按文件名相似度消歧 | 1,973/2,119 **93.1% → 1,976/2,119 93.3%**；2025 仍 13/114（待源册补录） |
| 广东 | 2004/05 上下半年、2013 一卷/三卷、2019/20 选调同 label 串答案；2008 裸字母答案 | 新增 上半年/下半年/一卷/三卷/思维能力/综合行政/选调 卷别；题本目录排除申论；裸字母 `D毋庸置疑` 规则（排除 `B项…`） | 3,075/3,350 **91.8% → 3,129/3,350 93.4%**（旧口径含误收申论卷为 90.4%） |

- 说明：广东 2021 县级 `q=9` 是源 docx 仅约 2KB（题本截断），不是解析规则问题。
- 修复仅写 `public/data/questions-v2-provincial/<省>/` 与 `guokao-reports/省考-<省>-转换/`，**未写线上 `public/data/questions/`**。

### 4.4 剩余与下一步

- **P2 源册补录（known-losses 放行，不阻塞）**：天津 2025（缺约 101 题答案）、上海 2007（缺 13）、广东 2008（缺 24）、黑龙江 2010（缺 53）、广东 2021 县级（题本截断）；账本见 §4.6 / `guokao-reports/省考-v2-known-losses.md`。
- **P1 选项抽取诊断（已完成，见 §4.8）**：天津 / 广东 / 深圳的高跳过率 **94.3% 来自占位题**（原卷 Word 文本层缺失），真实缺陷仅 61 题；不支持「图片题漏标」假设，**不做批量 `isImageQuestion` 打标**。可修的转换 bug 只有 15 题（双词选项被拆成多段后误绑为 `material`），建议独立小批次修 + 用天津 2012 做回归，不与八省上线混在一起。
- 海南 / 山西 / 北京 + 上海 / 深圳 / 黑龙江 / 天津 / 广东：**已 apply → 校验 → build → commit → push 全部完成**，见 §4.5。

### 4.5 八省 publish 收官（海南 / 山西 / 北京 + 上海 / 深圳 / 黑龙江 / 天津 / 广东，已 apply）

- 执行顺序：海南 → 山西 → 北京 → 上海 → 深圳 → 黑龙江 → 天津 → 广东，逐省 `node scripts/publish-merge-provinces.cjs --province <省> --apply --drop-uncovered`，**全部 `EXIT=0`、阻塞项 0**。
- 线上规模：**365 分片 / 49,467 题 → 440 分片 / 67,236 题**，`index` 167 keys、`idMap` 65,464 条。
- 分省增减（源题数 / 被替换·删除的旧题数 / 合并后累计）：

  | 省 | 源分片 | 源题数 | 旧分片 / 旧题 | 动作（覆盖 / 新增 / 删除） | 合并后累计 |
  | --- | ---: | ---: | ---: | --- | ---: |
  | 海南 | 13 | 2,219 | 7 / 703 | 6 / 7 / 1（4 题） | 371 文件 / 50,983 题 |
  | 山西 | 14 | 2,431 | 7 / 714 | 7 / 7 / 0 | 378 / 52,700 |
  | 北京 | 15 | 2,597 | 8 / 759 | 8 / 7 / 0 | 385 / 54,538 |
  | 上海 | 25 | 4,305 | 9 / 933 | 8 / 17 / 1（8 题） | 401 / 57,910 |
  | 深圳 | 11 | 1,862 | 0 / 0 | 0 / 11 / 0 | 412 / 59,772 |
  | 黑龙江 | 21 | 3,680 | 6 / 323 | 5 / 16 / 1（6 题） | 427 / 63,129 |
  | 天津 | 14 | 2,431 | 8 / 583 | 7 / 7 / 1（1 题） | 433 / 64,977 |
  | 广东 | 21 | 3,854 | 14 / 1,595 | 12 / 9 / 2（81 题） | 440 / 67,236 |

- 三项对账逐省通过：① 变更文件全部命中 `provincial-<本省>-*`，国考 / 其他省 0 改动（未触碰 358–419 个分片）；② 文件数 `365 − 旧 + 新 = 440`、题数 `49,467 − 旧题 + 源题 = 67,236` 逐省等式成立；③ 每省 `index OK，idMap OK`（写后自检，index 精确覆盖 / idMap 无悬空）。
- 脚本加固（`scripts/publish-merge-provinces.cjs`）：新增分省配置（`OLD_ID_PREFIX` / `NEW_ID_PREFIX` / 分片命名）覆盖八省；ID 前缀守卫改为**只对保留件强校验**——被替换 / 删除的旧分片若混入外省 ID 仅记数不阻塞（本轮广东 `badOldIds=252`、`keptBadIds=0`），保留件混入外省 ID 仍拒绝写入；apply-only 的「新旧 ID 交集」守卫保持（防止重复 apply）。
- 加载校验 `node scripts/verify-question-loading.cjs`：**66,087 题 / 可渲染 63,683 / 跳过 2,404 / 3.638%**；其中 **占位题（源文缺失）1,807 题，真实缺陷跳过 597 题 / 0.903%**（脚本已把两者分开统计）。分省：

  | 省 | 分片 | 题数 | 可渲染 | 跳过 | 跳过率 | 其中占位题 | 真实缺陷 |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | 上海 | 25 | 4,305 | 4,048 | 257 | 5.97% | 217 | 40 |
  | 深圳 | 11 | 1,862 | 1,656 | 206 | 11.06% | 191 | 15 |
  | 黑龙江 | 21 | 3,680 | 3,469 | 211 | 5.73% | 206 | 5 |
  | 天津 | 14 | 2,431 | 2,095 | 336 | 13.82% | 312 | 24 |
  | 广东 | 21 | 3,854 | 3,328 | 526 | 13.65% | 504 | 22 |

  跳过主因**不是选项切分**：三省 1,068 条跳过里 1,007 条（94.3%）是占位题（原卷 docx 文本层缺失，题干写着「原卷此题在 Word 文本层缺失」），真实缺陷仅 61 条。此前「广东资料分析 831 题中 382 题缺选项」的口径有误——该分片 382 条跳过中 **373 条是占位题，真实缺选项只有 9 条**。完整诊断见 §4.8。
- 构建 `node node_modules/vite/bin/vite.js build`：**通过（✓ built in 3.11s，1,728 模块）**。
- 报告：`guokao-reports/publish-{hainan,shanxi,beijing,shanghai,shenzhen,heilongjiang,tianjin,guangdong}-plan.md`（均为 APPLIED）。
- 账本：`guokao-reports/省考-v2-known-losses.md`（P2 源册缺口 5 项 + `--drop-uncovered` 删除的旧申论 22 题 + 广东外省 ID 说明）。

### 4.6 known-losses 记账（决策 3）

- 新建 `guokao-reports/省考-v2-known-losses.md`，按国考 `v2-known-losses.md`（144 道无官方答案先例）口径记账：
  - **P2 源册缺口 5 项**：天津 2025（114 题仅 13 题有答案，缺 101）、上海 2007（缺 13）、广东 2008（缺 24）、黑龙江 2010（缺 53）、广东 2021 县级（源 docx 约 2KB 截断，仅 9 题）。
  - **旧申论分片随 `--drop-uncovered` 删除**：上海 8 + 黑龙江 6 + 天津 1 + 广东 7 = 22 题（深圳 0），参照安徽申论先例，待正规申论流水线补录。
  - **广东旧分片外省 ID 252 个**：随旧分片整体消失，不迁移。
- 决策：**不补占位、不臆造答案、不阻塞 publish**；批量 OCR / 源册补录时统一处理，补录后重转 → dry-run → apply。

### 4.7 本机锦囊

- **push 首选 curloptResolve**（直连被重置 / 超时 / `Empty reply from server` 时）：

  ```powershell
  git -c http.version=HTTP/1.1 `
      -c http.curloptResolve=github.com:443:20.205.243.165 `
      -c http.curloptResolve=api.github.com:443:20.205.243.165 `
      push origin main
  ```

- 备选 IP（逐个替换 `20.205.243.165` 重试）：`20.205.243.165`、`20.205.243.168`、`140.82.112.3`、`140.82.114.3`。
- 自动化脚本：`node _push_with_timeout.cjs`（先普通 push；失败后逐个 IP 走 curloptResolve，每次 60s）。
- 推送前后核对：

  ```powershell
  git log origin/main -1 --oneline
  git ls-remote origin main
  ```

- 2026-10-22 实测：普通 push 6.6s 成功（`3868fc7..43878a1`）；上述 curloptResolve 命令作为首选备用口径，若普通 push 失败直接改用。


### 4.8 缺选项诊断（天津 / 深圳 / 广东，2026-10-22）

工具：`node scripts/diagnose-missing-options.cjs` → `guokao-reports/缺选项诊断-天津深圳广东.md`（可重跑）。

- **口径纠正**：三省渲染跳过 1,068 题里 **1,007 题是占位题**（`isPlaceholder: true`，原卷 docx 文本层缺失），非占位缺陷只有 61 题。广东资料分析 831 题 / 382 跳过的真实构成是 **373 占位 + 9 真缺陷**，不是「资料分析选项全部丢失」。
- **图片假设不成立**：非占位缺选项题的图片关键词命中率 0%–4.2%（同省言语题基线 0.6%–4.4%），题干内残留 A/B/C/D 的比例 0%。**不做批量 `isImageQuestion` 打标**——占位题不是图片题，打标会把源册缺口伪装成「图片题暂不支持」。
- **61 题真实缺陷分类**：
  - 选项整块落进 `material` 字段 **15 题**（天津 11 / 深圳 3 / 广东 1）。成因已定位到源 docx 排版：双词选项被拆成多段（`A、天方夜谭` / 空行 / `想方设法` / `B、…`），`splitStemAndOptions` 只认同块内 A→D 连续标记，失败后整块被当材料，且**错绑到后一题**（天津 2012 第 26 题选项挂到第 27 题，两题 `material` 完全相同）。
  - 判断题无选项 **5 题**（广东 2024 常识，题干自带「（判断题）」，源文没有 ABCD）。
  - 题干就是「暂缺」**6 题**（深圳 2020）；其余为源文截断（题干停在半句、源文本身无选项）。

## 0.11 行测二级分类（subModule）

- 分类表：`shared/sub-modules.json`（常识 7 类 / 言语 4 类 / 判断 4 类 / 数量 5 类 / 资料 4 类）。
- 写回字段：`subModule`（子类名）、`subModule_confidence`（`high` / `low`）；`low` 为待人工复核，不进入前端二级筛选。
- 北京常识试点：656/656 写回，0 失败，37 道 low（5.6%）；报告见 `guokao-reports/submodule-北京-changshi-试点汇总-2026-11-02.md`。
- 前端：练习页模块 pills 下方新增二级分类 chips；只展示当前考试/省份/模块下确实有已分类题目的子类；切模块、切省份或子类无数据时自动回到“全部”。相关文件：`src/components/PracticeArena.tsx`、`src/hooks/useQuestions.ts`、`src/data/subModules.ts`。
- 前端（2026-11-02 补全）：chips 显示该子类题数，选中子类后模块标签变成「常识判断（法律 · 123）」；chips 可再次点击取消，「全部」chip 显示模块总题数；题目卡片头部新增子类徽标（low 显示「待复核」）。题量来自构建期快照 `src/data/submoduleCounts.json`（`scripts/build-submodule-counts.cjs`，随 `npm run build` 的 prebuild 自动重算），避免等 35MB 分片加载完才有数字；快照缺失时回退到已加载题库现算。`npm run submodule:counts` / `submodule:counts:check` 可手动生成/校验。
- 已验证：本地 dev + Edge headless 真实点击 18 项断言全过（北京常识 656→法律 123，连翻 3 题均为法律；省份切上海后法律 217；申论思维不显示 chips）。
- 省份筛选（2026-11-02）：省考模式去掉「全部省份」，下拉直接列 33 个具体省份 / 单列市（`PROVINCE_LIST_BY_FREQUENCY`，江浙粤鲁等按报考热度排序；含数据里独立成省的深圳 / 广州共 3,162 题，否则去掉「全部省份」后不可达；联考不列入——全库仅 1 题单独标联考，且每个省份视图已自动包含联考题）。默认选中上次目标省份（`localStorage.xingan_active_province`，只在选中具体省份时写入，避免国考「全部省份」冲掉记忆），新用户落到频次首位「江苏」；国考仍隐藏省份筛选，全部考试 / 事业编仍保留「全部省份」（原样）。本地 dev + Chrome headless 真实交互 19 项断言全过：33 项顺序、无「全部省份」、新用户默认江苏、切西藏后刷新 / 切国考 / 切全部 / 切事业编再回省考仍记西藏、深圳可达。
- 脚本：`scripts/classify-submodules.cjs`；全库命令 `npm run submodule:all`；仅同步源目录 `npm run submodule:sync`。
- 全库（562 个分片 / 95,278 题）已启动，完成后自动同步国考 `questions-v2/` 与省考 `questions-v2-provincial/` 源目录、做数据校验与 `index:check`，并生成 `guokao-reports/submodule-全库-汇总-2026-11-02.md`。
- 真实 `release:data` / `release:frontend` 仍由人工输入 SSH 密码执行。

- **收益评估**：修「多段选项合并 + 回挂未闭合题」可救回 15 题（跳过率 13.82%→13.3% 量级），对 1,007 道占位题无效；占位题只能靠源册补录 / OCR。
- **决策**：本轮不重转三省、不改 parser（避免为一万分之一量级收益动 7,500 题 ID）；parser 修复列为独立小批次，用天津 2012《行测》第 24–30 题做回归样例，修好后 `--dry-run` → `--apply` → 重跑 `verify-question-loading` → 单独 commit。八省数据维持已上线状态（`f4a001a`）。
- **脚本改进**：`verify-question-loading.cjs` 现在把「占位题」与「真实缺陷」分开统计（全库 66,087 / 跳过 2,404 = 占位 1,807 + 真实 597，真实缺陷率 0.903%），后续跳过率不再被源册缺口放大。
- **更正（同日，见 §4.9）**：双词选项的真实成因是源 docx 把选项排成 **2×4 表格**（`A、天方夜谭 | 想方设法 | B、…`），不是段落拆分；此外天津 2012「80、90 年代」被误判为第 80 题，`lastNum` 跳到 80 使 Q28–79 整段丢失、多出 46 个占位题。该批次已完成修复与重转。

### 4.9 选项表格 / 跨年代题号解析修复（天津 / 深圳 / 广东重转，2026-10-22）

- **两处 bug**：
  1. `tableToLines` 把表格单元格拼成 `A、甲 | 乙 | B、…`，言语模块把整块当材料并绑定到下一题（天津 2012 Q26 选项 → Q27 `material`）；
  2. `80、90 年代，他在世界流行乐坛的地位……` 被当作第 80 题（跨年代数字 + 跳号），天津 2012 Q28–79 丢失并生成 52 个占位题。
- **修复**（`scripts/convert-guokao.js`）：
  1. `parseOptionTable()`：识别 A→D 四组单元格的选项表格（≤6 行、排除纯数字表头），还原标准选项行并回挂「上一道选项未闭合的题」；
  2. 只消费本选项块：表格跨题（Q47 选项 + Q48 题号同表）时，剩余行 `depipeOptionRow()` 去竖线后还原继续扫描，绝不吞下一题；
  3. `decadeSpanAfterMark`：跳号且题号后接「NN 年代 / NN 年」时不判为题号，按题干续行处理。
- **回归**：`node scripts/regress-tianjin-2012-options.cjs` → 天津 2012 Q24–30 选项文本 / 答案 / `material` 为空 / 「天方夜谭」仅出现在 Q26，全部通过。
- **A/B（旧 HEAD parser vs 新 parser，三省 76 卷）**：`lost=0`、`lostOptions=0`；新增 46 题（天津 2012 Q28–53 / Q60–79）、新增完整选项 19（天津 15 / 深圳 8 / 广东 1）。
- **重转 + 发布**：`overnight-provinces.cjs --province=天津,深圳,广东 --reconvert-online`，随后逐省 `publish-merge-provinces.cjs --province <省> --apply --allow-id-overwrite`。新增开关 `--allow-id-overwrite`：重转已发布省份时新旧 ID 本应一致，仅放行「新旧 ID 交集」这一项阻塞，越界 / 守恒 / index / idMap 检查仍生效。
- **结果（全库 `verify-question-loading`）**：

  | 指标 | 修复前 | 修复后 |
  | --- | ---: | ---: |
  | 题目总数 | 66,087 | 66,087 |
  | 可渲染 | 63,683 | 63,751 |
  | 被校验跳过 | 2,404 | 2,336 |
  | 占位题 | 1,807 | 1,761 |
  | 真实缺陷 | 597 | 575 |
  | 跳过率 | 3.638% | 3.535% |
  | 真实缺陷率 | 0.903% | 0.870% |

  分省跳过：天津 421→367、深圳 327→320、广东 789→787（占位零回退）。
- **3% 门槛未达成**：剩余 1,761 道占位题对应跳过率下限 **2.665%**（1,761 / 66,087），parser 无法把全库压到 3% 以内；需源册补录 / OCR，或继续修剩余 575 道真实缺陷（广东 2024 常识判断题 5 道仍在）。

### 4.10 十四省 publish 收官（重庆 / 广西 / 广州 / 贵州 / 河南 / 吉林 / 江苏 / 辽宁 / 内蒙古 / 青海 / 山东 / 四川 / 西藏 / 新疆，2026-10-22）

- **批次构成**：12 个「已重转待发布」省 + 3 个首次上线省（广州 1,300 题、西藏 859、内蒙古 2,175）；河南 / 江苏 / 吉林 / 重庆 / 四川 等为 §4.9 parser 修复后重转产物。
- **执行**：`node scripts/publish-merge-provinces.cjs --province <省> --apply --drop-uncovered` 逐省串行，**14/14 `exit=0`**（日志 `_apply14.log`）。
- **规模**：**440 分片 / 67,236 题 → 565 分片 / 95,486 题**（+125 分片 / +28,250 题；新增 37,759 − 覆盖旧题 9,509）。
- **dry-run 三条守恒**（文件数 / 题数 / 定值）14 省全部通过，`dupInSource=0`，`badKeptIds=0`，阻塞项 0；唯一告警是广西跳过率 6.06% > 6%（构成见下表，132/140 为占位题）。
- **全库加载校验** `node scripts/verify-question-loading.cjs`：`EXIT=0`，**95,486 题 / 可渲染 92,277 / 跳过 3,209（3.361%）**，其中占位题 2,888 + 真实缺陷 321（**0.336%**）。较维修前 66,087 题 / 跳过 3.535%，分母放大后跳过率下降。
- **构建** `npm run build`（`vite build`）：1,728 modules / 4.36s，主包 569.97 kB（gzip 169.80 kB）。

| 省 | 新题 | 跳过 | skip% | 占位 | 真实缺陷 | 缺陷% |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 重庆 | 3,324 | 161 | 4.84% | 154 | 7 | 0.21% |
| 广西 | 2,311 | 140 | 6.06% | 132 | 8 | 0.35% |
| 广州 | 1,300 | 16 | 1.23% | 6 | 10 | 0.77% |
| 贵州 | 2,194 | 122 | 5.56% | 113 | 9 | 0.41% |
| 河南 | 2,700 | 24 | 0.89% | 18 | 6 | 0.22% |
| 吉林 | 3,410 | 190 | 5.57% | 180 | 10 | 0.29% |
| 江苏 | 6,311 | 196 | 3.11% | 168 | 28 | 0.44% |
| 辽宁 | 2,444 | 32 | 1.31% | 25 | 7 | 0.29% |
| 内蒙古 | 2,175 | 50 | 2.30% | 40 | 10 | 0.46% |
| 青海 | 2,065 | 28 | 1.36% | 13 | 15 | 0.73% |
| 山东 | 2,414 | 142 | 5.88% | 136 | 6 | 0.25% |
| 四川 | 3,234 | 42 | 1.30% | 36 | 6 | 0.19% |
| 西藏 | 859 | 4 | 0.47% | 4 | 0 | 0.00% |
| 新疆 | 3,018 | 107 | 3.55% | 102 | 5 | 0.17% |
| **合计** | **37,759** | **1,254** | — | **1,127** | **127** | **0.34%** |

- **`material` 残留选项块复核**（37,759 新题逐题扫 A/B/C/D 块）：**369 题 / 0.98%** 命中，5 省 >1%——河南 2.67%、内蒙古 1.79%、广州 1.77%、江苏 1.47%、吉林 1.38%。根因分三类，**均非「粤深津式选项丢失」**：①占位题残留文案、②版块【例题】被当题干、③表格选项错序；逐题比对后仅 **8 题真破损 + 1 题粘连**，全部被 `renderStats` 过滤，**不进前端**。决策：本批只记不修（见 known-losses §6.3）。
- **`--drop-uncovered` 删除 9 个旧分片 / 147 题**（含 `青海-changshi-2` 105 题），账本见 `guokao-reports/省考-v2-known-losses.md` §6.1。

### 4.11 索引全量重建 + 线上部署核查（2026-10-23）

- **新增脚本** `scripts/rebuild-question-index.cjs`：按 `public/data/questions/` 实际分片全量重建 `index.json` / `idMap.json`，默认只检查（有差异 `exit=1`），`--apply` 才写入，`--provinces` 输出指定省份明细。口径与 `publish-merge-provinces.cjs` 的 `buildIndex` / `buildIdMap` 完全一致（紧凑 JSON、无结尾换行）。npm 别名：`npm run index:check` / `npm run index:rebuild`。
- **重建结果**：565 分片 / 95,486 题；index 174 键 / 565 条分片引用（覆盖完整）；idMap 95,486 条且全部指向真实分片；`index.json` 24,731 B、`idMap.json` 6,515,947 B，**与提交内容字节一致**，`public/data/questions/` 无改动。
- **新省明细**：内蒙古 14 分片 / 2,175 题、西藏 7 / 859、江苏 34 / 6,311、山东 14 / 2,414，idMap 命中率均 100%，index 均含 changshi/panduan/shuliang/yanyu/ziliao 5 键。
- **线上滞后（根因）**：`https://elaborate-faloodeh-f2ba0e.netlify.app` 仍是 `8ac4e6f` 的构建产物（index 167 键 / 440 条、idMap 65,464、内蒙古与西藏分片 404、江苏 `changshi-0` 仍为 150 题旧版）；`cc2ddbf` 未部署生效，需在 Netlify 侧重跑构建（证据与步骤见 `guokao-reports/index-idmap-audit-2026-10-23.md` §4–§5）。
- **终验**：线上 `index.json` 达到 174 键 / 565 条、`idMap.json` 95,486 条、`provincial-内蒙古-*` 与 `provincial-西藏-*` 返回 200，即闭环。

### 4.12 index / idMap 一致性复核（2026-10-23 晚）

- **复核动因**：质疑「`cc2ddbf` 里 `index.json` 已含新省分片、但 `idMap.json` 仍是旧版」。
- **结论：该前提不成立。** `cc2ddbf` 的 index 与 idMap 由同一次 publish 一起重建，且与 HEAD 的 blob 哈希完全相同：
  `index.json` = `ceb560414e33ecf1aeb381017f7e15595d73c142`、`idMap.json` = `d9e86a9528fe15fa91ab1d910c95ff83c00e89c2`（`cc2ddbf` 与 `a335168` 一致；`cc2ddbf → a335168` 期间 `public/data/questions/` 改动文件数 = 0）。
- **版本对账**：`5f5baec` = 167 键 / 440 分片引用 / idMap 65,464（旧，且自身自洽）；`cc2ddbf` = 174 / 565 / 95,486（新，且自身自洽）。
- **双向核对（565 分片全量解析，非抽样）**：
  - 正查：index 引用的 95,486 道题（去重后 95,486，重复 ID 0）**全部**命中 idMap，缺失 **0**；分片缺失 0。
  - 反查：idMap 95,486 条**全部**指向真实分片文件（指向不存在分片 0 条），且目标分片确实包含该 ID（错配 0 条），value 结构异常 0；idMap 中未被 index 引用的孤儿条目 0。
- **四省抽查**：江苏 34 分片 / 6,311 题、山东 14 / 2,414、内蒙古 14 / 2,175、西藏 7 / 859，idMap 命中率均 **100%**，index 均含 changshi / panduan / shuliang / yanyu / ziliao 5 键（样例 ID：`prov-jiangsu-2010-B类-1`、`prov-shandong-2006-未标注-66`、`prov-neimenggu-2008-未标注-1`、`prov-xizang-2009-未标注-1`）。
- **重建复跑**：`node scripts/rebuild-question-index.cjs` → `exit=0`，`index.json` 24,731 B、`idMap.json` 6,515,947 B **字节一致，未写入**；因此本轮**没有**可提交的 idMap 变更（不制造空提交）。
- **内蒙古 / 西藏「空转」结论：不是空转。** `_apply14.log` 有产出记录 —— 内蒙古「源分片 14 / 2175 题；新增 14、覆盖同名 0、删除旧分片 0」，累计 `85,262 → 87,437`（+2,175）；西藏「变更 7 个文件」，累计 `92,892 → 93,751`（+859）；两者随后都打印「一致性：index OK，idMap OK」。本地源目录同样存在且题数一致：`public/data/questions-v2-provincial/内蒙古` 14 分片 / 2,175 题、`西藏` 7 / 859。日志里内蒙古段落出现串行（`源分片` 行被 shell 交错断行）只影响**可读性**，不影响写入结果。
- **唯一未闭环环节**：线上站点 index 仍为 167 键 / 440 条、内蒙古/西藏分片 `404` —— 属部署产物滞后，与本轮数据核查无关（证据见 `guokao-reports/index-idmap-audit-2026-10-23.md` §4 / §6）。

## 5. 面试大厅 v1.0（2026-10-26）

### 5.1 结构化面试题库编写完成（100 题）

- **数据文件**：`public/data/interview/questions.json`（`version: 1`、`updatedAt: 2026-10-26`、`categories` 6 类）。
- **题型分布**：综合分析 25 / 组织管理 20 / 应急应变 18 / 人际沟通 17 / 自我认知 10 / 言语表达 10 = **100**；id 前缀分别为 `si-zh / si-zz / si-yj / si-rj / si-zw / si-yy` + 三位序号，无重复。
- **难度分布**：基础 27 / 中等 45 / 拔高 28。
- **字段口径**：`keyPoints` 5–6 条（对象 `{text, critical}`，每题 2–4 条 `critical`，供报告点名“主线必补”）；`pitfalls` 2–3 条常见扣分点；`referenceOutline` 3–6 条数组；`scene` 39 题（39%，仅约三分之一题给场景）；`source` 统一 `结构化面试经典题·改编`（不编造真题出处）。
- **校验器**：`scripts/verify-interview-questions.cjs`（新增）校验 id 正则、6 类齐全、采分点/扣分点/提纲条数、title 15–160 字、task 8–120 字、时长区间、source 固定文案、id 唯一。本轮结果：`题量 100　唯一 id 100　含 scene 39（39%）`，**校验通过（exit 0）**。
- **代码进度**：题库已完成；语音钩子 / 评分服务 / 双端路由已于 §5.2 落地，5 个页面组件与 App 路由接入已于 §5.3 完成。

### 5.2 语音钩子 + 评分服务 + 双端路由落地（2026-10-26）

- **新增文件与职责**：
  - `shared/interview-review.ts`：前后端共享层。端点/DeepSeek URL/模型/26s 服务端超时常量；`sanitizeReviewRequest` 按字段白名单重建入参（采分点 ≤8 条、作答 ≤4000 字、时长 0–3600s）；`buildInterviewReviewPrompt`；`parseJsonLoose`；`normalizeInterviewReview`；`isInterviewReview`；`requestDeepSeekReview`（`response_format: json_object`、temperature 0.3、max_tokens 2200）；`buildDegradedReview`。
  - `src/lib/interviewScoring.ts`：本地规则兜底。采分点判定用中文二元组重合（≥20%，或命中“小标题锚点”且 ≥10%），证据取最贴近的作答原句；结构分只认显性连接词、结尾收束、开场表态；表达分由字数/时长/语速/口头禅密度计算，评语必带数字；总分 = 0.45 扣题 + 0.30 结构 + 0.25 表达，再按每漏 1 条 critical 扣 3 分（上限 9 分）；输出固定 `provider: 'local'`、`degraded: true`。
  - `src/hooks/useSpeechRecognition.ts`：Web Speech 封装。`isSupported` 先暴露给 UI 降级为手动输入；zh-CN、continuous、interim 实时上屏；静默 end 自动续录（单次作答最多 20 次）；`stop()` 保留 transcript 与累计时长，`start()` 续录；权限拒绝/无麦克风/断网/无语音/语言不支持全部转中文 `error` + `errorCode`；卸载自动 abort。
  - `src/services/interviewReviewService.ts`：前端评分服务。30s 超时（大于服务端 26s）、`isInterviewReview` 校验、有效字数 <30 不调 AI；任何失败（超时/非 2xx/结构异常）都返回本地规则报告并写入具体 reason。历史留存 key `xingan_interview_sessions_v1`，上限 50 条，坏记录跳过；含删除、清空、`summarizeInterviewHistory`（次数/最高分/均分/各题型次数/降级次数）。
  - `server.ts` 与 `netlify/functions/api.ts`：均新增 `POST /api/interview-review`，行为一致——参数非法 400；<30 字 / 无 `DEEPSEEK_API_KEY` / AI 异常均返回 200 + 本地规则版，`note` 分别为 `answer-too-short` / `missing-api-key` / `deepseek-failed`；DeepSeek 成功则走 `normalizeInterviewReview` 收敛。
  - `.env.example` 增列 `DEEPSEEK_API_KEY`（2026-10-27 已收敛为单行占位符，scope 说明移至 `Netlify环境变量配置指南.md`）；`package.json` 增加 `interview:verify`、`interview:smoke`、`interview:endpoint`、`interview:sample`、`interview:sample:strict`。
- **Prompt 硬对照（写死在 system + user）**：
  - `pointHits` 必须与本题采分点条数一致、index 为 1…N；`hit` 只能是 true/false；true 必须引用考生原话片段（≤30 字）。
  - `criticalMissed`、命中数、总分、等级全部由服务端重算，模型自报值不采信。
  - 扣题度锚定命中率（<40% ≤65 分；40–60% ≤78；≥80% 才可 85+）；表达维度必须引用字数/语速/口头禅数字。
  - 明令禁止“回答要有深度/站位要高/语言要流畅”这类无法验证的点评。
- **诚实性约束**：AI 不可用时报告页必须原样展示 `provider='local'`、`degraded=true` 与 `reason`，不得包装成“AI 点评”。
- **本轮验证（实跑）**：
  - `node scripts/verify-interview-questions.cjs` → 100 题校验通过（exit 0）。
  - `node --import tsx scripts/smoke-interview-review.ts` → **34/34 通过**：本地命中与证据、空泛作答明显低分、prompt 覆盖全部采分点且写死条数、normalize 补齐条目/重算 criticalMissed/扣分惩罚、JSON 围栏与前后语容错、入参白名单。
  - 启动 `server.ts` 后 `node scripts/smoke-interview-endpoint.mjs` → **10/10 通过**：无 Key 返回 200 + `local`/`degraded`，空作答与缺 question 返回 400。
  - `node node_modules/typescript/bin/tsc --noEmit` → **exit 0**（本机 `npx` 被执行策略禁用，故改用 node 直跑）。
- **本轮修复记录**：
  - `insert_line` 是“插在该行之前”，导致 `interviewScoring.ts` 函数被嵌套、TSC 报 TS1184；已按正确结构整文件重建。
  - `netlify/functions/api.ts` 共享层相对路径 `../shared` 修正为 `../../shared`。
  - `normalizeInterviewReview` 原逻辑在“模型给了 index 但缺条目”时会按数组位置错配（把第 3 条当成第 2 条）；已改为“只要有 index 就严格按 index 对齐，完全无 index 才按数组顺序”，并由冒烟测试锁定。
- **样例导出（内容验收）**：`guokao-reports/面试样例-20题.json` + `guokao-reports/面试样例-20题.txt`（同源，txt 带 BOM 便于 Windows 直接打开通读）。
  - 配额 综合 4 / 组织 4 / 应急 4 / 人际 3 / 自我 3 / 言语 2；每类按难度排序后等距抽取，脚本可重复运行结果一致。
  - 每题附 `audit`：冒号分层、做法 ≥10 字、主观评价词黑名单、行动型/判断型标注；本次 20 题 120 条采分点 **120 条可判定（100%）**。
  - 体检发现并修正 1 条：`si-yy-006` 第 6 条“收尾利落：用一句有力的话结束” → “用一句 20 字以内的表态句收束，点明‘服从组织安排、到岗就干’，不复述前文”。
- **未完成（下一步）**：用户侧配置本地 `.env` 与 Netlify Functions 的 `DEEPSEEK_API_KEY`；Chrome/Edge 真机回归语音权限、静音续录、移动端 UI；部署仍由用户执行。

### 5.3 五页组件 + App 路由接线完成（2026-10-26）

- **新增页面组件**（`src/components/interview/`）：`InterviewLobby`（入口 + 历史统计 + 分类覆盖 + 最近练习）、`InterviewPicker`（6 类 / 3 难度 / 关键词筛选 + 随机抽题）、`InterviewSession`（ready → thinking → answering → reviewing，双倒计时、语音实时转写、手动改字、结束/放弃二次确认）、`InterviewReport`（采分点逐条 ✓/✗ + 原文证据 + 三维分 + critical 漏点 + 降级/引擎标识 + 重练）、`InterviewHistory`（统计、筛选、回看、删除、清空、重练）。
- **新增外壳 `InterviewHall.tsx`**：唯一持有题库、练习记录与 hash 路由；题库统一走 `useInterviewQuestions`；记录持久化成功时重读 `localStorage`，失败时把本次记录放入 `pendingRecord` + 内存列表（不写本地存储），报告仍可正常渲染并明确提示“未保存”。
- **取消回到入口**：`sessionOriginRef` 记住是从大厅 / 抽题 / 报告 / 记录页进入，作答中退出会回到原页面，不会一律丢回大厅。
- **`App.tsx` 接入**：`InterviewArena` 的 lazy import 替换为 `InterviewHall`（旧文件保留可回滚），外包 `ErrorBoundary`；新增 `isInterviewHash` + `getInitialTab()`，刷新 / 分享 `#/interview/...` 深链可直接落在面试 Tab；离开面试 Tab 时 `replaceState` 清掉面试子路由，避免“URL 还在报告页、刷新却跳回面试”。
- **`Navbar.tsx` 文案**：面试卡片描述、6 张功能透视卡、面试区功能 chip 全部改为 100 题结构化面试口径（题库抽题 / 双倒计时 / 语音转写 / 采分点硬对照 / 历史复盘），不再出现 v0 演示壳描述。
- **路由边界**：`parseInterviewRoute` 对未知页面 / 缺题号 / 非面试 hash 一律回落大厅；`isInterviewHash` 收紧为 `#/interview` 或 `#/interview/...`，避免 `#/interviewx` 误判。
- **本轮验证（实跑）**：
  - `node .../typescript/bin/tsc --noEmit` → **exit 0**。
  - `node node_modules/vite/bin/vite.js build` → **成功**：1742 modules，`InterviewHall-*.js` 102.95 kB（gzip 26.49 kB），产物已写入 `dist/`。
  - `npm run interview:hall`（`scripts/smoke-interview-hall.tsx`）→ **19/19 通过**：5 条路由解析 + 非法 hash 回落 + 编码往返 + 前缀识别 + 大厅首屏（hero / 抽题 / 历史 / 题型覆盖）+ 报告缺记录兜底 + 记录页空态 SSR。
  - `npm run interview:endpoint:deepseek` → **11/11 通过**：`HTTP 200`、`provider=deepseek`、`degraded=false`、无降级 note、采分点 6/6；端点冒烟同时支持 `--expect=local` 保留无 Key 降级回归。
- **仍需真机确认**：Chrome / Edge 的麦克风权限、静音自动续录、切后台计时、移动端底部导航遮挡；这些无法在当前无浏览器环境中自动验证。

### 5.4 上线前收尾（2026-10-27）

- **真机验收通过**：Chrome / Edge 桌面 + Android 真机回归完成（语音权限、静音续录、切后台计时、移动端导航），DeepSeek 点评质量达标（采分点逐条命中 + 原话证据 + 三维分，无“要有深度/站位要高”这类空泛评语）。
- **`.env.example` 收敛**：只保留 `DEEPSEEK_API_KEY` 一行占位符，删除 `GEMINI_API_KEY` / `APP_URL` 等 AI Studio 历史残留。
- **代码提交**：面试大厅 v1 全量入库，commit 信息 `interview hall v1`（hash 子路由 / 5 页组件 + `InterviewHall` 外壳 / 语音钩子 / 评分服务 / 共享评分层 / 100 题题库 / 校验与冒烟脚本 / 端点接线）。
- **暂不 push**：按计划等 **2026-10-30（周五）** Netlify 额度重置后再推送并触发线上构建。
- **上线操作指南**：`Netlify环境变量配置指南.md`（Site configuration → Environment variables → `DEEPSEEK_API_KEY`，scope 勾 **Functions** → 保存后重新部署 → `--expect=deepseek` 冒烟验收）。

### 5.5 待办与 v1.1 排期

| 优先级 | 事项 | 说明 | 验收口径 |
| --- | --- | --- | --- |
| ✅ P0 | 5 个页面组件 + App 路由 | 已完成（§5.3）：大厅 / 抽题 / 计时录音 / 报告 / 历史 + `InterviewHall` 外壳 + Navbar 入口 | `tsc` exit 0、`vite build` 成功、路由与首屏冒烟 19/19；真机交互见下方 P1 |
| ✅ P0 | DeepSeek Key 配置 | 本地 `.env` 已配置有效 `DEEPSEEK_API_KEY`（不入 Git，`.env.example` 保持占位符）；线上仍需在 Netlify Environment variables 配置同名 key（scope: Functions） | 本地 `interview:endpoint:deepseek` 11/11 通过：`provider='deepseek'`、`degraded=false`、`note` 为空 |
| ✅ P0 | 上线前收尾 | `.env.example` 只保留 `DEEPSEEK_API_KEY` 占位符；`interview hall v1` 已提交、未 push；Netlify 配置指南已出（`Netlify环境变量配置指南.md`） | 2026-10-27 完成，2026-10-30（周五）push 并上线 |
| ✅ P1 | 真机语音回归 | Chrome / Edge 桌面 + Android；iOS Safari 不支持 Web Speech 时走手动输入 | **2026-10-27 用户真机验收通过**，点评质量达标（详见 §5.4） |
| P1 | 题库扩充 100 → 150 | 优先补应急应变、人际沟通；沿用现有字段与校验器 | `interview:verify` 通过、`interview:sample:strict` 无告警 |
| **v1.1** | **Kimi（Moonshot）引擎接入** | 评分引擎可切换：DeepSeek 主用、Kimi 备用/对比；复用同一 prompt 与 `normalizeInterviewReview`，不另写一套评分逻辑 | 同一作答双引擎总分差 ≤10 分视为稳定；采分点命中差异逐条可解释；报告页显示实际引擎名 |

**Kimi 接入拆解（v1.1 执行清单）**：
1. `src/types/index.ts`：`InterviewReviewProvider` 扩为 `'deepseek' | 'kimi' | 'local'`（同步报告页标签与历史记录校验）。
2. 共享层抽象：把 `requestDeepSeekReview` 抽成 `requestModelReview(engine, ...)`，新增 `MOONSHOT_API_URL = 'https://api.moonshot.cn/v1/chat/completions'`、`MOONSHOT_MODEL`、`MOONSHOT_API_KEY`；两家都要求 `response_format: json_object`。
3. 路由选择：`INTERVIEW_REVIEW_ENGINE=deepseek|kimi|auto`；`auto` 时 DeepSeek 失败（超时/非 2xx/JSON 不可解析）再试 Kimi，两次都失败才落本地规则。
4. `reason` 记账：降级报告必须写清“DeepSeek 失败原因 → Kimi 失败原因”，不允许只写“AI 不可用”。
5. 回归：`interview:smoke` 增加 engine 分支用例（mock 失败链），端点冒烟增加 `note='kimi-failed'` / `note='all-engines-failed'` 两种断言。
6. 成本控制：Kimi 仅作备用与抽检对比，默认不并发双跑；对比模式单独加开关，避免每次作答双倍 token。

## 6. 登录墙 + 每日额度 + 答题历史（2026-10-28）

### 6.1 产品规则

| 身份 | 每日额度 | 计数位置 | 说明 |
| --- | ---: | --- | --- |
| 游客 | 10 题 | `localStorage`（`guestStore`） | 同日同题不重复扣；登录后自动并入云端 |
| 登录用户 | 50 题 | Supabase `user_quota`（`Asia/Shanghai` 自然日） | 服务端原子扣减，客户端无写权限 |

- 同一天同一道题重复作答**不重复扣额度**（`answer_records` 唯一键兜底）。
- 额度耗尽只拦截「新题」，已答错题与历史记录仍可查看、复习。
- 服务端 AI 接口（`/api/ai-review`、`/api/interview-review`、`/api/tts`、`/api/generate-plan`）改为**必须登录**；前端保留本地降级（本地评分 / 浏览器朗读 / 本地计划模板），不静默失败。

### 6.2 数据库迁移（`supabase/migrations/`）

**表**

| 文件 | 表 | 关键约束 |
| --- | --- | --- |
| `create_review_items.sql` | `review_items` | `UNIQUE(user_id, question_id)` + 2 索引 |
| `create_answer_records.sql` | `answer_records` | `UNIQUE(user_id, question_id, answered_on)` + 2 索引 |
| `create_user_quota.sql` | `user_quota` | `PRIMARY KEY(user_id, quota_date)` + 1 索引 |

**函数**（均 `SECURITY DEFINER` + `SET search_path = public`，已 `REVOKE` 匿名执行）

| 函数 | 作用 |
| --- | --- |
| `get_daily_quota()` | 返回 `{authenticated, used, limit, remaining}` |
| `consume_question_quota(...)` | 单题扣减，返回 `{allowed, charged, ...}` |
| `consume_question_quota_batch(JSONB, TEXT)` | 交卷批量扣减，返回 `allowed_ids` / `blocked_ids` |
| `_consume_quota_one(...)` | 内部原子实现：先写 `answer_records`（唯一键冲突视为已扣），再校验额度，超额回滚刚写入的记录 |
| `merge_guest_data(TEXT[], JSONB, INTEGER)` | 游客错题 / 历史 / 已用额度并入账号，幂等 |
| `get_leaderboard(INTEGER)` | 聚合排行榜，只输出脱敏昵称与聚合指标 |

**幂等化改造（本轮重点）**

线上曾报 `42710 policy "review_select_own" for table "review_items" already exists`，四份迁移统一改为可重复执行：

- 表 / 索引：`CREATE ... IF NOT EXISTS`；
- 策略：一律 `DROP POLICY IF EXISTS` → `CREATE POLICY`；
- 函数：一律 `DROP FUNCTION IF EXISTS` → `CREATE OR REPLACE FUNCTION`（规避返回列变更时的 `42P13`）；
- 唯一键兜底：`DO` 块查 `pg_constraint`（`array_agg(attname::TEXT ORDER BY attname)` 比对列集合），缺失才补 unique index，异常只 `RAISE NOTICE` 不中断（规避 `ON CONFLICT` 的 `42P10`）；
- `merge_guest_data.sql` **自带 `review_items` 建表与 4 条策略**，即使 `create_review_items.sql` 从未执行也能单独跑通。

**执行顺序**：`create_review_items` → `create_answer_records` → `create_user_quota` → `merge_guest_data`（全程无 `DROP TABLE`，不丢数据）。

**自检 SQL**

```sql
select table_name from information_schema.tables
where table_schema = 'public'
  and table_name in ('answer_records','user_quota','review_items');   -- 期望 3 行

select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('get_daily_quota','consume_question_quota','consume_question_quota_batch',
                  'merge_guest_data','get_leaderboard','_consume_quota_one');  -- 期望 6 行

select public.get_daily_quota();   -- 期望 {"authenticated": false, ...}
```

### 6.3 前端

| 文件 | 变更 |
| --- | --- |
| `src/context/AuthContext.tsx` | 新增 `sendEmailOtp` / `verifyEmailOtp`（Supabase OTP）；登录后调用 `mergeGuestDataToAccount()`，成功则 `mergeVersion++` 触发额度与历史刷新 |
| `src/context/AuthUIContext.tsx` | 新增：全站唯一登录弹窗，`openAuth('guest_limit' \| 'need_login' \| 'default')` |
| `src/components/AuthModal.tsx` | 三模式（验证码 / 密码 / 注册）、发送 60s 冷却、按 `reason` 显示不同引导文案、错误与成功提示分离 |
| `src/main.tsx` / `src/App.tsx` / `src/components/Navbar.tsx` | 移除各自持有的 `AuthModal` 与嵌套 `AuthProvider`，入口统一 `AuthProvider > AuthUIProvider > App` |
| `src/hooks/useQuota.ts` | 登录态走 `supabase.rpc`；RPC 不可用时降级本地计数并标记 `degraded`（额度条显示「额度服务未初始化」） |
| `src/lib/guestStore.ts` | 游客额度 / 错题 / 历史（各上限 200）+ `mergeGuestDataToAccount`（并发保护，失败保留本地待重试） |
| `src/components/PracticeArena.tsx` | 接入额度条与耗尽弹窗；专项 / 试卷 / 错题复习三处答题前扣额度；新增「答题历史」tab |
| `src/components/AnswerHistory.tsx` | 新增：读 `answer_records`（RLS 仅本人），支持全部 / 错题 / 正确筛选与重练 |
| `src/components/QuotaBanner.tsx` / `src/components/QuotaLimitDialog.tsx` | 新增：额度进度条、耗尽拦截弹窗（升级会员占位） |
| `src/components/SiteFooter.tsx` | 新增：页脚 + 用户协议 / 免责声明占位弹窗（含额度规则说明） |
| `src/lib/authFetch.ts` | 新增：统一带 `Authorization: Bearer <access_token>` |
| `src/services/aiService.ts` / `audioService.ts` / `interviewReviewService.ts` | 改用 `authFetch`，未登录命中 401 后走本地兜底 |

### 6.4 服务端

- **新增 `shared/api-auth.ts`**（`server.ts` 与 `netlify/functions/api.ts` 共用）：
  - `authenticateRequest(req)`：解析 Bearer token → 以 anon key + 请求者 JWT 建 client → `auth.getUser(token)` 校验，返回 `{user, client}`；
  - `buildStatsOverview(auth)`：近 7 日趋势、连续答题天数、活跃天数、正确率、今日额度（单次最多 2000 行）；
  - `buildLeaderboard(auth, limit)`：调用 `get_leaderboard` RPC，`limit` 收敛到 1–100。
- **鉴权中间件 `requireAuth`**：`/api/generate-plan`、`/api/ai-review`、`/api/interview-review`、`/api/tts` 未登录一律 `401 {error:'unauthorized'}`。
- **新增接口**：`GET /api/stats/overview`、`GET /api/leaderboard`（均需登录）。
- **兜底**：`/api/*` 未匹配路径返回 JSON 404，避免落到 SPA 的 `index.html`。

### 6.5 验证

- `tsc --noEmit` 通过（本轮提交前复跑）。
- 四份迁移在 Supabase SQL Editor 可重复执行，不再出现 `42710` / `42P10` / `42P13`。
- 数据库自检：3 张表 / 6 个函数 / `get_daily_quota()` 返回 JSON。
- 前端链路：游客答满 10 题弹拦截 → 登录后额度变 50 且游客记录并入；未登录调用 AI 接口返回 401 并走本地兜底。
- **运维前置**：Supabase Auth 邮件模板必须包含 `{{ .Token }}`（6 位验证码），否则 `verifyOtp` 无码可填。

### 6.6 待办

| 优先级 | 事项 | 说明 |
| --- | --- | --- |
| P0 | 线上 SQL 重跑 + 硬刷验证 | 四份迁移按序执行，确认不再提示「额度服务未初始化」 |
| P1 | `AnalyticsOverview` 对接 `/api/stats/overview`、`/api/leaderboard` | 后端已就绪，前端仍用本地统计 |
| P1 | 服务端按题下发（防爬 v2） | 当前静态分片可整包下载，`localStorage` 额度只能挡普通用户 |
| P2 | 会员 / 付费入口替换占位 | `QuotaLimitDialog` 的「升级会员」目前仅为占位文案 |

## 7. 阿里云迁移上线（2026-11-01）

> 目标：从 Netlify/Vercel 托管迁到阿里云 ECS（Alibaba Cloud Linux 4），自有域名 + HTTPS，后端常驻 Node 进程。

### 7.1 线上拓扑

| 项 | 值 |
| --- | --- |
| 服务器 | 阿里云 ECS `47.106.172.207`（Alibaba Cloud Linux 4，x86_64，SELinux Enforcing） |
| 域名 | `igoiget.com` / `www.igoiget.com`（A 记录 → 47.106.172.207） |
| 入口 | nginx 80/443，站点配置 `/etc/nginx/conf.d/igoiget.conf` |
| 静态产物 | `/var/www/bideti/current/dist`（`current` 为软链，发版原子切换） |
| 应用 | `server.ts` 由 pm2 常驻，仅监听 `127.0.0.1:3002`，nginx 反代 `/api/` |
| 运行用户 | `bideti`（`/home/bideti`，systemd 单元 `pm2-bideti.service`） |
| 环境变量 | `/etc/bideti/bideti.env`（`root:bideti 640`，pm2 启动时由 dotenv 读取） |
| 证书 | `/etc/letsencrypt/live/igoiget.com/fullchain.pem`（certbot `--nginx`） |
| 部署脚本 | `/root/bideti-deploy/`（00 预检 / 01 初始化 / 02 发布 / 03 回滚 / 04 证书） |

### 7.2 预检（00-preflight.sh）

- 架构判断由「仅 x86_64」放宽为 `x86_64` / `aarch64` / `arm64`，与 Node 官方二进制口径一致。
- 预检覆盖：OS 版本、磁盘、内存、端口占用、nginx / firewalld、`bideti.env` 是否存在，以及 `DEEPSEEK_API_KEY` 是否已填（只判断，不回显内容）。

### 7.3 Node 24 安装改造（本次最大坑）

**失败路径**（旧脚本）：

1. `curl https://npmmirror.com/mirrors/node/latest-v24.x/` 抓目录列表再 grep 文件名 —— 该目录页不是标准文件列表，取不到 `node-v24.x.y-linux-x64.tar.xz`；
2. 回退 NodeSource `setup_24.x` —— 只支持 RPM 系仓库，Alibaba Cloud Linux 4 上直接失败；
3. 实测：`latest-v24.x/` 在阿里云镜像 404，npmmirror 的软链也滞后（仍指 24.9.0），**不能作为版本来源**。

**现行实现**（`deploy/01-bootstrap.sh`）：

1. 依次读取各镜像 `index.json`，`sort -uV` 取最新 `v24.x.y`（本次解析到 **v24.22.2**）；
2. 按 `npmmirror → registry.npmmirror → 阿里云 → nodejs.org` 顺序尝试 `v<版本>/`；国内镜像解析成功后不再请求官方源；
3. 下载 `node-v<版本>-linux-<arch>.tar.xz` 与同源 `SHASUMS256.txt`，`sha256sum -c` 校验后解压到 `/usr/local/lib/nodejs/`；
4. 建 `current` 软链 + `/usr/local/bin/{node,npm,npx,corepack}`；tarball 安装的 pm2 全局 bin 落在 Node 目录内，额外软链 `/usr/local/bin/pm2`；
5. 架构映射 `x86_64→x64`、`aarch64/arm64→arm64`；可选覆盖 `NODE_VERSION` / `NODE_MIRROR` / `NODE_SKIP_VERIFY`。

**验证**：本地 `bash -n` 两个脚本通过；实际下载 30.55 MB、SHA256 通过、包内 `bin/node` 路径与脚本 `NODE_DIR` 一致。

**提交**：`3e4638b fix(deploy): install Node 24 from npmmirror binary tarball`（连同 `1370e5c chore(deploy): prepare aliyun production runtime` 一并推送）。

### 7.4 首次发布 EACCES 排障（已记录）

**现象**：`02-release.sh` 走到最后一步 pm2 启动失败，重复 5 次：

```
[PM2] Spawning PM2 daemon with pm2_home=/home/bideti/.pm2
spawn /usr/local/lib/nodejs/node-v24.22.2-linux-x64/bin/node EACCES
[ERROR] pm2 启动失败，没有可回滚版本
```

**原因**：tarball 解压目录对 `bideti` 用户不可执行 / 不可穿越（叠加 SELinux Enforcing 下新目录未按默认策略打标）。

**修复**：

```bash
chown -R root:root /usr/local/lib/nodejs
chmod 755 /usr/local/lib/nodejs
chmod -R a+rX /usr/local/lib/nodejs      # 只给目录和已有 x 位的文件补执行，不动 .so/.js
restorecon -R /usr/local/lib/nodejs      # 重新套用 usr_t 默认上下文
sudo -u bideti -H bash -lc 'node -v && pm2 -v'
```

**连带坑**：首次发布时 `02-release.sh` 先安装 nginx 站点配置并置 `INSTALLED_NGINX=1`，pm2 启动失败后 `fail()` 会删掉刚装的 `/etc/nginx/conf.d/igoiget.conf`（回滚分支的预期行为）。修复权限后要先补回配置再起 pm2：

```bash
[ -f /etc/nginx/conf.d/igoiget.conf ] || install -m 644 /var/www/bideti/current/deploy/nginx/igoiget.conf /etc/nginx/conf.d/igoiget.conf
nginx -t && systemctl reload nginx
sudo -u bideti -H bash -lc 'pm2 start /var/www/bideti/current/ecosystem.config.cjs && pm2 save'
```

### 7.5 发布链路（02-release.sh）

1. `pack.ps1` 打包（`dist server.ts shared src package.json package-lock.json tsconfig.json deploy`，不含 `node_modules` / `.env` / `.git`），同目录生成 `<包>.sha256`；
2. `upload.ps1` 把 tarball + 校验文件传到 `/tmp`（**不是** `/root/bideti-deploy/`，`02-release.sh` 参数必须用实际路径，否则报「发布包不存在」）；
3. 脚本校验包存在 / 无绝对路径与 `..` 穿越、磁盘可用 ≥5GB、有 `.sha256` 时执行 `sha256sum -c`，解包到 `/var/www/bideti/releases/<时间戳>`；
4. `npm ci --omit=dev`（registry 走 npmmirror）→ `chown bideti` → 原子切换 `current` 软链；
5. 首次发布安装 `/etc/nginx/conf.d/igoiget.conf`；每次发布 `nginx -t` + `systemctl reload nginx`；
6. `pm2 delete bideti` → `pm2 start ecosystem.config.cjs`（dotenv 重新读取 `bideti.env`，密钥改动无需单独 restart）→ `pm2 save`；
7. 健康检查：`/api/stats/overview` 期望 **401**、首页正文含「必得题库」；失败自动回滚到上一版本，成功保留最近 3 个 release。

### 7.6 访问诊断：IP 看到 nginx 欢迎页 ≠ 故障

- 站点模板 `server_name igoiget.com www.igoiget.com` 未加 `default_server`，**用 IP 访问必然落到 nginx 默认站**（`/usr/share/nginx/html`）。
- 验证要用 Host 头：`curl -s -H 'Host: igoiget.com' http://127.0.0.1/`；或本机 hosts 绑定域名预览。**不要**在证书签发前把 IP 写进 `server_name` —— certbot `--redirect` 后会 301 到 `https://IP`，证书不匹配。
- 站点 `root` 就是 `/var/www/bideti/current/dist`，发版只切软链，不改 nginx 配置。

### 7.7 DNS 切换与 HTTPS（04-certbot.sh）

1. DNS A 记录 `igoiget.com` / `www.igoiget.com` → `47.106.172.207` 生效；
2. `01-bootstrap.sh` 已放行 firewalld 80/443，站点配置此时只有 80；
3. `04-certbot.sh` 先核对 DNS 解析、`nginx -t`、本机 Host 头 200，再 `certbot --nginx -d igoiget.com -d www.igoiget.com --redirect`，自动追加 443 / 证书 / HTTP→HTTPS 跳转；
4. 续期：优先启用 `certbot-renew.timer`，否则写 `/etc/cron.d/certbot-renew`；末尾 `renew --dry-run` 演练；
5. certbot 只改 nginx 配置，`02-release.sh` 之后只 `reload` 不覆盖。

### 7.8 结果与后续

- 线上：`https://igoiget.com` 已启用（证书覆盖 `igoiget.com` + `www`），Node **v24.22.2**，pm2 守护 `bideti`，后端 `127.0.0.1:3002`。
- 待办：
  - Netlify 侧补 `DEEPSEEK_API_KEY`（scope Functions）并跑 `scripts/smoke-interview-endpoint.mjs --expect=deepseek`（迁移前遗留项）；
  - 到期前 30 天确认自动续期实际触发：`systemctl list-timers certbot-renew.timer`；
  - `pm2 save` 后验证 `systemctl restart pm2-bideti` 能 `resurrect` 出 `bideti`；
  - 备份：`/etc/bideti/bideti.env` 不入库，`deploy/` 变更已纳入仓库；建议定期备份 releases 与证书目录。

## 8. 登录体验改造与 11 月排期（2026-11-01）

### 8.1 开工前现状

| 项 | 现状 | 影响 |
| --- | --- | --- |
| 登录方式 | 只有 Supabase Auth 邮箱验证码（`signInWithOtp` + `verifyOtp`） | 无 QQ / 微信 / 手机号，注册转化受限 |
| 邮件通道 | Supabase 默认 SMTP：**2 封/小时**，且只能发给项目团队成员 | 线上真实用户**收不到**验证码（`Email address not authorized`） |
| 邮件模板 | Supabase 默认英文模板 | 中文站点收到英文邮件；模板缺 `{{ .Token }}` 时用户拿不到 6 位码 |
| 报错文案 | 直接透传 Supabase 英文报错 | 移动端用户看不懂 `Email rate limit exceeded` |
| 小程序 | 无 | 缺少微信生态入口 |

### 8.2 本周（11/01–11/03）救急 + 申请准备

| 事项 | 归属 | 状态 | 验收 / 产出 |
| --- | --- | --- | --- |
| 163 授权码 → Supabase 自定义 SMTP | 用户（控制台） | **待配置**（授权码已到手） | 任意真实邮箱能收到验证码，不再出现 `Email address not authorized` |
| 5 套中文邮件模板 | 本仓库 | ✅ 已备好，待粘贴 | `docs/登录体验/email-templates/`；Magic Link 必须含 `{{ .Token }}` |
| 登录报错中文化 | 本仓库 | ✅ 已完成 | `src/lib/authErrors.ts` 接入 `AuthContext` 四个登录方法；未命中保留原文 |
| QQ 互联个人开发者申请 | 用户（周末提交） | 待提交 | 指南 `docs/登录体验/02-QQ互联-个人开发者申请指南.md` |
| 阿里云短信申请 | 用户（周末评估） | **需改路线** | 指南 `03-...md`：个人主体需企业资质，先走「短信认证服务」当天可用 |
| 《用户协议》《隐私政策》独立页 | 开发 | 待办 | `/agreement`、`/privacy` 可访问（QQ 审核前置条件） |

### 8.3 11 月排期（按优先级，本轮已调整）

| 周次 | 优先级 | 事项 | 验收口径 |
| --- | --- | --- | --- |
| W1 11/01–11/07 | P0 | 邮箱验证码可用且全中文（SMTP + 模板 + OTP 有效期 600s） | 新邮箱 10 分钟内完成注册/登录，Supabase 日志无 4xx |
| W1 11/01–11/07 | P0 | 登录资质提交：QQ 互联 + 阿里云（按指南路线） | 两个平台均进入「审核中」，留提交截图 |
| W1–W2 | P1 | 协议页 + 隐私政策页上线 | 两个 URL 返回 200，主体与备案一致 |
| **W2 11/08–11/14** | **P0** | **微信小程序 v1（`wx.login` 登录 + 刷题页）** | 见 §8.4 |
| W3 11/15–11/21 | P0 | 小程序 v1 真机回归 + 提审 | 体验版审核通过，或驳回项清零 |
| W4 11/22–11/30 | P1 | 面试大厅多人房间 v1 | 见 §8.5 |
| 11 月内（依赖外部审核） | P2 | QQ 登录 / 手机号验证码接入 | 审核通过后各 1–2 天联调上线 |

> **排期变更**：微信小程序 v1 从「待定」提前到 11 月第二周，**优先级高于面试大厅多人房间**。
> 理由：小程序是新增获客渠道，且登录 + 刷题是现有能力（Supabase Auth、题库分片、额度 RPC）的低成本复用；
> 多人房间依赖实时通道与房间状态机，工作量更大，但不带来新渠道。

### 8.4 微信小程序 v1 拆解（`wx.login` 登录 + 刷题页）

**范围（本版只做这些）**

- 微信登录：`wx.login()` → 服务端 `jscode2session` → 绑定或创建账号；
- 刷题页：选模块 → 拉题 → 作答 → 对答案与解析；
- 我的：今日额度、错题数、退出登录。

**明确不做**：支付/会员、面试大厅、社区打卡、语音作答、离线缓存、分享裂变、多端数据合并。

**技术方案**

| 层 | 方案 | 说明 |
| --- | --- | --- |
| 小程序端 | 原生小程序，3 页 `pages/login`、`pages/practice`、`pages/mine` | 不引第三方 UI 库，复用现有视觉色（emerald） |
| 登录 | `wx.login()` 取 `code` → `POST /api/wx/login` → 服务端 `jscode2session` 换 `openid`/`unionid` → 建/查用户 → 下发一次性 exchange token → 换 Supabase 会话 | `session_key` **不下发**前端；`AppSecret` 只存 `/etc/bideti/bideti.env` |
| 题库 | 复用 `public/data/questions/index.json` + 分片，按模块拉取，`wx.setStorage` 缓存当前模块 | 不做全量下载（612MB），单模块控制 < 2MB |
| 额度 | 服务端复用 `consume_question_quota` RPC，小程序只调接口，不直连数据库 | 与 Web 端额度天然一致 |
| 域名 | 小程序后台「开发管理 → 服务器域名 → request 合法域名」加 `https://igoiget.com` | 必须是 https + 已备案域名 |

**任务清单（估时合计约 5.5 天）**

| # | 任务 | 估时 |
| --- | --- | --- |
| 1 | 小程序账号注册 + 类目选择 + 小程序备案 | 0.5 天（备案等待 3–7 工作日，可与开发并行） |
| 2 | 服务端 `/api/wx/login`（code2session + 建号 + token 交换）+ 冒烟脚本 | 1 天 |
| 3 | 登录页 + 全局登录态（含未登录拦截） | 0.5 天 |
| 4 | 刷题页（选题/作答/判定/解析/额度拦截） | 2 天 |
| 5 | 我的页（额度、错题数、退出） | 0.5 天 |
| 6 | 真机回归 + 提审材料（截图、隐私说明） | 1 天 |

**依赖与风险**

- **小程序备案**：2024 年起小程序需完成备案才能上架，个人主体同样适用，需预留 3–7 个工作日；
- **个人主体类目限制**：不能选需资质的「教育培训」，建议「教育 > 教育信息服务」或以工具类目申报；
  个人小程序也不支持虚拟支付，后续做会员要走 H5 或换企业主体；
- **会话体系**：`wx.login` 拿到的是微信凭证，不能直接当 Supabase 会话，必须服务端换发，否则复用不了现有 RLS；
- **审核材料**：需在提审时说明「题库工具，内容为历年真题与解析，不提供考试报名/培训服务」，降低被判教育资质的概率。

### 8.5 面试大厅多人房间 v1（顺延到 11 月下旬）

- **为什么后置**：依赖 WebSocket/轮询通道、房间状态机、并发评分与断线重连；工作量大且不带来新渠道；
- **范围（先定）**：创建/加入房间（6 位房间号）、房主开题、轮流作答、实时进度、结束后统一评分；
- **前置决策**：实时方案二选一（自建 ws + pm2 常驻进程 / Supabase Realtime），定了再拆任务；
- **风险**：国考出分后流量峰值可能与开发期重叠，上线前需压测房间并发与 TTS 配额。

### 8.6 本轮新增文件

| 文件 | 作用 |
| --- | --- |
| `docs/登录体验/README.md` | 三份指南索引 + 排期入口 |
| `docs/登录体验/01-163-SMTP-与-中文邮件模板.md` | SMTP 配置项、模板粘贴、验收、错误对照 |
| `docs/登录体验/02-QQ互联-个人开发者申请指南.md` | 注册→实名→创建网站应用→材料清单→审核注意 |
| `docs/登录体验/03-阿里云短信-个人主体申请指南.md` | 个人主体限制、两条路线、签名/模板要点、材料清单 |
| `docs/登录体验/email-templates/` | 5 套中文 HTML 模板 + 变量说明（`README.md`） |
| `src/lib/authErrors.ts` | Supabase 英文报错 → 中文提示，接入 `AuthContext` |

## 9. 题库 E10 与全库语义隔离（2026-11-01）

### 9.1 第二道坏题：北京 2008 应届 116

- 题干：`2002～2006 年，我国的贸易顺差额（出口额－进口额）最小的年份是：`
- `material`：只有 `（一）根据下列统计资料回答问题。`，没有任何数据；
- 选项：`2002 / 2003 / 2004 / 2006`，缺 `2005`；
- 处理：`node scripts/mark-abnormal.cjs --id prov-beijing-2008-应届-116 --apply`，v1 分片、v2p `questions.json`、v2p 分片三处均写 `isAbnormal: true`，前端渲染「本题数据整理中」占位。

### 9.2 新增 E10 规则

- 判定库：`scripts/lib/e10-rule.cjs`；前端镜像：`src/lib/questionE10.ts`。
- **E10-A 材料缺失**：资料语境（module=ziliao，或题干引用材料/图表，或计算词+年份区间）且 material 无有效数字、题干也未自带数据。
- **E10-B 选项缺口**：仅对纯年份选项，题干给出年份区间、选项覆盖首尾且只缺 1 个中间年份；带单位数字序列需题干明确要求排序。
- 防误伤：`1人/2人/3人/5人`、`30个/35个/40个/50个` 等普通选项不按序列处理；`保温材料中` 不当作材料引用；整句选项里的年份不参与年份序列判断。
- 双保险：
  - 入库校验 `scripts/validate-questions.cjs` 新增 E10；
  - 渲染兜底 `src/lib/questionValidation.ts` 新增 `isAbnormalQuestion`，`PracticeArena` 三处占位接入。

### 9.3 全库大扫除结果

- 入口：`node scripts/audit-all-library.cjs --apply`（dry-run 去掉 `--apply`）。
- 覆盖：v1 95,486 + v2 6,210 + v2p 89,273 = 190,969 题（v1/v2p 有同 ID 重叠）。
- 结果：答案异常卷 **0**；E07 **1,566**；解析高置信 **436**；解析弱 **2,012**（只报告）；E10 **3,512**（A 3,496 / B 20）；隔离 **5,508** 题（按数据集计，v2p 汇总+分片双写 7,968 处标记，涉及 573 个文件）。
- 线上 v1 省份命中 TOP3：**江苏 226、上海 210、浙江 181**（国考单列 291）。
- 报告：`guokao-reports/全库语义扫描-2026-11-01.md`；明细 CSV 同名目录下。
- 验证：`npm run lint`、`npm run test:e07`、`npm run test:e10`、`npm run build` 均通过；v1/v2/v2p `isAbnormal` 计数与报告一致，目标题三处均为 `true`。

### 9.4 第三道坏题：2000 国考 81–85 缺图与 E09（2026-11-02）

- 坏题：`gk-2000-未标注-82`，题干“甲城中学生与丁城中学生共同特点是”，选项为“不喜欢 X/Y/Z 节目”，材料只给了甲、丙两城示例，乙/丁/戊数据在三角形图里。
- E09 新增：
  - `E09-A` 选项出现 >=2 个字母占位（X/Y/Z 或“不喜欢 X 节目”），依赖图表、材料无完整数据、无图片；
  - `E09-B` 题干/选项多城市（甲城/乙城/…/五个城市）对比，材料引用图表，但无图片、无完整表格数据。
- 全库扫描命中 **5 题**（81–85，E09-A 3 / E09-B 5），已写 `isAbnormal` 10 处（v1+v2 各 5 题）。
- 回源：`source-data/国考真题（2000--2026)/4-行测/1-行测-真题/word/2000年国家公务员考试《行测》真题.docx` → `word/media/image12.jpeg`，复制为 `public/data/questions/images/gk-2000-triangle.jpg`；81–85 补 `imageUrl` 并解除隔离，复扫 E09 归零。
- 模块错标扫描：资料分析且“无增长/比重/平均/顺差/总额，有共同特点/规律/符合/推出”共 3 题；人工复核后 1 题改判断推理（`gk-2024-副省级-115`）、2 题改常识判断（上海 2019 A 卷 108/121），共 8 处；随后真移动到对应分片（6 处），避免按模块筛选时消失；复扫归零。
- 验证：`npm run lint`、`npm run test:e09`、`npm run test:e10`、`npm run test:e07`、`npm run index:check`、`node scripts/verify-question-loading.cjs`、`npm run build` 均通过。



## 10. 内容收敛：事业编（事考）入口下线（2026-11-02）

**背景**：目标考试下拉一直挂着「📚 全国事业单位招聘 (事考)」，但题库实际没有事业编数据（全库仅 1 道历史遗留测试题 `q-104`，即 `public_institution-none-ziliao-0.json`）。挂着空选项等于给用户空头承诺，本轮把**入口**全部下线，**数据钩子**原样保留。

**统一开关**：`src/data/mockData.ts` 新增 `PUBLIC_INSTITUTION_ENABLED = false`。数据与类型钩子全部保留（`ExamCategory` 仍含 `public_institution`、mock 事考试卷 / 秘籍、`AnalyticsOverview` 分类名映射），组件只按开关隐藏入口；事业编数据源接入后把此常量改成 `true` 即整体恢复，无需再改组件代码。

| 位置 | 处理 |
|---|---|
| `src/components/Navbar.tsx` 目标考试下拉（桌面 + 窄屏） | 只保留 全部考试 / 国考 / 省考；事考 option 用 `PUBLIC_INSTITUTION_ENABLED &&` 包住 |
| `src/components/Navbar.tsx` 页头品牌副标 | 「国考 · 省考 · 事业编 ｜ 笔试刷题…」→「国考 · 省考 ｜ 笔试刷题…」 |
| `src/components/Navbar.tsx` 全站模块透视 | 「国考/省考/事考历年全真试卷」→「国考/省考历年全真试卷」 |
| `src/components/PracticeArena.tsx` 真题试卷 | 新增 `VISIBLE_PAPERS` 过滤事考试卷，卡片计数 3 → 2 |
| `src/components/KnowledgeBase.tsx` 通关秘籍 | 新增 `VISIBLE_KNOWLEDGE_POINTS` 隐藏「事考必备」考点，计数 4 → 3；模块标签只渲染「确实有秘籍」的模块，去掉点进去空白的「公共基础/综应」「常识判断」等空选项 |
| `src/components/DailyPlanGenerator.tsx` 目标考试 | 只留国考 / 省考；顺带修默认值（原占位串「2026省考基层综合管理岗」不在选项内，下拉显示空白） |
| `src/components/InterviewArena.tsx` 题本说明 | 「精选国考、省考及事业编历年高频真题」→「精选国考、省考历年高频真题」 |
| `src/App.tsx` 分类恢复 | 只恢复 `all` / `national` / `provincial`；老用户 localStorage 残留的 `public_institution` 回落「全部考试」，避免停在没有入口的分类 |
| `index.html` | title / description / og:title / og:description 去掉「事业编」；`<html lang="en">` → `lang="zh-CN"` |
| `metadata.json` | 产品描述同步去掉「事业编」 |

**刻意未动（均为数据钩子，仅加注释）**：`src/types/index.ts` 的 `ExamCategory` 与 `InterviewRoom.examType`、`mockData` 里 `public_institution` 的历史题目 / 试卷 / 考点、`AnalyticsOverview` 的分类名映射、`public_institution-none-ziliao-0.json` 那 1 道题（仍可在「全部考试」里被加载，不影响任何入口承诺）。

**验证**：
- `npm run lint` 通过；`SKIP_PUBLIC_COPY=1 npm run build` 通过（dist/index.html 已确认新 title / description）。
- 本地 dev（3002）+ Chrome headless（CDP，`ui-category-lite.cjs`）真实交互 **21/21 断言通过**：目标下拉 3 项且无「事考 / 事业单位」；副标 / title / meta description 无「事业编」；「真题试卷 (2)」且试卷卡片无事业单位卷；「全部秘籍 (3)」、页面无「事考必备」、模块标签只剩「判断推理 / 资料分析 / 申论思维」；定制计划目标考试 2 项且默认值有效；残留 `public_institution` 刷新后回落「全部考试」。
- 前端发布仍由人工执行 `npm run release:frontend`（需 SSH 密码）。
## 11. 定制计划 v1 上线 + 备考社区下线（2026-11-02）

**本轮两件事**：① 把「定制计划」从演示壳换成可执行的 4 周计划（向导 → 生成 → 落库 → 今日任务/进度/待补）；② 把「备考社区」整体下线（保留代码与数据，开关控制），导航从 6 卡收敛为 5 卡。

### 11.1 产品形态（三步向导）

| 步骤 | 输入 | 说明 |
|---|---|---|
| 1 | 目标考试（国考 / 省考）、笔试日期或「未定」 | 笔试日不足 28 天时计划自动压缩到剩余天数（最少 7 天），不会排到考试之后 |
| 2 | 每天可学时长：30 分钟 / 1 小时 / 2 小时及以上 | 对应每天 2 / 3 / 4 条任务；按“最差的一天”选，避免第一天就崩 |
| 3 | 薄弱模块多选（五大行测 + 申论思维） | 选中模块轮转为主攻方向；其余模块在周测中覆盖 |

生成后进入计划看板：计划摘要 + 今日任务 + 今日/本周/总进度 + 「待补」折叠区 + 分周看板（4 周 × 7 天）+ 教练寄语。点任务可「去练」：行测跳题库并锁定模块，申论跳「每日两题」；复盘类任务直接打勾。

### 11.2 生成策略：DeepSeek 优先，模板兜底

- 新端点 `POST /api/study-plan/generate`（`server.ts` + `netlify/functions/api.ts` 双实现，沿用 `requireAuth`）。
- 共享层 `shared/study-plan.ts`（纯函数，前后端共用）：
  - `sanitizeStudyPlanRequest`：字段白名单重建；`dailyMinutes` 只允许 30/60/120；`weakModules` 去重且只收白名单；`examDate` 必须晚于起始日；`startDate` 缺省为上海今天。
  - `buildTemplateStudyPlan`：规则引擎。周主题固定为「摸底与手感 → 弱项攻坚 → 真题实战 → 查漏补缺」，每周第 7 天为「错题复盘 + 周测」；任务 id 固定 `d<N>t<N>`，题目量随时长档位变化，申论题量恒为 1 道。
  - `normalizeStudyPlan`：把模型返回的 weeks 合并到模板骨架；缺周/缺天/缺任务自动补模板，非法模块丢弃；**有效 AI 任务不足模板一半时抛错**，路由退回模板（`provider=template`），不伪装 AI。
  - `requestDeepSeekStudyPlan`：45s AbortController 超时（前端 55s 放弃，保证先收到兜底结果）。
- 游客不调接口，直接用同一套 `buildTemplateStudyPlan` 本地生成（零等待、可离线）；登录用户 AI 失败/超时/结构不合法也自动落模板。
- 旧 `/api/generate-plan`（Gemini）与 `DailyPlanGenerator` 原样保留，便于回滚。

### 11.3 数据模型（需手动执行一次迁移）

`supabase/migrations/create_study_plans.sql`（幂等，需在 Supabase SQL Editor 手动执行）：

- `study_plans`：`id / user_id / target_exam / exam_date / daily_minutes / weak_modules / start_date / plan(jsonb 完整 StudyPlan) / provider / status / created_at / updated_at`；`unique(user_id) where status='active'`，重新定制 = 旧行 `archived` + 插新行。
- `study_plan_task_logs`：`user_id / plan_id / task_key / task_date / completed_on`，`unique(user_id, plan_id, task_key)`，重复勾选幂等。
- 两张表均开 RLS，仅 `auth.uid() = user_id` 可读写。
- **表未创建也不会阻塞**：`studyPlanService` 捕获错误后降级 localStorage，页面提示“已保存在本机”；登录后若云端无数据，会自动接管游客本地计划（含勾选），不会出现“登录一下计划就没了”。

### 11.4 日期规则与「待补」

- `dayIndex = 今天(上海自然日) - start_date + 1`；当前周按日期自动推进，不依赖用户手动切周。
- 过期未完成任务进入「待补」折叠区（原定第 N 天 + 日期），**不复制进今天**，避免任务越滚越多。
- 计划走完（`dayIndex > totalDays`）显示完成提示 +「再续 4 周」；「重新定制」保留原输入回填。
- 补做记录写真实完成日 `completed_on`，但成长经验按 `date|key` 去重，不会重复加。


### 11.5 与既有成长线 / 打卡的联动

- 勾选任务 → `recordPlanTask(taskKey)`（写入本机活动账本 `type='plan'`，+50 经验）。
- 同一动作同时调 `recordCheckIn()`：首次勾选即当日打卡（`type='checkin'`，+30 经验）。
- `activityStats.saveActivityEvents` 已按 `date|type|key` 去重，重复勾选/取消再勾不会刷经验；`planTasks` 计数直接复用现有聚合，成长页无需改动。
- 游客账本登录后由 `adoptGuestActivity` 迁移；计划本身由 `migrateGuestPlan` 单独并入云端（保留原 plan id，勾选记录一并迁移）。

### 11.6 题库联动

- `PracticeArena` 新增 `launchFilter`（`{ module, nonce }`）：清空知识图谱筛选、锁定 `activeModule`、子模块归「全部」、进入 `drill` 模式。
- `nonce` 保证重复点同一模块也会触发（否则 effect 依赖对象不变）。
- 题库无「速算」等独立子分类，因此任务只做**模块级**跳转，不做子模块猜测；申论任务跳 `daily`。

### 11.7 备考社区下线（`COMMUNITY_ENABLED = false`）

统一开关放在 `src/data/mockData.ts`（紧邻 `PUBLIC_INSTITUTION_ENABLED`），注释写明**恢复条件：注册用户 ≥ 1000**。

| 位置 | 处理 |
|---|---|
| `Navbar.mainNavItems` | 社区卡片改为 `...(COMMUNITY_ENABLED ? [定义] : [])`，定义原样保留；桌面网格 `grid-cols-3 lg:grid-cols-6` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` |
| `Navbar.moduleDefinitions` | 社区导览卡同样按开关条件展开；标题「全站六大核心模块」→ 按开关显示「五/六」，tooltip 同步 |
| `Navbar` 打卡 CTA（桌面 + 窄屏） | 「每日打卡」→「今日计划」，图标改日历，点击跳 `plan`；保留连续天数展示，勾任务即打卡 |
| `App.mobileNavItems` | 社区 Tab 按开关条件展开，底部导航由 6 项变 5 项 |
| `App` 兜底 | 新增 effect：开关关闭且 `activeTab==='community'` 时强制回 `overview`（覆盖旧链接/历史状态） |
| `CommunityCheckIn` 组件 / 演示数据 | **未删除**，lazy import 亦保留；仅入口不可达 |

### 11.8 新增 / 修改文件

**新增**

- `shared/study-plan.ts`（模板引擎 + 入参校验 + AI 归一化 + DeepSeek 调用）
- `src/services/studyPlanService.ts`（云端优先 + localStorage 兜底 + 游客迁移 + 勾选记录）
- `src/components/StudyPlan.tsx`（三步向导 + 计划看板）
- `supabase/migrations/create_study_plans.sql`
- `scripts/smoke-study-plan.ts`（50 条断言）

**修改**

- `src/types/index.ts`：新增 `StudyPlan*` 类型（旧 `DailyStudyPlan` 保留）
- `server.ts` / `netlify/functions/api.ts`：新增 `/api/study-plan/generate`
- `src/App.tsx`：计划页切换、`practiceLaunch`、社区兜底、移动端 5 Tab、打卡 CTA 指向计划
- `src/components/PracticeArena.tsx`：`launchFilter` 模块级跳转
- `src/components/Navbar.tsx`：五卡布局、社区条件渲染、今日计划 CTA、五/六文案
- `src/data/mockData.ts`：`COMMUNITY_ENABLED`
- `package.json`：`plan:smoke`

### 11.9 验证记录

- `npm run lint`（tsc --noEmit）通过。
- `npm run plan:smoke` **50/50 通过**：入参边界、4 周 28 天、任务 id 唯一、30/60/120 档任务数、第七天复盘、笔试日压缩（10 天 / 最少 7 天 / ≥28 天）、AI 结果合并与非法模块丢弃、无有效任务抛错、跨月跨年日期、prompt 内容；服务层游客路径（本地生成/落盘/勾选读回/取消/游客接管）。
- `SKIP_PUBLIC_COPY=1 npm run build` 通过（2.44s，`StudyPlan` chunk 35.23 kB；`CommunityCheckIn` 仍单独打包，代码保留）。
- 本地 dev（3002）实测 `POST /api/study-plan/generate` 未登录返回 `401 {"error":"unauthorized"}`，确认路由已挂载且鉴权生效。
- 未执行：真实 DeepSeek 调用（需线上 Key）、浏览器 E2E（`ui-category-lite.cjs` 不在本仓库，需在 QA 环境补测：5 张导航卡 / 无「备考社区」/ 底部 5 Tab / 向导三步 / 勾选后进度与成长经验变化）。

### 11.10 上线前手工动作 & 回滚

1. **先**在 Supabase SQL Editor 执行 `supabase/migrations/create_study_plans.sql`（否则计划只落本机，页面会提示云端不可用）。
2. 确认服务器 `.env` 已有 `DEEPSEEK_API_KEY`（与面试复盘共用）；没有也能用模板计划。
3. 本次新增服务端接口 ⇒ 不能只发前端资产，需全量发布：`deploy/pack.ps1` → `deploy/upload.ps1` → 服务器 `bash /root/bideti-deploy/02-release.sh <pack>`。
4. 回滚前端：计划页改回 `DailyPlanGenerator`（旧组件与旧接口均未删除）；社区恢复：`COMMUNITY_ENABLED = true` 即整体回来。



## 12. 知识点体系通关 ① 资料分析知识卡（2026-11-08）

### 12.1 目标与范围

「知识点体系通关」的第一块拼图：把资料分析 62 张知识卡做成**可读 + 可听**的最小可用页。只做资料分析一个模块，验证「素材 md → JSON → 页面 → 语音」这条链路，暂不做题目联动与进度记录。

- 数据：62 张卡，9 个层级（〇认知层 / 一材料阅读 / 二速算 / 三 ABRX 四量关系 / 四比重 / 五混合 / 六比较 / 七平均数与倍数 / 八特殊考点）。
- 语音：浏览器原生 `SpeechSynthesis`，无第三方依赖、无网络请求、无音频文件。
- 开关：`KNOWLEDGE_MODULE_ENABLED`（`VITE_KNOWLEDGE_MODULE_ENABLED`），**默认 false**，入口与页面都不渲染。

### 12.2 数据与校验

| 文件 | 作用 |
|---|---|
| `scripts/lib/knowledge-cards-rules.cjs` | 共享规则：字段白名单 `CARD_FIELDS`、E01–E09 / W01–W03、禁用词表、id 正则 `zlfx-0[0-8]-\d{3}` |
| `scripts/import-knowledge-cards.cjs` | 素材 md 里抽 ```json 块 → 白名单取字段 → 校验 → 落盘 `public/data/knowledge/ziliaofenxi.json`；`--dry-run / --source / --out / --expect-count` |
| `scripts/validate-knowledge-cards.cjs` | 对已落盘 JSON 复检，`--file / --json`，有 ERROR 退出非 0 |
| `public/data/knowledge/ziliaofenxi.json` | 62 张卡纯数组，随 `public/` 静态发布，前端 `fetch('/data/knowledge/ziliaofenxi.json')` |

落盘纪律：

1. 只按白名单取字段，markdown 头部的修订记录 / 施工说明**不落盘**；出现未知字段直接 ERROR。
2. 禁用词全字段递归扫描，大小写不敏感（`小P` → `小p` 同样命中）。
3. `questions` 目前只允许 `["待配题"]`，`audio` 只允许空串；等题库回填真题后再放开。
4. 层级中文序号（〇一二三四五六七八）映射写在规则里，导入时校验 cards 的 `node_path` 首段合法。

### 12.3 前端

- `src/hooks/useKnowledgeSpeech.ts`：`playCard / playGroup / pause / resume / stop`。优先选 zh-CN 音色（等 `voiceschanged`）；`generation` 计数防止停止后继续念下一张；Chrome `cancel()` 后立刻 `speak()` 会吞首句，故起播延迟 60ms；`onerror` 忽略 `interrupted / canceled`；组件卸载时 `cancel()`。
- `src/components/KnowledgeCards.tsx`：层级导航（窄屏横向滑动 / 宽屏左侧粘性列表）→ 卡片列表（单列）。卡片展示 title / definition / content / hooks（标签）/ traps（警示列表）；`questions` 为「待配题」时**整块隐藏**，不留空占位。顶部「连续播放本组」按钮调 `playGroup`，若本组某张卡正在单卡朗读则从该张接着连播；切换层级会 `stop()`，避免「看着 A 组、耳朵听 B 组」。
- 状态：loading（Loader2）/ error（含「重新加载」，`reloadKey` 重发请求）/ 空组提示；`speech.supported` 为 false 时给出「换 Chrome / Edge / Safari」提示，文字阅读不受影响。
- 入口：`App.tsx` 知识点子视图新增「知识点体系通关」，`Navbar.tsx` 笔试专区二级导航新增「知识卡通关 · 资料分析 62 卡语音磨耳」，两处都受 `KNOWLEDGE_MODULE_ENABLED` 控制。

### 12.4 开关与上线

- 打开：`.env.local` 写 `VITE_KNOWLEDGE_MODULE_ENABLED=1` 后重启 `npm run dev`（构建期注入，改完必须重启/重构建）。
- 发布：JSON 在 `public/` 下，随前端资产一起走 `deploy/pack.ps1`；只更新卡片数据时用 `npm run release:data`。
- 回滚：把 flag 去掉或置 0 重新构建即可，代码与数据都保留。

### 12.5 验证记录

- `node scripts/validate-knowledge-cards.cjs`：**卡片 62 / 唯一 id 62 / 覆盖层级 9 / 禁用词 0 → 校验通过**（exit 0）。
- `tsc --noEmit`（`npm run lint`）通过。
- `vite build` 通过：`KnowledgeCards` chunk 15.86 kB（gzip 4.77 kB），`dist/data/knowledge/ziliaofenxi.json` 已带 62 张卡。
- `node scripts/check-dark-contrast.cjs`：全部达标（深色正文 ≥12:1、说明文字 ≥5.7:1）。新页面配色只用既有色阶：dark 下 `slate-900` 卡片 + `slate-100/200/300/400` 文字、`emerald-900/40 + emerald-300`、`amber-900/25 + amber-100`、`rose-900/30 + rose-200`。
- 新增 `package.json` 脚本：`knowledge:import` / `knowledge:validate`。
- 浏览器实测（本机 Chrome headless + CDP）：`vite preview`（flag=on 构建产物）与 `npm run dev`（`VITE_KNOWLEDGE_MODULE_ENABLED=1`）两轮结果一致 —— 390×844 浅色 / 深色下 **62 张卡全部渲染**，`document.documentElement.scrollWidth = 390`，**无页面级横向溢出**；层级导航为横向滚动区（clientWidth 332 / scrollWidth 1359），符合窄屏预期；1280×900 深色下左侧层级列表 + 单列卡片正常；`data-theme="dark"` 后页面底色切到 slate-950（`oklch(0.129 0.042 264.695)`），浅色仍为 `rgb(243, 244, 246)`（一次性 CDP 脚本，未入库）。
- **未做**：TTS 实际出声（headless 无音频输出，需人工点一次「连续播放本组」确认音色与断句）；320px 极端窄屏未单独截图（390px 已覆盖主流机型）。

### 12.6 新增 / 修改文件

**新增**

- `scripts/lib/knowledge-cards-rules.cjs`、`scripts/import-knowledge-cards.cjs`、`scripts/validate-knowledge-cards.cjs`
- `public/data/knowledge/ziliaofenxi.json`（62 张卡）
- `src/hooks/useKnowledgeSpeech.ts`、`src/components/KnowledgeCards.tsx`

**修改**

- `src/types/index.ts`：新增 `KnowledgeCard`（module / node_path / definition / hooks / traps / questions / audio）；原知识图谱用的卡片类型改名 `KnowledgeGraphCard`，避免同名 interface 声明合并
- `src/lib/featureFlags.ts`：新增 `KNOWLEDGE_MODULE_ENABLED`
- `src/App.tsx`：`knowledgeView` 增加 `'cards'`、懒加载 `KnowledgeCards`、子视图切换按钮、Navbar 传参
- `src/components/Navbar.tsx`：可选 props `onOpenKnowledgeSprint / knowledgeSprintActive / onOpenKnowledgeHub`，笔试专区二级导航入口
- `src/components/KnowledgeGraph.tsx`：改用 `KnowledgeGraphCard`
- `package.json`：`knowledge:import` / `knowledge:validate`

