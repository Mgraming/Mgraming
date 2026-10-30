// Runs schema.sql + the RLS scenarios on PGlite (Postgres compiled to WebAssembly) — no server or Docker needed.
// Usage: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const here = new URL('.', import.meta.url);
const read = f => readFileSync(new URL(f, here), 'utf8');
const db = new PGlite();
const notices = [];

try {
  await db.exec(read('auth_stub.sql'));
  await db.exec(read('../schema.sql'));
  const results = await db.exec(read('rls.sql'), { onNotice: n => notices.push(n.message) });
  for (const n of notices.filter(m => m.startsWith('ok:'))) console.log('  ' + n);
  console.log(results.at(-1).rows[0].result);
} catch (e) {
  for (const n of notices.filter(m => m.startsWith('ok:'))) console.log('  ' + n);
  console.error('DB TEST FAILED:', e.message);
  process.exitCode = 1;
}
