import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Detector } from '../src/detector.js';

const FPS = 30, DT = 1e6 / FPS;

// Resting breathing: slow sine, 15 breaths/min. A pre-speech inhale: a fast, deep rise over 0.4 s.
function session({ speechAt = [], invert = false }) {
  const d = new Detector();
  const events = [];
  const sign = invert ? -1 : 1;
  for (let i = 0; i < FPS * 60; i++) {
    const t = 1_000_000 + i * DT, s = t / 1e6;
    let v = Math.sin((2 * Math.PI * s) / 4);
    let talking = false;
    for (const at of speechAt) {
      if (s >= at - 0.4 && s < at) v += ((s - (at - 0.4)) / 0.4) * 4;          // quick deep inhale
      if (s >= at && s < at + 3) { v += 4 - (s - at) * 1.5; talking = true; }  // exhale while talking
    }
    const before = d.state;
    d.chest(t, v * sign);
    d.talk(t, talking);
    if (d.state !== before) events.push({ s: +s.toFixed(2), state: d.state });
  }
  return { d, events };
}

test('stays quiet through a minute of resting breathing', () => {
  const { d, events } = session({});
  assert.equal(events.length, 0);
  assert.equal(d.summary().warnings, 0);
});

test('warns before each turn, ahead of the voice', () => {
  const { d, events } = session({ speechAt: [20, 32, 45] });
  const s = d.summary();
  assert.equal(s.turns, 3);
  assert.equal(s.hits, 3, JSON.stringify(events));
  assert.equal(s.falseAlarms, 0);
  assert.ok(s.medianLeadMs > 100 && s.medianLeadMs < 450, `lead ${s.medianLeadMs}`);
  for (const at of [20, 32, 45]) assert.ok(events.some((e) => e.state === 'about' && e.s < at && e.s > at - 0.5));
});

test('learns an upside-down trace from how you breathe while talking', () => {
  const { d } = session({ speechAt: [12, 24, 36, 48], invert: true });
  assert.equal(d.polarity, -1);
  assert.ok(d.summary().hits >= 2, JSON.stringify(d.summary()));
});
