import { MOCK_QUESTIONS } from '../src/data/mockData';
const p = new Set(MOCK_QUESTIONS.map((q: any) => q.province).filter(Boolean));
console.log('All provinces:', Array.from(p).sort().join(', '));

const bad = MOCK_QUESTIONS.filter((q: any) => q.options && q.options.length === 1 && q.options[0].text.match(/[BＢ][\.．、]/));
console.log('\nBad options examples (first 2):');
console.log(JSON.stringify(bad.slice(0, 2), null, 2));
console.log('Total bad options:', bad.length);
