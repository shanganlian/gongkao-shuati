import { MOCK_QUESTIONS } from '../src/data/mockData';

const counts: Record<string, number> = {};
MOCK_QUESTIONS.forEach((q: any) => {
  const p = q.province || 'none';
  const key = `${q.category}-${p}-${q.module}`;
  counts[key] = (counts[key] || 0) + 1;
});

const sizes = Object.values(counts).sort((a: number, b: number) => b - a);
console.log('Top 10 largest groups (question counts):', sizes.slice(0, 10));
console.log('Total groups:', Object.keys(counts).length);
