// Feasibility probe: how late does the chest-breathing trace arrive, and does an inhale lead speech?
// Run: SMARTSPECTRA_API_KEY=... node probe.mjs   (talk normally for ~2 min, Ctrl+C to stop)
// Writes probe-<time>.jsonl: every new chest/abdomen/talking sample with its capture ts and arrival ts (both µs epoch).
import { SmartSpectraSDK, CameraSelection, MetricType, decodeMetrics } from '@smartspectra/node-sdk';
import { createWriteStream } from 'node:fs';

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
setInterval(() => {
  console.log(`delay ms, median of newest samples: chest ${med(lags.chest.slice(-200))}, talking ${med(lags.talking.slice(-200))}  (n=${lags.chest.length}/${lags.talking.length})`);
}, 2000);

sdk.useCamera(CameraSelection.default);
sdk.start();
console.log('Recording. Sit in good light, face the camera, chat normally (read something aloud with pauses). Ctrl+C to stop.');

process.on('SIGINT', async () => {
  await sdk.stopAsync(); await sdk.destroy(); out.end(); process.exit(0);
});
