const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

const ROOT = 'D:/行岸公考';
const ZH = path.join(ROOT, 'source-data/34省考真题合集/浙江公务员考试真题');

function norm(s) {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function ptext(p) {
  let out = '';
  const nodes = p.getElementsByTagName('*');
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.nodeName === 'w:t' || n.nodeName === 'm:t') out += n.textContent;
  }
  return norm(out);
}

async function loadDocx(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const body = doc.getElementsByTagName('w:body')[0];
  return { zip, doc, body, xml };
}

function directParas(body) {
  const out = [];
  for (let n = body.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 1 && n.nodeName === 'w:p') out.push(n);
  }
  return out;
}

function makeP(doc, template, text) {
  const p = template.cloneNode(true);
  for (const ch of Array.from(p.childNodes)) {
    if (ch.nodeName !== 'w:pPr') p.removeChild(ch);
  }
  let r = null;
  const runs = template.getElementsByTagName('w:r');
  if (runs.length) r = runs[0].cloneNode(true);
  if (!r) r = doc.createElement('w:r');
  for (const ch of Array.from(r.childNodes)) {
    if (ch.nodeName !== 'w:rPr') r.removeChild(ch);
  }
  const t = doc.createElement('w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

function setPText(doc, p, text) {
  const replacement = makeP(doc, p, text);
  p.parentNode.replaceChild(replacement, p);
  return replacement;
}

function splitOptions(text, punct) {
  const re = new RegExp(`(?:^|\\s)([A-D])\\s*[${punct}]\\s*`, 'g');
  const ms = [];
  let m;
  while ((m = re.exec(text))) ms.push({ key: m[1], start: m.index, end: re.lastIndex });
  const out = [];
  for (let i = 0; i < ms.length; i++) {
    out.push({
      key: ms[i].key,
      text: text.slice(ms[i].end, i + 1 < ms.length ? ms[i + 1].start : text.length).trim()
    });
  }
  return out;
}

async function saveDocx(file, doc, zip) {
  const xml = new XMLSerializer().serializeToString(doc);
  zip.file('word/document.xml', xml);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(file, buf);
}

function findOne(paras, predicate, label) {
  const p = paras.find(predicate);
  if (!p) throw new Error('not found: ' + label);
  return p;
}

async function fix2025(file) {
  const { doc, body, zip } = await loadDocx(file);
  let paras = directParas(body);

  const find = (needle) => findOne(paras, p => ptext(p).includes(needle), needle);
  const q50Stem = find('50. (单选题)老年人在选择养老方式时');
  const q50AC = find('A.跨城养老模式或将成为未来趋势 C.养老方式的选择要考虑多方因素');
  const q50B = find('B.中小城市成为跨城养老模式首选');
  const q50D = find('D.跨城养老模式的便利性越来越强');

  const q50opts = [
    ['A', '跨城养老模式或将成为未来趋势'],
    ['B', '中小城市成为跨城养老模式首选'],
    ['C', '养老方式的选择要考虑多方因素'],
    ['D', '跨城养老模式的便利性越来越强']
  ];
  let anchor = q50AC.nextSibling;
  for (const [k, v] of q50opts) body.insertBefore(makeP(doc, q50AC, `${k}.${v}`), anchor);
  body.removeChild(q50AC);
  body.removeChild(q50B);
  body.removeChild(q50D);

  const qspec = [
    ['51', '51 . (单选题)', ['103', '109'], ['116', '122']],
    ['52', '52 . (单选题)', ['9', '16'], ['68', '80']],
    ['53', '53 . (单选题)', ['44', '56'], ['60', '63']],
    ['54', '54. (单选题)', ['27', '35'], ['6', '12']]
  ];

  for (const [num, stemNeedle, ab, cd] of qspec) {
    paras = directParas(body);
    const stem = findOne(paras, p => ptext(p).includes(stemNeedle), stemNeedle);
    const nextNum = String(Number(num) + 1);
    const stop = paras.find(p => {
      const t = ptext(p);
      return t.startsWith(nextNum + ' .') || t.startsWith(nextNum + '.');
    });
    let abP = null, cdP = null;
    const startIdx = paras.indexOf(stem);
    const stopIdx = stop ? paras.indexOf(stop) : paras.length;
    for (let i = startIdx + 1; i < stopIdx; i++) {
      const n = paras[i];
      const t = ptext(n);
      if (!abP && new RegExp(`^A\\.${ab[0]}`).test(t)) abP = n;
    }
    const cdRe = new RegExp(`^C\\.${cd[0]}\\s+D\\.${cd[1]}$`);
    cdP = paras.find(p => cdRe.test(ptext(p)));
    if (!abP || !cdP) {
      throw new Error(`2025 Q${num} option paragraphs not found: ` +
        paras.slice(startIdx, stopIdx).map(p => JSON.stringify(ptext(p))).join(' | '));
    }
    const anchor2 = abP.nextSibling;
    for (const [k, v] of [['A', ab[0]], ['B', ab[1]], ['C', cd[0]], ['D', cd[1]]]) {
      body.insertBefore(makeP(doc, abP, `${k}.${v}`), anchor2);
    }
    body.removeChild(abP);
    body.removeChild(cdP);
  }

  await saveDocx(file, doc, zip);
}

async function fix2023(file, startNum) {
  const { doc, body, zip } = await loadDocx(file);
  const paras = directParas(body);
  const find = (needle) => findOne(paras, p => ptext(p).includes(needle), needle);

  const q28Opts = find('难辞其咎');
  const q29Bank = find('洞若观火 义不容辞 如数家珍 了如指掌');
  const merged = find('变革 复苏 蝶变 转机A、挖掘');
  const q30Bank2 = find('雪中送炭 披荆斩棘 保驾护航 添砖加瓦');

  const q28Text = ptext(q28Opts).replace(new RegExp(`\\s*${startNum}\\s*$`), '');
  setPText(doc, q28Opts, q28Text);

  const mergedText = ptext(merged);
  const aPos = mergedText.indexOf('A、');
  const q29Lead = mergedText.slice(0, aPos).trim();
  const q29OptText = mergedText.slice(aPos).replace(/\s*\d+\s*$/, '');
  const q29Opts = splitOptions(q29OptText, '、');
  if (q29Opts.length !== 4) throw new Error('2023 Q29 option split failed: ' + q29OptText);

  const parent = merged.parentNode;
  const anchor = merged.nextSibling;
  const num29 = makeP(doc, q29Bank, String(startNum));
  const num30 = makeP(doc, q29Bank, String(startNum + 1));
  const q30Bank = makeP(doc, q29Bank, `${q29Lead} ${ptext(q30Bank2)}`);
  const q30BankParent = q30Bank2.parentNode;
  const q30BankAnchor = q30Bank2;

  // Q29/Q9/Q59 number before its word bank
  q29Bank.parentNode.insertBefore(num29, q29Bank);
  // Replace the merged paragraph with clean A-D option paragraphs.
  for (const o of q29Opts) parent.insertBefore(makeP(doc, q29Bank, `${o.key}、${o.text}`), anchor);
  parent.removeChild(merged);
  // Q30/Q10/Q60 number + combined word bank before the second bank.
  q30BankParent.insertBefore(num30, q30BankAnchor);
  q30BankParent.insertBefore(q30Bank, q30BankAnchor);
  q30BankParent.removeChild(q30Bank2);

  await saveDocx(file, doc, zip);
}

async function fix2006(file, img1, img2) {
  const { doc, body, zip } = await loadDocx(file);
  let paras = directParas(body);
  const find = (needle) => findOne(paras, p => ptext(p).includes(needle), needle);

  const q12 = find('12．车轮卷起的黄土');
  const q11 = find('11．《著作权法》保护的作品');
  const q13 = find('13．美国联邦所得税是累进税');
  const q11Block = [];
  for (let n = q11; n && n !== q13; n = n.nextSibling) {
    if (n.nodeType === 1 && n.nodeName === 'w:p') q11Block.push(n);
  }
  if (q11Block.length < 3) throw new Error('2006 Q11 block not found: ' + q11Block.length);
  for (const p of q11Block) body.insertBefore(p, q12);

  const ser = new XMLSerializer();
  const imgP1 = findOne(paras, p => p.getElementsByTagName('a:blip').length && ser.serializeToString(p).includes('rId9'), '2006 image rId9');
  const imgP2 = findOne(paras, p => p.getElementsByTagName('a:blip').length && ser.serializeToString(p).includes('rId10'), '2006 image rId10');
  const pathP1 = makeP(doc, q12, `【题图】${img1}`);
  const pathP2 = makeP(doc, q12, `【题图】${img2}`);
  body.insertBefore(pathP1, imgP1);
  body.insertBefore(pathP2, imgP2);

  await saveDocx(file, doc, zip);
}

async function main() {
  const mode = process.argv[2] || 'apply';
  const root = mode === 'dry' ? process.argv[3] : ZH;
  const files = mode === 'dry'
    ? {
        2025: path.join(root, '2025.docx'),
        2023: path.join(root, '2023.docx'),
        2006: path.join(root, '2006.docx')
      }
    : {
        2025: [
          path.join(root, '3-行测/1-题本/word/2025年浙江省公务员录用考试《行测》题（A类）.docx'),
          path.join(root, '3-行测/1-题本/word/2025年浙江省公务员录用考试《行测》题（B类）.docx'),
          path.join(root, '3-行测/1-题本/word/2025年浙江省公务员录用考试《行测》题（C类）.docx')
        ],
        2023: [
          [path.join(root, '3-行测/1-题本/word/2023年浙江省公务员录用考试《行测》真题（A类）.docx'), 29],
          [path.join(root, '3-行测/1-题本/word/2023年浙江省公务员录用考试《行测》真题（B类）.docx'), 9],
          [path.join(root, '3-行测/1-题本/word/2023年浙江省公务员录用考试《行测》真题（C类）.docx'), 59]
        ],
        2006: path.join(root, '3-行测/1-题本/word/2006年浙江公务员考试《行测》真题.docx')
      };

  if (mode === 'dry') {
    await fix2025(files[2025]);
    await fix2023(files[2023][0][0], 29);
  } else {
    for (const f of files[2025]) await fix2025(f);
    for (const [f, tail] of files[2023]) await fix2023(f, tail);
  }
  await fix2006(files[2006],
    'source-data/省考真题/图片/2006-浙江行测-Q46-49.jpeg',
    'source-data/省考真题/图片/2006-浙江行测-Q50-53.jpeg');
  console.log('done', mode);
}

main().catch(e => { console.error(e.stack || e); process.exit(1); });
