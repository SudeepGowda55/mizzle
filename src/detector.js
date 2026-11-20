// Turns the SDK's chest-breathing trace + talking flag into quiet / about / speaking,
// and scores itself: every warning is checked against whether speech really followed.
//
// Idea: people take a quick, deep inhale right before they talk. A normal resting breath
// rises slowly. So we learn how steep your resting inhales are, and flag one that is
// clearly steeper while you're silent.

const WINDOW = 0.25e6;       // slope window, µs
const ABOUT_HOLD = 1.6e6;    // a warning lasts this long unless speech starts
const SPEECH_GAP = 0.7e6;    // talking=false for this long ends a speech turn
const AFTER_SPEECH = 0.8e6;  // ignore inhales right after you stop (catch-up breaths)
const HIT_WINDOW = 2.0e6;    // speech within this long after a warning counts as a hit
const NEW_TURN_GAP = 1.0e6;  // speech after this much silence is a new turn

export class Detector {
  constructor({ sensitivity = 1.5 } = {}) {
    this.sensitivity = sensitivity; // how many times steeper than a resting inhale
    this.trace = [];                // [{t, v}] last ~3 s
    this.polaritySum = 0;           // learned from speech: you breathe OUT while talking
    this.restSlopes = [];           // peak slopes of recent resting inhales
    this.curPeak = 0;               // steepest slope in the inhale in progress
    this.state = 'quiet';
    this.since = 0;
    this.talking = false;
    this.lastTalk = -Infinity;      // last time talking was true
    this.turnStart = -Infinity;
    this.pending = null;            // open warning awaiting speech: {t}
    this.stats = { warnings: 0, hits: 0, falseAlarms: 0, misses: 0, turns: 0, leads: [] };
  }

  get polarity() { return this.polaritySum > 0 ? -1 : 1; }

  // Until we've seen a few resting breaths we don't know what "steeper than usual" means, so we
  // stay silent (a live test fired twice in the first seconds with a guessed threshold).
  get ready() { return this.restSlopes.length >= 3; }

  // Threshold for "clearly steeper than resting".
  threshold() {
    if (!this.ready) return Infinity;
    const s = [...this.restSlopes].sort((a, b) => a - b);
    return s[s.length >> 1] * this.sensitivity;
  }

  chest(t, v) {
    const raw = this.trace.at(-1);
    this.trace.push({ t, v });
    while (this.trace.length && this.trace[0].t < t - 3e6) this.trace.shift();
    const old = this.trace.find((p) => p.t >= t - WINDOW);
    if (!old || old.t === t) return this.tick(t);
    const slope = ((v - old.v) * this.polarity) / ((t - old.t) / 1e6); // trace units per second

    if (this.talking && raw) this.polaritySum += v - raw.v; // falling while talking => normal polarity
    const resting = !this.talking && t - this.lastTalk > AFTER_SPEECH;

    if (slope > 0) this.curPeak = Math.max(this.curPeak, slope);
    else if (this.curPeak > 0) {
      // an inhale just ended; if it wasn't a pre-speech one, it's a resting breath sample
      if (resting && !this.pending) {
        this.restSlopes.push(this.curPeak);
        if (this.restSlopes.length > 15) this.restSlopes.shift();
      }
      this.curPeak = 0;
    }

    if (resting && this.state === 'quiet' && slope > this.threshold()) {
      this.set('about', t);
      this.pending = { t };
      this.stats.warnings++;
    }
    return this.tick(t);
  }

  talk(t, detected) {
    if (detected) {
      if (!this.talking && (t - this.lastTalk > NEW_TURN_GAP || this.pending)) this.newTurn(t);
      this.talking = true;
      this.lastTalk = t;
      if (this.state !== 'speaking') this.set('speaking', t);
    } else if (this.talking && t - this.lastTalk > SPEECH_GAP) {
      this.talking = false;
    }
    return this.tick(t);
  }

  newTurn(t) {
    this.stats.turns++;
    if (this.pending && t - this.pending.t <= HIT_WINDOW) {
      this.stats.hits++;
      this.stats.leads.push((t - this.pending.t) / 1000);
      if (this.stats.leads.length > 50) this.stats.leads.shift();
    } else {
      this.stats.misses++;
    }
    this.pending = null;
  }

  tick(t) {
    if (this.pending && t - this.pending.t > HIT_WINDOW) {
      this.stats.falseAlarms++;
      this.pending = null;
    }
    if (this.state === 'about' && t - this.since > ABOUT_HOLD) this.set('quiet', t);
    if (this.state === 'speaking' && !this.talking) this.set('quiet', t);
    return this.state;
  }

  set(state, t) { this.state = state; this.since = t; }

  summary() {
    const { warnings, hits, falseAlarms, misses, turns, leads } = this.stats;
    const sorted = [...leads].sort((a, b) => a - b);
    return {
      warnings, hits, falseAlarms, misses, turns,
      precision: warnings ? hits / (hits + falseAlarms || 1) : null, // warnings that came true
      recall: turns ? hits / turns : null,                           // turns that were warned
      medianLeadMs: sorted.length ? Math.round(sorted[sorted.length >> 1]) : null,
    };
  }
}
