import { MOCK_QUESTIONS } from '../src/data/mockData';
const idMap: Record<string, number> = {};
MOCK_QUESTIONS.forEach((q, i) => { idMap[q.id] = i % 2; });
console.log('idMap size:', (Buffer.byteLength(JSON.stringify(idMap)) / 1024).toFixed(2), 'KB');