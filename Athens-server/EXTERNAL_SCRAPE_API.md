# External scrape ingestion API

Third-party scrapers can push job listings into Athens via a dedicated HTTP endpoint. Ingested jobs are stored in MongoDB collection **`external_scraped_jobs`**, separate from the main **`job_market`** catalog.

Base URL (local default): `http://{SERVER_IP}:8979/api`

---

## Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/expose/jobs` | Ingest one job, or a batch via a `jobs` array |

Route wiring:

- `src/routes/scrapedJobIngestRoutes.js` — mounts `POST /expose/jobs` under `/api`
- `index.js` — `app.use('/api', scrapedJobIngestRoutes)`

---

## Request body

### Single job

Send a JSON object with the fields below.

```bash
curl -X POST http://{SERVER_IP}/api/expose/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "my-scraper-v1",
    "companyName": "Acme Corp",
    "companyIcon": "https://example.com/logo.png",
    "jobTitle": "Senior Engineer",
    "jobDescription": "Full job description text…",
    "jobLink": "https://jobs.example.com/123",
    "source": "linkedin"
  }'
```

### Batch

Send `{ "jobs": [ … ] }`. Each element uses the same shape as a single job. The array must not be empty.

---

## Fields

| Field | Required | Aliases | Notes |
|-------|----------|---------|-------|
| `sender` | yes | `Sender` | Identifies the integrator / scraper |
| `companyName` | yes | `company_name` | |
| `jobTitle` | yes | `job_title`, `title` | |
| `jobDescription` | yes | `job_description`, `description` | |
| `jobLink` | yes | `job_link`, `applyLink`, `url` | Must be a valid `http://` or `https://` URL |
| `companyIcon` | no | `company_icon` | If present, must be a valid `http(s)` URL |
| `source` | no | — | Optional tag (e.g. board name) |

Validation lives in `src/services/scrapedJobIngestService.js` (`validateScrapedJobInput`).

---

## Responses

### Single job — created (201)

```json
{
  "success": true,
  "created": true,
  "id": "<mongodb ObjectId>",
  "jobLink": "https://jobs.example.com/123"
}
```

### Single job — duplicate (200)

Duplicates are detected by unique index on `jobLink`. No new document is inserted.

```json
{
  "success": true,
  "created": false,
  "duplicate": true,
  "jobLink": "https://jobs.example.com/123"
}
```

### Batch — mixed results (201)

```json
{
  "success": true,
  "created": 2,
  "duplicates": 1,
  "results": [
    { "created": true, "id": "…", "jobLink": "…" },
    { "created": false, "duplicate": true, "jobLink": "…" }
  ]
}
```

### Validation error (400)

```json
{
  "success": false,
  "error": "jobTitle is required"
}
```

For batch requests, errors include the array index: `jobs[2]: jobLink must be a valid http(s) URL`.

### Server error (500)

```json
{
  "success": false,
  "error": "<message>"
}
```

---

## Storage (MongoDB)

Collection: **`external_scraped_jobs`** (`src/db/mongo.js`).

Each document stores the normalized job fields plus:

- `createdAt` — insert time
- `updatedAt` — insert time (same as `createdAt` on first write)

Indexes:

| Index | Purpose |
|-------|---------|
| `{ jobLink: 1 }` unique (partial: string only) | Dedupe by apply URL |
| `{ createdAt: -1 }` | Recent-first listing |
| `{ sender: 1, createdAt: -1 }` | Filter by integrator |
| `{ source: 1, createdAt: -1 }` | Filter by source tag |

---

## Code map

| File | Role |
|------|------|
| `src/routes/scrapedJobIngestRoutes.js` | Express route |
| `src/controllers/scrapedJobIngestController.js` | HTTP handler (`postExternalScrapedJob`) |
| `src/services/scrapedJobIngestService.js` | Validation + insert / dedupe |
| `src/db/mongo.js` | Collection + indexes |
