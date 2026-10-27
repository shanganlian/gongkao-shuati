/**
 * 面试大厅 v1.0 · /api/interview-review 端点冒烟
 * 前置：本地已启动 `npm run dev`（默认 http://localhost:3002）
 * 运行：npm run interview:endpoint
 *       npm run interview:endpoint:deepseek  # 断言真正走 AI
 *       npm run interview:endpoint:local     # 断言无 Key / 失败时降级
 *
 * 断言：空作答必须 400，而不是降级或 500；provider/degraded/note 必须自洽；
 *       deepseek 模式要求 provider=deepseek、degraded=false、无降级 note；
 *       local 模式要求 provider=local、degraded=true、note 说明原因。
 */
import fs from 'node:fs';

const BASE = process.env.INTERVIEW_API_BASE || 'http://127.0.0.1:3002';
const expectArg = process.argv.find((arg) => arg.startsWith('--expect='));
const EXPECT = (expectArg ? expectArg.split('=')[1] : 'auto').toLowerCase();
if (!['auto', 'deepseek', 'local'].includes(EXPECT)) {
  console.error(`未知 --expect=${EXPECT}，仅支持 auto | deepseek | local`);
  process.exit(1);
}
const bank = JSON.parse(fs.readFileSync('public/data/interview/questions.json', 'utf8'));
const question = bank.questions[0];

const answer =
  '我认为问题不在老人不学习，而在服务没有兜底。第一，保留人工窗口、现金和纸质表单，设帮办专窗，明确不得以线上为由拒办；第二，安排网格员上门代办，开通亲属亲情授权，界面做大字版和语音版；第三，把老年人办成率和投诉率纳入考核，建立回访纠错。';

async function post(payload) {
  const res = await fetch(`${BASE}/api/interview-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  return { status: res.status, data };
}

let failed = 0;
function check(name, ok, detail) {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` → ${detail}`}`);
}

const ok = await post({ question, answerText: answer, durationSeconds: 90, inputMode: 'voice' });
const review = ok.data?.review;
const provider = review?.provider;
const degraded = review?.degraded;
const note = ok.data?.note;
check('端点返回 200', ok.status === 200, `status=${ok.status}`);
check('返回 review 对象', !!review, JSON.stringify(ok.data).slice(0, 160));
check('provider 为 deepseek 或 local', provider === 'deepseek' || provider === 'local', provider);
check('采分点条数与题目一致', review?.pointHits?.length === question.keyPoints.length, `${review?.pointHits?.length}/${question.keyPoints.length}`);
check('总分在 0-100', review?.overallScore >= 0 && review?.overallScore <= 100, String(review?.overallScore));

if (EXPECT === 'deepseek') {
  check('按配置真正走 AI', provider === 'deepseek', provider);
  check('AI 评分未降级', degraded === false, String(degraded));
  check('AI 评分无降级 note', !note, String(note));
} else if (EXPECT === 'local') {
  check('按配置降级为本地规则', provider === 'local', provider);
  check('本地规则 degraded=true', degraded === true, String(degraded));
  check('降级时 note 说明原因', typeof note === 'string' && note.length > 0, String(note));
} else {
  check(
    'provider 与 degraded 自洽',
    provider === 'deepseek' ? degraded === false : degraded === true,
    `provider=${provider} degraded=${degraded}`
  );
  check('降级时 note 说明原因', provider === 'deepseek' || (typeof note === 'string' && note.length > 0), String(note));
}

const bad = await post({ question, answerText: '   ', durationSeconds: 10, inputMode: 'voice' });
check('空作答返回 400', bad.status === 400, `status=${bad.status}`);
check('空作答带中文错误信息', typeof bad.data?.error === 'string' && bad.data.error.length > 0, JSON.stringify(bad.data));

const noQuestion = await post({ answerText: answer });
check('缺 question 返回 400', noQuestion.status === 400, `status=${noQuestion.status}`);

console.log(`\n模式：${EXPECT}`);
console.log(failed === 0 ? '端点冒烟全部通过' : `${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
