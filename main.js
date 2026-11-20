import { app, BrowserWindow, ipcMain, systemPreferences, shell, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SmartSpectraSDK, CameraSelection, MetricType, decodeMetrics } from '@smartspectra/node-sdk';
import { Detector } from './src/detector.js';
import { joinRoom, newRoomCode } from './src/room.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
let main, pill, sdk, detector, room, session = null;

// The key is baked into release builds by scripts/write-config.mjs (never committed).
function apiKey() {
  if (process.env.SMARTSPECTRA_API_KEY) return process.env.SMARTSPECTRA_API_KEY;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'app-config.json'), 'utf8')).apiKey; } catch { return null; }
}

const send = (ch, data) => { for (const w of [main, pill]) if (w && !w.isDestroyed()) w.webContents.send(ch, data); };

function createMain() {
  main = new BrowserWindow({
    width: 1040, height: 700, minWidth: 820, minHeight: 600,
    backgroundColor: '#e4e9e2',
    titleBarStyle: 'hiddenInset',
    title: 'Intake',
    webPreferences: { preload: path.join(dir, 'preload.cjs') },
  });
  main.loadFile(path.join(dir, 'ui', 'index.html'));
  main.on('closed', () => { main = null; app.quit(); });
}

function togglePill() {
  if (pill && !pill.isDestroyed()) { pill.close(); pill = null; return false; }
  const { workArea } = screen.getPrimaryDisplay();
  pill = new BrowserWindow({
    width: 300, height: 120, x: workArea.x + workArea.width - 320, y: workArea.y + 20,
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    hasShadow: false, focusable: false,
    webPreferences: { preload: path.join(dir, 'preload.cjs') },
  });
  pill.setAlwaysOnTop(true, 'floating');
  pill.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pill.loadFile(path.join(dir, 'ui', 'pill.html'));
  pill.webContents.on('did-finish-load', () => session && pill.webContents.send('session', session));
  pill.on('closed', () => { pill = null; send('pill', false); });
  return true;
}

async function cameraAllowed() {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.getMediaAccessStatus('camera') === 'granted') return true;
  return systemPreferences.askForMediaAccess('camera');
}

async function start({ name, code }) {
  const key = apiKey();
  if (!key) return { error: 'This build has no SmartSpectra API key.' };
  if (!(await cameraAllowed())) return { error: 'camera-denied' };

  detector = new Detector();
  session = { name: String(name || 'Me').slice(0, 24), code };
  const seen = { chest: 0, talking: 0 }; // the SDK resends overlapping windows; keep only new samples
  let traceBuf = [];

  room = joinRoom({
    code, name: session.name,
    onPeers: (peers) => send('peers', peers),
    onStatus: (s) => send('relay', s),
  });

  sdk = new SmartSpectraSDK({
    apiKey: key,
    enableTelemetry: false,
    requestedMetrics: [MetricType.CHEST_BREATHING, MetricType.ABDOMEN_BREATHING, MetricType.TALKING],
  });
  sdk.on('metrics', (buf) => {
    const m = decodeMetrics(buf);
    if (Buffer.isBuffer(m)) return;
    const before = detector.state;
    // merge both streams in time order so the detector sees events as they happened
    const events = [];
    for (const s of m.breathing?.upperTrace ?? []) {
      const t = Number(s.timestamp);
      if (t > seen.chest) { seen.chest = t; events.push({ t, chest: s.value }); }
    }
    for (const s of m.face?.talking ?? []) {
      const t = Number(s.timestamp);
      if (t > seen.talking) { seen.talking = t; events.push({ t, talking: !!s.detected }); }
    }
    events.sort((a, b) => a.t - b.t);
    for (const e of events) {
      if ('chest' in e) { detector.chest(e.t, e.chest); traceBuf.push([e.t, e.chest, detector.state]); }
      else detector.talk(e.t, e.talking);
    }
    if (detector.state !== before) {
      room?.setState(detector.state);
      send('self', detector.state);
    }
  });
  sdk.on('validationStatus', (code, _ts, hint) => send('hint', code ? hint : ''));
  sdk.on('processingStatus', (s) => send('processing', s));
  sdk.on('error', (code, message) => send('sdk-error', { code, message }));

  // batch trace points to the UI ~20x/s instead of per sample
  session.timer = setInterval(() => {
    if (traceBuf.length) { send('trace', traceBuf); traceBuf = []; }
    send('stats', { ...detector.summary(), polarity: detector.polarity });
  }, 50);

  try {
    sdk.useCamera(CameraSelection.default);
    sdk.start();
  } catch (e) {
    await stop();
    return { error: e.message };
  }
  send('session', { name: session.name, code });
  return { ok: true };
}

async function stop() {
  if (session?.timer) clearInterval(session.timer);
  room?.leave(); room = null;
  const s = sdk; sdk = null;
  if (s) { try { await s.stopAsync(); } catch {} try { await s.destroy(); } catch {} }
  session = null;
  send('session', null);
}

ipcMain.handle('start', (_e, opts) => start(opts));
ipcMain.handle('stop', () => stop());
ipcMain.handle('new-code', () => newRoomCode());
ipcMain.handle('toggle-pill', () => togglePill());
ipcMain.handle('open-camera-settings', () =>
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'));

app.whenReady().then(createMain);
app.on('before-quit', () => { stop(); });
app.on('window-all-closed', () => app.quit());
