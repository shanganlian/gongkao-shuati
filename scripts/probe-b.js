#!/usr/bin/env node
/**
 * 探针 B：查看 2021 行测真题 docx 的纯文本结构
 * - 「资料分析」标题后 30 行
 * - 116 题前 18 行
 * 用于判断材料正文是否存在于文本层、以及标记行「根据…回答 N～M 题」的实际写法。
 *
 * 只读：不写任何文件。
 * 用法：node scripts/probe-b.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const Q_DIR = path.join(ROOT, 'source-data', '国考真题（2000--2026)', '4-行测', '1-行测-真题', 'word');

const show = (lines, from, to) =>
  lines
    .slice(Math.max(0, from), Math.max(0, to))
    .map((line, i) => `${Math.max(0, from) + i}: ${line.slice(0, 80)}`)
    .join('\n');

async function main() {
  console.log(`目录: ${Q_DIR}`);
  if (!fs.existsSync(Q_DIR)) {
    console.error('[致命] 目录不存在');
    process.exit(1);
  }

  const files = fs.readdirSync(Q_DIR).filter(f => f.includes('2021') && /\.docx$/i.test(f) && !f.startsWith('~$'));
  if (!files.length) {
    console.error('[致命] 未找到 2021 的 docx');
    process.exit(1);
  }

  for (const f of files) {
    const abs = path.join(Q_DIR, f);
    let text = '';
    try {
      const result = await mammoth.extractRawText({ path: abs });
      text = result.value.replace(/\r/g, '');
    } catch (e) {
      console.log(`\n### ${f}\n[错误] extractRawText 失败: ${e.message}`);
      continue;
    }

    const lines = text.split('\n');
    const nonEmpty = lines.filter(l => l.trim());
    const header = lines.findIndex(l => /资料分析/.test(l));
    const q116 = lines.findIndex(l => /^\s*116\s*[、.．]/.test(l));

    console.log(`\n### ${f}`);
    console.log(`lines=${lines.length} nonEmpty=${nonEmpty.length} header=${header} q116=${q116}`);

    if (header < 0) {
      console.log(`[警告] 未找到「资料分析」标题，跳过。`);
      continue;
    }

    console.log('--after header--');
    console.log(show(lines, header, header + 30));

    const anchor = q116 < 0 ? header : q116;
    console.log('--before 116--');
    console.log(show(lines, anchor - 18, anchor + 3));
  }
}

main().catch(err => {
  console.error('[未捕获异常]', err);
  process.exit(1);
});
