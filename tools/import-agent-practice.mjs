/** Explicit use only: node tools/import-agent-practice.mjs --base http://127.0.0.1:PORT
 * Uses an already authorized scoped token, never prints it. No settings, accounts or global credentials are copied.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { agentPracticePack } from './content/agent-practice.mjs';
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const base = new URL(arg('--base'));
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid base URL');
const token = process.env.STUDENTBUDDY_SEEDS_TOKEN;
if (!token) throw new Error('STUDENTBUDDY_SEEDS_TOKEN is required');
async function call(path, body) {
  const r = await fetch(new URL('/api/open/v1/' + path, base), { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await r.json();
  if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(value)}`);
  return value;
}
const context = await call('context');
if (!context.permissions.includes('question-seeds:write')) throw new Error('Token lacks question-seeds permission');
// Read existing terms as required by the external-agent contract; server performs the authoritative deduplication.
let offset = 0;
do { const page = await call(`terms?limit=200&offset=${offset}`); offset = page.nextOffset; } while (offset !== null);
const pack = agentPracticePack(context.exam.signature);
if (context.exam.on && pack.seeds.some(s => !s.sourceUrls.some(u => context.exam.allowedHosts.some(h => new URL(u).hostname === h || new URL(u).hostname.endsWith('.' + h))))) {
  throw new Error('Current exam source whitelist excludes part of this pack; no content was imported.');
}
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);
// Expiry changes between runs: externalId must remain stable, so reuse a previously imported compatible seed.
const present = new Set();
offset = 0;
do {
  const page = await call(`question-seeds?limit=200&offset=${offset}`);
  for (const seed of page.seeds) present.add(seed.externalId);
  offset = page.nextOffset;
} while (offset !== null);
const seeds = pack.seeds.filter(s => !present.has(s.externalId));
const terms = await call('terms/import', { batchId: 'agent-practical-terms-v1-' + hash(pack.terms), review: true, terms: pack.terms });
const preparation = seeds.length ? await call('question-seeds/import', { batchId: 'agent-practical-seeds-v1-' + hash(seeds), seeds }) : { added: 0, skipped: pack.seeds.length };
const report = { at: new Date().toISOString(), terms, preparation, totalBlueprints: pack.seeds.length, scope: context.exam.signature };
if (process.argv.includes('--receipt')) writeFileSync(arg('--receipt'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
