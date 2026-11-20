// A call "room": everyone with the same code sees each other's state (quiet / about / speaking).
// Uses a free public MQTT relay, so nobody has to host a server. Only {id, name, state} is sent.
import mqtt from 'mqtt';
import { randomBytes } from 'node:crypto';

const BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
const HEARTBEAT = 2000, STALE = 7000;

const WORDS = ['maple', 'otter', 'cedar', 'heron', 'lumen', 'fjord', 'basil', 'comet', 'delta', 'ember',
  'grove', 'lotus', 'mango', 'nova', 'opal', 'pine', 'quill', 'river', 'sage', 'tulip'];
export const newRoomCode = () =>
  `${WORDS[randomBytes(1)[0] % WORDS.length]}-${WORDS[randomBytes(1)[0] % WORDS.length]}-${10 + (randomBytes(1)[0] % 90)}`;

// Room codes travel in the topic name, so keep them to a safe charset.
export const cleanCode = (code) => String(code).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

export function joinRoom({ code, name, onPeers, onStatus }) {
  const id = randomBytes(6).toString('hex');
  const topic = `intake/v1/${cleanCode(code)}`;
  const peers = new Map(); // id -> {name, state, seen}
  let me = { id, name: String(name).slice(0, 24), state: 'quiet' };
  let client, brokerIx = 0, closed = false;

  const emit = () => {
    const now = Date.now();
    for (const [pid, p] of peers) if (now - p.seen > STALE) peers.delete(pid);
    onPeers([...peers.values()]);
  };
  const send = () => client?.connected && client.publish(topic, JSON.stringify(me));

  function connect() {
    const url = BROKERS[brokerIx % BROKERS.length];
    onStatus?.({ state: 'connecting', relay: new URL(url).hostname });
    client = mqtt.connect(url, {
      clientId: `intake-${id}-${brokerIx}`,
      connectTimeout: 6000,
      reconnectPeriod: 0, // we handle failover ourselves
      will: { topic, payload: JSON.stringify({ id, left: true }) },
    });
    client.on('connect', () => {
      client.subscribe(topic);
      onStatus?.({ state: 'connected', relay: new URL(url).hostname });
      send();
    });
    client.on('message', (_t, buf) => {
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      if (!m || typeof m.id !== 'string' || m.id === id) return;
      if (m.left) peers.delete(m.id);
      else if (['quiet', 'about', 'speaking'].includes(m.state)) {
        peers.set(m.id, { id: m.id, name: String(m.name ?? '?').slice(0, 24), state: m.state, seen: Date.now() });
      }
      emit();
    });
    const retry = () => {
      if (closed) return;
      client.removeAllListeners();
      client.end(true);
      brokerIx++;
      onStatus?.({ state: 'retrying' });
      setTimeout(connect, 1500);
    };
    client.on('close', retry);
    client.on('error', retry);
  }

  connect();
  const beat = setInterval(() => { send(); emit(); }, HEARTBEAT);

  return {
    id,
    setState(state) {
      if (state === me.state) return;
      me = { ...me, state };
      send();
    },
    leave() {
      closed = true;
      clearInterval(beat);
      if (client?.connected) client.publish(topic, JSON.stringify({ id, left: true }));
      client?.end();
    },
  };
}
