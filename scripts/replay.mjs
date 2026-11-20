// Replays a probe recording through the detector and prints its warnings and score.
// Usage: node scripts/replay.mjs probe-<time>.jsonl [sensitivity]
import { readFileSync } from 'node:fs';
import { Detector } from '../src/detector.js';

const [file, sens] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/replay.mjs <probe.jsonl> [sensitivity]'); process.exit(1); }

const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((r) => r.kind === 'chest' || r.kind === 'talking')
  .sort((a, b) => a.ts - b.ts);
const d = new Detector({ sensitivity: sens ? Number(sens) : undefined });
const t0 = rows[0]?.ts ?? 0;
let prev = d.state;
for (const r of rows) {
  if (r.kind === 'chest') d.chest(r.ts, r.v); else d.talk(r.ts, r.v);
  if (d.state !== prev) console.log(`${((r.ts - t0) / 1e6).toFixed(2).padStart(7)}s  ${d.state}`);
  prev = d.state;
}
console.log(d.summary());
