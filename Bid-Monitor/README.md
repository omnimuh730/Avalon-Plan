# Bid Monitor

Chrome extension for Athens **Bid Ready** apply work: silent **tab video** recording, page analyze (Remote / Clearance), and Submit / Skip into Bid Management.

## What it does

- **Bid Ready queue** — live jobs from Athens (`GET /vendor/tasks`)
- **Apply** — opens the job tab and marks the ticket **In-Process**
- **Silent video recording** — toolbar icon or context menu (no screen-share picker)
- **Analyze** — HTML page text → Athens (`POST /api/job-analyze/page` + `/flags`) for JD / Remote / No-clearance lights (no screenshots, no separate vender bridge)
- **Submit / Skip** — stop recording (if active), update Athens Submitted or Skipped; video uploads to Firebase when present

## Install (developer mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder (`Bid-Monitor`)

## Bidder flow

1. Start **Athens-server** (`http://127.0.0.1:8979`).
2. Open the Bid Monitor **side panel** and sign in with your Athens Job Search profile name.
3. Click **Apply** on a Bid Ready job → ticket becomes In-Process.
4. On the job tab, click the **Bid Monitor toolbar icon** (or right-click → Start recording) to start silent capture.
5. Optional: **Analyze** for Remote / Clearance traffic lights (uses your Athens profile LLM key; falls back to local heuristics if unavailable).
6. **Submit** (→ Submitted + upload) or **Skip this Job** (→ Skipped). Both work after Apply even without a video.

While recording on an apply tab, clicking the toolbar icon again **opens the panel** so you can choose Submit vs Skip (it does not silently stop).

## Video format

Chrome `MediaRecorder` writes **WebM (VP9)** or optional **MP4** when selected. Cap is ~720p / 15 fps for smaller reviews.

## Project structure

```
Bid-Monitor/
├── manifest.json
├── background/
│   ├── service-worker.js
│   ├── athens-api.js
│   ├── page-context.js      # HTML extract for Analyze
│   ├── session-recorder.js
│   └── video-store.js
├── sidepanel/               # Primary UI
├── offscreen/               # MediaRecorder (MV3)
└── content/                 # Floating indicator + resume rename
```

## Permissions

- **tabCapture / offscreen** — tab video
- **scripting** — page text for Analyze
- **storage / downloads** — sessions and local video copies
