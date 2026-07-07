# Gmail Assistant

Chrome sidebar extension to read Gmail emails with the **`Notify/Unnecessary`** label in a compact list view.

## Prerequisites

1. **Google 2-Step Verification** enabled on your Google account
2. **Gmail App Password** — [Google Account → Security → App passwords](https://myaccount.google.com/apppasswords)
3. **Chrome 114+** (for Side Panel API)

## Setup

```bash
npm install
npm run dev:all
```

`dev:all` starts both the Vite dev server and the local IMAP bridge.

## Load the extension in Chrome

**Important:** Load only the **`dist`** folder — not the project root. Loading the repo root causes *Service worker registration failed (status 11)* and the sidebar will not open.

### Development vs production

| Mode | Command | Chrome load |
|------|---------|-------------|
| **Dev (HMR)** | `npm run dev` or `npm run dev:all` | Keep the dev server running, then load **`dist`** and reload after changes |
| **Production** | `npm run build` | Load **`dist`** — no dev server required |

If you see *Service worker registration failed* or a CORS error for `http://localhost:8183/@crx/client-worker`:

1. Make sure **`npm run dev`** (or `dev:all`) is running — dev mode serves the service worker from localhost:8183
2. Reload the extension on `chrome://extensions`
3. Or run **`npm run build`** and reload — production `dist` bundles everything locally with no localhost dependency

The dev server runs on port **8183**.

1. Run `npm run build` (or `npm run dev` for development with hot reload)
2. Open `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked**
5. Select the **`dist`** folder inside this project (it contains `LOAD_THIS_FOLDER_IN_CHROME.txt`)
6. After code changes, click **Reload** on the extension card (or re-run build)

## Usage

1. Click the extension icon to open the **side panel**
2. Open **Settings** (gear icon) and enter your Gmail address + app password
3. Make sure the IMAP bridge is running (`npm run bridge` or `npm run dev:all`)
4. Your labeled emails load automatically — click any email to read it

Only emails with the Gmail label **`Notify/Unnecessary`** are shown. The bridge scans **All Mail** in batches of 100 (newest first) and filters by label, so each batch may add only a few matches. Use **Load more** at the bottom to scan the next 100 older messages. Full HTML is loaded when you open an email.

## Job Bid Assistant

The **Job Bid** tab analyzes the **currently active browser tab** (read-only) to help with job applications.

### Setup

1. In **lancer-frontend → Settings → Profile**, set your **OpenAI API key** and model (stored encrypted in MongoDB on your applier account).
2. Run the local bridge from **vender-server**: `npm run bridge` (set `API_KEYS_ENCRYPTION_KEY` in `vender-server/.env` — same value as Athens-server).

The bridge reads `prompt.md` (skill extraction rules) and resume stacks from MongoDB (`account_info.resumeCatalog`) or `resumes.json`.

### Usage

1. Open a job posting or application page in a normal browser tab
2. Open the side panel → **Job Bid** tab
3. Click **Analyze**

The assistant will:

- Detect whether the page is a job posting
- Summarize the job description
- Extract required skills (radar profile per `prompt.md`)
- Rank the best matching resume variant from `resumes.json`
- Suggest answers for application form fields found on the page

The extension does not fill forms or interact with the page — it only reads visible text and form labels.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Build extension with hot reload |
| `npm run dev:all` | Dev server + IMAP bridge together |
| `npm run bridge` | Start local IMAP bridge only |
| `npm run build` | Production build to `dist/` |

## Architecture

Chrome extensions cannot open raw IMAP/TCP connections. This project uses:

- **Side panel UI** — React app (your existing inbox design)
- **Background service worker** — stores credentials in `chrome.storage.local`, proxies fetch requests
- **Local IMAP bridge** (`scripts/imap-bridge.mjs`) — Node.js server on `127.0.0.1:3847` that connects to `imap.gmail.com` using your app password

Credentials never leave your machine. The bridge only listens on localhost.

## Security notes

- App passwords are stored locally in Chrome extension storage
- The IMAP bridge runs only on `127.0.0.1` and is not exposed to the network
- Use a dedicated app password; you can revoke it anytime from Google Account settings
