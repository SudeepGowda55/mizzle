// Bakes the SmartSpectra API key from .env (or the environment) into app-config.json, which ships
// inside the app so people can download and run it with no setup. app-config.json is git-ignored.
import { readFileSync, writeFileSync } from 'node:fs';

let key = process.env.SMARTSPECTRA_API_KEY;
if (!key) {
  try { key = readFileSync('.env', 'utf8').match(/^SMARTSPECTRA_API_KEY=(.+)$/m)?.[1].trim(); } catch {}
}
if (!key) { console.error('No SMARTSPECTRA_API_KEY in the environment or .env'); process.exit(1); }
writeFileSync('app-config.json', JSON.stringify({ apiKey: key }) + '\n');
console.log('wrote app-config.json');
