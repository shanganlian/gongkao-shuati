#!/usr/bin/env node
/**
 * 探针 A：查看 2021 行测真题 docx 的 HTML 结构
 * - 表格数量 / 每个表的行列数 / 表内图片数
 * - 文档内图片总数
 * - 「资料分析」标题附近的 HTML 片段（判断材料是否紧跟在表格里）
 *
 * 只读：不写任何文件。
 * 用法：node scripts/probe-a.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const Q_DIR = path.join(ROOT, 'source-data', '国考真题（2000--2026)', '4-行测', '1-行测-真题', 'word');

const IMG_OPTIONS = {
  convertImage: mammoth.images.imgElement(() => ({ src: 'x' })),
};

const count = (str, re) => (str.match(re) || []).length;

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
    let html = '';
    try {
      const result = await mammoth.convertToHtml({ path: abs }, IMG_OPTIONS);
      html = result.value;
    } catch (e) {
      console.log(`\n### ${f}\n[错误] convertToHtml 失败: ${e.message}`);
      continue;
    }

    const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
    console.log(`\n### ${f}`);
    console.log(`html=${html.length} tables=${tables.length} imgs=${count(html, /<img/g)} paragraphs=${count(html, /<p[ >]/g)}`);

    const hi = html.indexOf('资料分析');
    if (hi >= 0) {
      const snip = html.slice(Math.max(0, hi - 120), hi + 500).replace(/\s+/g, ' ');
      console.log(`SNIP: ${snip.slice(0, 600)}`);
    } else {
      console.log('SNIP: 未找到「资料分析」');
    }

    tables.slice(0, 10).forEach((t, k) => {
      const rows = count(t, /<tr/g);
      const cells = count(t, /<t[dh]/g);
      const imgs = count(t, /<img/g);
      const text = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
      console.log(`T${k} rows=${rows} cells=${cells} imgs=${imgs} | ${text}`);
    });
  }
}

main().catch(err => {
  console.error('[未捕获异常]', err);
  process.exit(1);
});
