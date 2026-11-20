# Intake

On video calls, two people often start talking at the same moment because of call delay. But just before anyone speaks, they take a quick breath in without noticing. Intake reads that breath from your webcam with the [Presage SmartSpectra SDK](https://smartspectra.presagetech.com/docs/nodejs) and tells the others on the call that you're about to speak, before your voice reaches them.

Status: feasibility probe. It measures how fast the SDK's chest-breathing and talking signals arrive, and whether an inhale comes before speech.

## Setup

Needs macOS on Apple Silicon, Linux (x64/arm64) or Windows x64, plus Node 20+.

```bash
npm install
echo "SMARTSPECTRA_API_KEY=your_key" > .env   # free key: https://physiology.presagetech.com/auth/register
```

## Run the probe

Sit with your face and upper chest in the camera frame, in even light.

```bash
npm run probe       # talk normally, Ctrl+C to stop
npm run questions   # the Mac asks 20 spoken questions; answer each out loud
```

Each run writes `probe-<time>.jsonl` with one line per chest, abdomen or talking sample. Each line holds the capture timestamp and the time it reached the app, both in µs since the epoch.

## Consent and data handling

- The camera starts only when you run the command yourself. Nothing runs in the background.
- All measurement happens on your machine. No video or vitals are uploaded. The SDK contacts Presage only to validate the API key.
- Presage SDK telemetry is turned off (`enableTelemetry: false`).
- The recorded `.jsonl` files stay on your disk and are git-ignored. Delete them anytime.
- This is not a medical device and makes no health claims.
