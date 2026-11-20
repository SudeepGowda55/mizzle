const api = window.intake;
const $ = (id) => document.getElementById(id);
const LABEL = { quiet: 'quiet', about: 'about to speak', speaking: 'speaking' };

// kinetic headlines: split into words that "breathe in" one after another
for (const el of document.querySelectorAll('.kin')) {
  el.innerHTML = el.textContent.trim().split(/\s+/)
    .map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
}
const show = (screen) => {
  document.body.dataset.screen = screen;
  // replay the headline animation on the new screen
  for (const w of document.querySelectorAll(`#${screen} .kin .w`)) { w.style.animation = 'none'; void w.offsetWidth; w.style.animation = ''; }
};

// consent
$('agree').addEventListener('change', (e) => { $('toJoin').disabled = !e.target.checked; });
$('toJoin').addEventListener('click', () => { show('join'); $('name').focus(); });

// join
try { $('name').value = localStorage.getItem('name') ?? ''; } catch {}
const freshCode = async () => { $('myCode').textContent = await api.newCode(); };
freshCode();
$('newCode').addEventListener('click', freshCode);
$('startRoom').addEventListener('click', () => enter($('myCode').textContent));
$('joinRoom').addEventListener('click', () => enter($('joinCode').value.trim()));
$('joinCode').addEventListener('keydown', (e) => e.key === 'Enter' && enter($('joinCode').value.trim()));

let me = { name: '', state: 'quiet' }, peers = [];

async function enter(code) {
  const name = $('name').value.trim();
  $('joinErr').textContent = '';
  if (!name) { $('joinErr').textContent = 'Add your name so others know who is about to speak.'; $('name').focus(); return; }
  if (!/^[a-z0-9-]{3,40}$/i.test(code)) { $('joinErr').textContent = 'That room code looks wrong. It looks like maple-otter-42.'; return; }
  try { localStorage.setItem('name', name); } catch {}
  $('startRoom').disabled = $('joinRoom').disabled = true;
  const res = await api.start({ name, code: code.toLowerCase() });
  $('startRoom').disabled = $('joinRoom').disabled = false;
  if (res?.error === 'camera-denied') {
    $('joinErr').innerHTML = 'Intake needs your camera. Allow it in System Settings, then try again.<button class="ghost sm" id="openCam">Open settings</button>';
    $('openCam').addEventListener('click', () => api.openCameraSettings());
    return;
  }
  if (res?.error) { $('joinErr').textContent = res.error; return; }
  me = { name, state: 'quiet' };
  $('roomCode').textContent = code.toLowerCase();
  $('selfWord').textContent = 'starting camera';
  $('selfWord').dataset.state = 'idle';
  points = [];
  renderPeople();
  show('live');
}

$('leave').addEventListener('click', async () => { await api.stop(); show('join'); });
$('copy').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('roomCode').textContent);
  $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy'; }, 1200);
});
$('pillBtn').addEventListener('click', async () => {
  const on = await api.togglePill();
  $('pillBtn').textContent = on ? 'Hide floating pill' : 'Float over my call';
});
api.on('pill', (on) => { $('pillBtn').textContent = on ? 'Hide floating pill' : 'Float over my call'; });

// live state
api.on('self', (state) => {
  me.state = state;
  $('selfWord').textContent = LABEL[state];
  $('selfWord').dataset.state = state;
  renderPeople();
});
api.on('peers', (list) => { peers = list; renderPeople(); });
api.on('hint', (h) => { $('hint').textContent = h; });
api.on('relay', (s) => {
  $('relay').dataset.state = s.state;
  $('relay').textContent = s.state === 'connected' ? `relay ${s.relay}` : s.state === 'connecting' ? 'connecting relay…' : 'relay lost, retrying…';
});
api.on('sdk-error', (e) => { $('hint').textContent = e.message; });
api.on('stats', (s) => {
  $('sLead').textContent = s.medianLeadMs ?? '–';
  $('sRecall').textContent = s.recall == null ? '–' : `${Math.round(s.recall * 100)}%`;
  $('sRecallSub').textContent = s.turns ? `of your turns were warned (${s.hits} of ${s.turns})` : 'of your turns were warned';
  $('sPrec').textContent = s.precision == null ? '–' : `${Math.round(s.precision * 100)}%`;
  $('sPrecSub').textContent = s.warnings ? `of warnings came true (${s.hits} of ${s.hits + s.falseAlarms})` : 'of warnings came true';
});

function renderPeople() {
  const rows = [{ name: `${me.name} (you)`, state: me.state }, ...peers];
  $('people').innerHTML = rows.map((p) =>
    `<li data-state="${p.state}"><span class="dot"></span><span class="who"></span><span class="st">${LABEL[p.state] ?? ''}</span></li>`).join('');
  [...$('people').children].forEach((li, i) => { li.querySelector('.who').textContent = rows[i].name; }); // names as text, never HTML
  if (peers.length === 0) $('people').insertAdjacentHTML('beforeend', '<li class="empty"><span class="st">Waiting for others to join with your code…</span></li>');
}

// breathing canvas: last 12 s of the chest trace, shaded where you were warned or speaking
const SPAN = 12e6;
let points = []; // [t µs, value, state]
api.on('trace', (batch) => {
  if (!points.length) { $('selfWord').textContent = LABEL[me.state]; $('selfWord').dataset.state = me.state; }
  points.push(...batch);
  const cut = points.at(-1)[0] - SPAN - 1e6;
  while (points.length && points[0][0] < cut) points.shift();
});

const canvas = $('wave'), ctx = canvas.getContext('2d');
function draw() {
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 24;
  if (points.length < 2) {
    ctx.fillStyle = '#56685f'; ctx.font = '14px "Atkinson Hyperlegible"'; ctx.textAlign = 'center';
    ctx.fillText('Face the camera with your shoulders and chest in view', w / 2, h / 2);
  } else {
    const end = points.at(-1)[0], start = end - SPAN;
    let lo = Infinity, hi = -Infinity;
    for (const [, v] of points) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const range = Math.max(hi - lo, 1e-6);
    const X = (t) => pad + ((t - start) / SPAN) * (w - pad * 2);
    const Y = (v) => h - pad - ((v - lo) / range) * (h - pad * 2);
    // state bands, one rect per contiguous run so there are no seams
    for (let i = 1; i < points.length; i++) {
      const s = points[i][2];
      if (s === 'quiet') continue;
      let j = i;
      while (j + 1 < points.length && points[j + 1][2] === s) j++;
      ctx.fillStyle = s === 'about' ? 'rgba(242,162,12,.55)' : 'rgba(16,42,34,.13)';
      ctx.fillRect(X(points[i - 1][0]), 0, X(points[j][0]) - X(points[i - 1][0]), h);
      i = j;
    }
    // grid seconds
    ctx.fillStyle = '#9aa89f'; ctx.font = '11px "Space Mono"'; ctx.textAlign = 'center';
    for (let s = 0; s <= 12; s += 2) ctx.fillText(s ? `-${s}s` : 'now', X(end - s * 1e6), h - 6);
    // trace
    ctx.beginPath();
    points.forEach(([t, v], i) => (i ? ctx.lineTo(X(t), Y(v)) : ctx.moveTo(X(t), Y(v))));
    ctx.strokeStyle = '#102a22'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    // the breath bubble at "now"
    const [t, v, s] = points.at(-1);
    const r = 7 + ((v - lo) / range) * 9;
    ctx.beginPath(); ctx.arc(X(t), Y(v), r, 0, Math.PI * 2);
    ctx.fillStyle = s === 'about' ? '#f2a20c' : '#102a22'; ctx.fill();
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
