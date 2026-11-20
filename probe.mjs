// Feasibility probe: how late does the chest-breathing trace arrive, and does an inhale lead speech?
// Run: SMARTSPECTRA_API_KEY=... node probe.mjs   (talk normally for ~2 min, Ctrl+C to stop)
// Writes probe-<time>.jsonl: every new chest/abdomen/talking sample with its capture ts and arrival ts (both µs epoch).
import { SmartSpectraSDK, CameraSelection, MetricType, decodeMetrics } from '@smartspectra/node-sdk';
import { createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';

const apiKey = process.env.SMARTSPECTRA_API_KEY;
if (!apiKey) { console.error('Set SMARTSPECTRA_API_KEY'); process.exit(1); }

const out = createWriteStream(`probe-${Date.now()}.jsonl`);
const seen = { chest: 0, abdomen: 0, talking: 0 }; // last capture ts written per stream, so repeated windows aren't double-logged
const lags = { chest: [], talking: [] };

const sdk = new SmartSpectraSDK({
  apiKey,
  enableTelemetry: false,
  requestedMetrics: [MetricType.CHEST_BREATHING, MetricType.ABDOMEN_BREATHING, MetricType.TALKING],
});

function log(kind, samples, field) {
  const now = Date.now() * 1000;
  for (const s of samples ?? []) {
    const ts = Number(s.timestamp);
    if (ts <= seen[kind]) continue;
    seen[kind] = ts;
    out.write(JSON.stringify({ kind, ts, at: now, v: s[field] ?? null, stable: s.stable ?? null }) + '\n');
    if (lags[kind]) lags[kind].push((now - ts) / 1000);
  }
}

sdk.on('metrics', (buf) => {
  const m = decodeMetrics(buf);
  if (Buffer.isBuffer(m)) return;
  log('chest', m.breathing?.upperTrace, 'value');
  log('abdomen', m.breathing?.lowerTrace, 'value');
  log('talking', m.face?.talking, 'detected');
});
sdk.on('validationStatus', (code, _ts, hint) => code && console.log('validation:', hint));
sdk.on('processingStatus', (s) => console.log('status:', s));
sdk.on('error', (code, msg) => console.error('error', code, msg));

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1].toFixed(0) : '-');
if (!process.env.QUESTIONS) setInterval(() => {
  console.log(`delay ms, median of newest samples: chest ${med(lags.chest.slice(-200))}, talking ${med(lags.talking.slice(-200))}  (n=${lags.chest.length}/${lags.talking.length})`);
}, 2000);

sdk.useCamera(CameraSelection.default);
sdk.start();
console.log('Recording. Sit in good light, face the camera, chat normally (read something aloud with pauses). Ctrl+C to stop.');

// QUESTIONS=1: ask a short question every 9-13 s and log when it was shown, so speech onsets have ground truth.
if (process.env.QUESTIONS) {
  const qs = ['What did you eat today?', 'Name a city you want to visit.', 'What is your favourite movie?', 'Describe your room.',
    'What did you do yesterday?', 'Which app do you use most?', 'What is the weather like?', 'Name three colours.',
    'What time did you wake up?', 'What is your favourite song?', 'Who is your best friend?', 'What will you do this weekend?',
    'Describe your laptop.', 'What is your favourite food?', 'Name a sport you like.', 'What are you working on?',
    'Count from one to five.', 'What did you study?', 'Describe your shoes.', 'Where were you born?'];
  let i = 0;
  const ask = () => {
    if (i >= qs.length) { console.log('\n>>> DONE, thank you. Press Ctrl+C.'); return; }
    const q = qs[i++];
    console.log(`\n>>> ${q}`);
    // spoken aloud so the person can keep looking at the camera; logged when the voice finishes
    spawn('say', [q]).on('exit', () => out.write(JSON.stringify({ kind: 'question', ts: Date.now() * 1000, at: Date.now() * 1000, v: q }) + '\n'));
    setTimeout(ask, 9000 + Math.random() * 4000);
  };
  setTimeout(ask, 8000); // let the SDK warm up first
}

process.on('SIGINT', async () => {
  await sdk.stopAsync(); await sdk.destroy(); out.end(); process.exit(0);
});
