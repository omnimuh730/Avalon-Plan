# Bid Monitor

Chrome extension for monitoring bidders during job applications. It records a **session video** of tab activity and tracks resume uploads.

## What it does

- **Start Recording** — begins a session and starts recording tab video in the current Chrome window.
- **Tab switches** — when the bidder opens another tab in the **same window**, recording continues on the new tab.
- **Stop Recording** — ends the session and downloads `session.webm` plus `session.json`.
- **Resume rename** — while recording, file uploads are renamed to `{ResumeSetFolder}.pdf` when possible.
- **Resume events** — logs upload metadata and links it to the session folder name.

## Video format (WebM, not WebP)

Chrome’s `MediaRecorder` API records **WebM video (VP9)** — there is no supported **WebP video** container for tab recording. WebM with VP9 gives similar compression benefits (much smaller than PNG screenshots). Files are saved as `session.webm`.

Recording is capped at **720p / 15 fps / ~900 kbps** to keep session files smaller while staying readable for form-filling review.

## Install (developer mode)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this project folder (`Bid-Monitor`)

## How bidders should use it

1. Open the Bid Monitor side panel and sign in with your **Athens applier name** (Job Search profile).
2. Open the **Bid Ready** pool — jobs come from Athens (`GET /vendor/tasks`).
3. Click **Apply** on a job — opens the JD tab and marks the ticket **In-Process** in Bid Management.
4. Start recording, complete the application, then **Submit** (→ Submitted) or **Skip this Job** (→ Skipped). Both stop recording.
5. Video downloads locally **and** uploads to Firebase (`bid-recordings/…`) via Athens; the ticket moves to **Submitted**.

Optional local fallback path: `Downloads/bid-monitor/{bidder}-{session-id}/`.

**Note:** Recording is tied to one Chrome **window**. Opening a different Chrome window is not included. The OS file picker dialog is also outside the tab and usually will not appear in tab video.

## Resume folder tracking

Browsers hide the local folder path from file pickers. While recording:

1. **Rename on upload** — `{ResumeSetFolder}.pdf` is submitted when the site uses a normal file input.
2. **Session folder field** — entered at start; stored in `session.json`.
3. **Resume events** — original and submitted filenames, size, URL, timestamp.

## Session download

```
Downloads/bid-monitor/Alice-session-123456/
├── session.webm     # Full session video (WebM VP9)
└── session.json     # Bidder, folder, resume events, video metadata
```

## Project structure

```
Bid-Monitor/
├── manifest.json
├── background/
│   ├── service-worker.js
│   ├── session-recorder.js
│   └── video-store.js
├── offscreen/           # MediaRecorder (required in MV3)
├── content/content.js   # Resume rename + recording indicator
└── popup/
```

## Permissions

- **tabCapture / offscreen** — record tab video
- **activeTab / tabs** — follow active tab in the session window
- **storage / unlimitedStorage** — session metadata and video blobs
- **downloads** — save files on stop
