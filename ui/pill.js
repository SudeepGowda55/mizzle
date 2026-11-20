// The floating pill shows the OTHER people: who is about to speak, or who is speaking.
const pill = document.getElementById('pill'), text = document.getElementById('text'), dots = document.getElementById('dots');
let peers = [];

function render() {
  const about = peers.filter((p) => p.state === 'about');
  const speaking = peers.filter((p) => p.state === 'speaking');
  const names = (list) => list.map((p) => p.name).join(' & ');
  if (about.length) { pill.dataset.state = 'about'; text.textContent = `${names(about)} ${about.length > 1 ? 'are' : 'is'} about to speak`; }
  else if (speaking.length) { pill.dataset.state = 'speaking'; text.textContent = `${names(speaking)} ${speaking.length > 1 ? 'are' : 'is'} speaking`; }
  else { pill.dataset.state = 'quiet'; text.textContent = peers.length ? 'Floor is open' : 'Waiting for others…'; }
  dots.innerHTML = peers.map((p) => `<i data-state="${p.state}"></i>`).join('');
}

window.mizzle.on('peers', (list) => { peers = list; render(); });
window.mizzle.on('session', (s) => { if (!s) { peers = []; render(); } });
render();
