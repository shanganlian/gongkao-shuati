// 临时：14 省发布提交的推送（普通 push → curloptResolve 多 IP 回退）
const cp = require('child_process');

const attempts = [
  ['plain', ['push', 'origin', 'main']],
  ...[
    '20.205.243.165',
    '20.205.243.168',
    '140.82.112.3',
    '140.82.114.3',
  ].map((ip) => [
    'curloptResolve:' + ip,
    [
      '-c',
      'http.version=HTTP/1.1',
      '-c',
      'http.curloptResolve=github.com:443:' + ip,
      '-c',
      'http.curloptResolve=api.github.com:443:' + ip,
      'push',
      'origin',
      'main',
    ],
  ]),
];

for (const [label, args] of attempts) {
  console.log('=== ' + label + ' ===');
  const r = cp.spawnSync('git', args, { encoding: 'utf8', timeout: 180000 });
  if (r.stdout) console.log(r.stdout.trim());
  if (r.stderr) console.log(r.stderr.trim());
  console.log('exit=' + r.status);
  if (r.status === 0) {
    const ls = cp.spawnSync('git', ['ls-remote', 'origin', 'main'], { encoding: 'utf8', timeout: 60000 });
    console.log('remote=' + (ls.stdout || '').trim());
    break;
  }
}
