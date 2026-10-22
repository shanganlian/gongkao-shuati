# 八省 publish dry-run 汇总（2026-10-22 重跑）

- 生成时间：2026-10-22T10:48:08.340Z
- 执行：`node scripts/publish-merge-provinces.cjs --province <省> --drop-uncovered`（**dry-run**，未加 `--apply`）
- 范围：海南 / 陕西 / 宁夏 / 云南 / 甘肃 / 河北 / 山西 / 北京
- 写入边界：**只写 `guokao-reports/publish-<slug>-plan.md`**；`public/data/questions/`、`index.json`、`idMap.json` 均未改动。

## 1. 结论

- 8 省 dry-run 全部完成，退出码均为 0。
- **可 apply（0 阻塞）**：陕西 / 宁夏 / 云南 / 甘肃 / 河北。
- **暂不可 apply（1 阻塞）**：海南 / 山西 / 北京，阻塞项均为“新分片内部重复 ID”。
- 每份计划都通过三项前置对账：越界 0、文件增减守恒、题目总数守恒；阻塞只来自 ID 重复。

## 2. 计划总表

| 省 | 源分片 | 源题数 | 合并前分片/题 | 合并后分片/题 | 新数据可渲染 | 全库可渲染 | 阻塞 |
|---|---:|---:|---|---|---|---:|---|
| 海南 | 13 | 2219 | 330 / 41,384 | 336 / 42,900 | 98.8% | 97.2% | 新分片内部重复 ID 120 |
| 陕西 | 14 | 2355 | 330 / 41,384 | 336 / 42,937 | 98.5% | 97.0% | 无 |
| 宁夏 | 12 | 1972 | 330 / 41,384 | 336 / 42,910 | 98.9% | 97.0% | 无 |
| 云南 | 13 | 2134 | 330 / 41,384 | 335 / 42,744 | 98.5% | 97.0% | 无 |
| 甘肃 | 11 | 1900 | 330 / 41,384 | 334 / 42,700 | 99.4% | 97.1% | 无 |
| 河北 | 14 | 2328 | 330 / 41,384 | 344 / 43,712 | 97.4% | 96.9% | 无 |
| 山西 | 14 | 2431 | 330 / 41,384 | 337 / 43,101 | 96.8% | 96.9% | 新分片内部重复 ID 130 |
| 北京 | 15 | 2597 | 330 / 41,384 | 337 / 43,222 | 99.5% | 97.0% | 新分片内部重复 ID 135 |

> 基线：重跑时线上目录为 330 个分片 / 41,384 题。逐省 apply 后后续省份会按新快照重算总数，因此**不要拿本表的总数跨省累加**；本省“旧题/新题/变更文件”不受影响。

## 3. 阻塞项详情

### 海南（新分片内部重复 ID 120）

- 源题数 2219，唯一 ID 2099，重复 ID **120** 个，多出 **120** 条。
- 重复形态：同一年份存在两份卷别相同的卷（常见为都解析成“未标注”），ID 规则 `prov-<slug>-<year>-<label>-<num>` 无法区分，两个题号相同的题拿到同一 ID。
- 样例：
  - `prov-hainan-2009-913联考-1` ×2；题干差异：“《清明上河图》反映了我国哪个朝代的都市生活：”
  - `prov-hainan-2009-913联考-2` ×2；题干差异：“有关地方戏与发源地之间的对应关系，错误的一项是：”
  - `prov-hainan-2009-913联考-3` ×2；题干差异：“对下列农业知识的掌握有误的一项是：”

### 山西（新分片内部重复 ID 130）

- 源题数 2431，唯一 ID 2301，重复 ID **130** 个，多出 **130** 条。
- 重复形态：同一年份存在两份卷别相同的卷（常见为都解析成“未标注”），ID 规则 `prov-<slug>-<year>-<label>-<num>` 无法区分，两个题号相同的题拿到同一 ID。
- 样例：
  - `prov-shanxi-2009-未标注-1` ×2；题干差异：“公共危机管理的第一原则是：” vs “，1， ， ， ( )”
  - `prov-shanxi-2009-未标注-2` ×2；题干差异：“某一经济主体的经济活动影响到其他的经济主体，而这种影响无法通过市场价格反映出来。” vs “2，12，36，80， ( )”
  - `prov-shanxi-2009-未标注-3` ×2；题干差异：“国际上用来判断一个国家的收入分配是否平等和公平的指标是：” vs “4，30，56，82， ( )”

### 北京（新分片内部重复 ID 135）

- 源题数 2597，唯一 ID 2462，重复 ID **135** 个，多出 **135** 条。
- 重复形态：同一年份存在两份卷别相同的卷（常见为都解析成“未标注”），ID 规则 `prov-<slug>-<year>-<label>-<num>` 无法区分，两个题号相同的题拿到同一 ID。
- 样例：
  - `prov-beijing-2009-未标注-1` ×2；题干差异：“1，4，14，42，（ ），210” vs “150，75，50 ，37.5 ，30，( )”
  - `prov-beijing-2009-未标注-2` ×2；题干差异：“1，3，6，12，27，( )” vs “2，4，10，18，28，（ ），56”
  - `prov-beijing-2009-未标注-3` ×2；题干差异：“4，20，54，112，（ ），324” vs “77，49，28，16，12，2，( )”

**处理建议**：不要用随机后缀或 `-2` 敷衍。应先确定卷别，再生成稳定 ID：
- 能从源文件名识别的：`2009-未标注` → `2009-上半年/下半年`、`2009-一卷/二卷/三卷`、`2009-省直/公检法/乡镇`；
- 确实无法识别的：在 ID 中加入稳定的卷序号（按源文件名排序），并在 `source` 保留完整卷名；
- 修完重跑 3 省 dry-run，`dupInSource` 归零后才可 apply。

## 4. apply 顺序与命令（未执行）

建议先 apply 5 个零阻塞省，再处理 3 个阻塞省；每省 apply 后重跑下一省 dry-run 确认基线：

```powershell
node scripts/publish-merge-provinces.cjs --province 陕西 --apply --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 宁夏 --apply --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 云南 --apply --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 甘肃 --apply --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 河北 --apply --drop-uncovered
# 阻塞省：修 ID 后先 dry-run，再 apply
node scripts/publish-merge-provinces.cjs --province 海南 --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 山西 --drop-uncovered
node scripts/publish-merge-provinces.cjs --province 北京 --drop-uncovered
```

> `--drop-uncovered` 会删除 v2 未覆盖的旧主观题分片：海南 4 题、陕西 1 题、宁夏 4 题、云南 4 题、甘肃 4 题。确认可接受再执行。
> apply 会覆盖 `public/data/questions/` 同名分片并全量重建 `index.json` / `idMap.json`；5 省之外的文件不删不改。

## 5. 产物

- `guokao-reports/publish-hainan-plan.md`（生成于 2026-10-22T10:42:13.257Z）
- `guokao-reports/publish-shaanxi-plan.md`（生成于 2026-10-22T10:42:16.610Z）
- `guokao-reports/publish-ningxia-plan.md`（生成于 2026-10-22T10:42:19.850Z）
- `guokao-reports/publish-yunnan-plan.md`（生成于 2026-10-22T10:42:22.967Z）
- `guokao-reports/publish-gansu-plan.md`（生成于 2026-10-22T10:42:26.153Z）
- `guokao-reports/publish-hebei-plan.md`（生成于 2026-10-22T10:42:29.366Z）
- `guokao-reports/publish-shanxi-plan.md`（生成于 2026-10-22T10:42:32.368Z）
- `guokao-reports/publish-beijing-plan.md`（生成于 2026-10-22T10:42:35.424Z）

每份计划包含：0 三项前置对账（越界/增减/总数）、1 变更清单、2 波及范围、3 idMap 重建、4 阻塞项与风险、5 前端可渲染性预检、6 ID 策略。