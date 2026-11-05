// 临时：核对远端 main 是否已收到本次提交（结果落 _pushcheck.txt）
const cp = require('child_process');
const fs = require('fs');

const out = [];
const run = (cmd, timeout) => {
  try {
    return cp
      .execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout })
      .trim();
  } catch (e) {
    return 'ERR: ' + (e.stderr ? e.stderr.toString().trim() : e.message) + ' | code=' + e.status;
  }
};

out.push('local HEAD  = ' + run('git rev-parse HEAD', 20000));
out.push('local msg   = ' + run('git log -1 --format=%s', 20000));
out.push('origin/main = ' + run('git ls-remote origin main', 60000));
out.push('cached      = ' + run('git rev-parse origin/main', 20000));
out.push('cached msg  = ' + run('git log origin/main -1 --format=%s', 20000));
fs.writeFileSync('_pushcheck.txt', out.join('\n') + '\n', 'utf8');
console.log(out.join('\n'));
