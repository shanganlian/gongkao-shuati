# 项目进度总结

> 更新时间：2026-10-19

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


