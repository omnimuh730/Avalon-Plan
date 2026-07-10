# vender-server

Local bridge for the **bid-assistant** Chrome extension. Run this instead of `npm run bridge` inside `bid-assistant`.

It exposes the localhost API (`http://127.0.0.1:3848`) and loads the applicant profile from MongoDB (`account_info.autoBidProfile`), matching how **lancer-frontend** / **lancer-backend** store profile data.

## Setup

```bash
cd vender-server
cp .env.example .env
npm install
```

Configure `.env`:

- `MONGO_URL` / `MONGO_DB` — same MongoDB as lancer-backend (profiles + `bid_records`)
- `API_KEYS_ENCRYPTION_KEY` — same 64-char hex key as Athens-server (decrypts `openaiApiKey` / `deepseekApiKey` from MongoDB)
- `APPLIER_NAME` — account name from the MongoDB `account_info` collection
- OpenAI API key — set in **lancer-frontend → Settings → Profile** (MongoDB), not in this `.env`
- Job Bid **Analyze** always uses hardcoded **`gpt-5-nano`** + `reasoning_effort: minimal` (profile model is ignored)
- `PROMPT_MD_PATH` — optional override; the job-analysis prompt is embedded by default

## Run

```bash
npm run bridge
```

Then load the **built** extension from `bid-assistant/dist` in Chrome. The extension talks to `127.0.0.1:3848` — no extension changes required when `APPLIER_NAME` is set.

## Profile from MongoDB

Profile is read from `account_info.autoBidProfile` for the configured applier. The bridge **never returns** `gmailAppPassword` or `openaiApiKey` in public API responses — those are used server-side only.

Job analysis uses the profile for:

- **Form answers** — name, contact, demographics, education, work history, etc.
- **Resume matching** — picks a PDF from `resumeFolderUrl` using the same folder-scoring logic as lancer-backend

Skills from `personal_info` are included in analysis context. Bid sessions are written to `bid_records` in the same database.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Bridge status |
| GET | `/profile?applierName=` | Public profile (no gmail password) |
| GET | `/accounts` | List applier account names |
| POST | `/inbox` | Gmail IMAP inbox (uses profile credentials if extension omits password) |
| POST | `/message` | Fetch email body |
| POST | `/job-analyze/page` | Job page detection + form answers |
| POST | `/job-analyze/skills` | Skill radar + resume match |
| POST | `/bid-session/*` | Bid session start / events / complete |

Optional request field: `applierName` (overrides `APPLIER_NAME` in `.env`).

## Workflow

1. Manage profile in lancer-frontend → Settings → Profile
2. Run `npm run bridge` in vender-server
3. Build/load bid-assistant extension from `bid-assistant/dist`
