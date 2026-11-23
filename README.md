# Mizzle

**Breathe in. They'll know.**

On video calls, two people often start talking at the same moment because of call delay. *"Sorry, you go." "No, you go."*

But just before anyone speaks, they take a quick breath in without noticing it. Mizzle reads that breath from your webcam with the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs) and tells everyone else on the call **"Sudeep is about to speak"**, before your voice reaches them.

It runs beside Zoom, Google Meet, Teams or any other call app, as a small floating pill. No call integration is needed.


https://github.com/user-attachments/assets/a17e7fe2-2c7a-472c-b939-75793f1b9d88



*2-minute narrated demo: install, consent, room, live breathing, the floating pill, self-scoring and privacy.*

**Live recording, unedited (1:49):**

https://github.com/user-attachments/assets/d696843a-ab32-44fc-8bcf-7b7d60c6560b

The release build on a MacBook with the real Presage signal: it learns the breathing, switches between quiet and speaking, and once turns to "about to speak" before the first word, a warning that came true with a 1.47 s head start. In this take 1 of 9 turns was warned, and the app shows that count on screen. The narrated demo above uses labelled simulated data; this one does not.

## Download

**[⬇ Download Mizzle for Mac (Apple Silicon)](https://github.com/SudeepGowda55/mizzle/releases/latest/download/Mizzle-mac-arm64.dmg)** · 151 MB · [all releases](https://github.com/SudeepGowda55/mizzle/releases)

1. Open the `.dmg` and drag **Mizzle** into **Applications**.
2. Open Mizzle. The app isn't notarized by Apple, so the first launch is blocked once. To allow it:
   - **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to "Mizzle was blocked", or
   - in Terminal: `xattr -dr com.apple.quarantine /Applications/Mizzle.app`
3. Click **Allow** when macOS asks for camera access.

Requirements: a Mac with Apple Silicon (M1 or newer) and an internet connection. Nothing else to install, and no account or API key needed.

## How to use it

1. **Agree** to the camera notice, then type your name.
2. One person clicks **Start room** and sends the room code (e.g. `maple-otter-42`) to the others on the call.
3. Everyone else pastes the code and clicks **Join**.
4. Sit facing the camera with your **face and upper chest in view**, in even light. For about 10 seconds Mizzle shows *learning your breathing* while it learns your normal breaths.
5. Click **Float over my call**. A small pill stays on top of your call window:
   - 🟠 **"Manvith is about to speak"**: hold on, someone is about to talk
   - ⚫ **"Manvith is speaking"**
   - **"Floor is open"**: go ahead

The main window shows your live breathing line, with the moments you were flagged "about to speak" (orange) and speaking (grey). It also shows how well the detector is doing on **you**, measured live:

- **ms head start**: how long before your voice the warning went out (median)
- **turns warned**: how many times you started talking that were flagged in advance
- **warnings that came true**: how many flags were followed by you actually speaking

Every number comes from your own session. The detector checks each warning against the SDK's own talking detector.

## How it works

```
webcam ─▶ SmartSpectra SDK (on-device) ─▶ chest breathing trace + talking flag
                                              │
                                              ▼
                                   Detector (src/detector.js)
              learns how steep your resting inhales are, then flags an inhale
              that is clearly steeper while you're silent ─▶ quiet / about / speaking
                                              │
                                              ▼
                     Room (src/room.js) ── public MQTT relays ──▶ everyone's pill
```

- **The signal:** people inhale quickly right before they speak. Speech research has measured this with chest belts (e.g. Torreira et al., 2015, *Breathing for answering*). Mizzle does it with a plain webcam.
- **Detector:** compares how fast each inhale rises against the median of your recent resting inhales (`sensitivity` = 1.5×). It stays silent until it has seen 3 resting breaths. It works out the trace's direction itself from the fact that you breathe *out* while talking, and ignores catch-up breaths for 0.8 s after you stop talking.
- **Self-scoring:** a warning followed by speech within 2 s is a hit, and the time between them is the head start. A warning with no speech is a false alarm. A turn with no warning is a miss.
- **Room:** each participant publishes `{id, name, state}` on the topic `mizzle/v1/<room-code>` on **two public MQTT relays at once** (EMQX and HiveMQ). Two people can never end up on different relays, and the room keeps working while either relay is up. Peers that go silent for 7 s drop out.

### Measured so far

| What | Result | Source |
|---|---|---|
| Delay of the chest-breathing samples | **39 ms** median, 69 ms at p90 | 62 s live probe, 1,857 samples |
| Delay of the talking samples | **~45 ms** median | same probe, 2,500+ samples |
| Relay: state change → other laptop | **~0.2 s** | two-client relay test |
| Inhale before speech | inhale peaked **~0.35 s** before speaking in 4 clean turns | first probe. A small sample, so treat it as a lead, not proof. The app's live stats are the real measurement. |

## Consent and data handling

- **Consent first.** The camera never turns on until you tick the consent box and join a room. Leaving the room turns it off.
- **On-device.** Video frames and breathing measurements are processed on your Mac by the SmartSpectra SDK. Nothing is recorded, saved to disk or uploaded.
- **What leaves your Mac:** only your display name, a random session id and one word of status (`quiet`, `about`, `speaking`). These go to the people using the same room code, through two free public MQTT relays (broker.emqx.io and broker.hivemq.com). These relays are public, so anyone who knows or guesses your room code could see those three fields. No video, vitals or breathing values are ever sent.
- **SDK contact.** The SDK contacts Presage only to validate the API key. **Presage telemetry is turned off** (`enableTelemetry: false`).
- **Retention:** no video, breathing data or statistics are stored. The only thing kept on your Mac is the display name you typed, so you don't have to retype it.
- **Not medical.** Mizzle reads breathing rhythm for conversation turn-taking only. It makes no health claims and isn't a medical device.
- **Covert monitoring isn't possible.** Each person runs Mizzle on their own machine, with their own camera and consent. It never analyses anyone else's video.

## Build from source

Needs Node 20+ and macOS on Apple Silicon (the SDK also supports Linux and Windows x64; the app hasn't been packaged for them yet).

```bash
git clone https://github.com/SudeepGowda55/mizzle && cd mizzle
npm install
echo "SMARTSPECTRA_API_KEY=your_key" > .env   # free key: https://physiology.presagetech.com/auth/register
npm start                                    # run the app
npm test                                     # detector tests
npm run dist                                 # build dist/Mizzle-1.1.0-arm64.dmg
```

`npm start` and `npm run dist` write your key into `app-config.json` (git-ignored), which ships inside the app. That's how the release runs without setup.

> Running from VS Code's terminal? VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes Electron start as plain Node. Use `env -u ELECTRON_RUN_AS_NODE npm start`.

### Research tools

```bash
npm run probe                          # log raw chest + talking samples with timestamps to probe-<time>.jsonl
npm run questions                      # same, while the Mac asks 20 spoken questions to capture speech onsets
npm run replay probe-<time>.jsonl 1.5  # replay a recording through the detector at a given sensitivity
```

## Project layout

| Path | What it is |
|---|---|
| `main.js` | Electron main process: camera + SDK, detector, room, windows |
| `preload.cjs` | the safe bridge between the windows and the main process |
| `src/detector.js` | pre-speech inhale detector with live self-scoring |
| `src/room.js` | room codes and state sharing over two MQTT relays |
| `ui/` | main window (consent, room, live breathing) and the floating pill |
| `probe.mjs`, `scripts/` | latency probe, replay tool, key config writer |
| `test/` | detector tests (`npm test`) |

## Built with

[Presage SmartSpectra SDK](https://smartspectra.presagetech.com) 3.5.0 (Node) · Electron 38 · MQTT.js · electron-builder

## License

MIT
