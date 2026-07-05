import express from "express";
import { postExternalScrapedJob } from "../controllers/scrapedJobIngestController.js";
import { requireExternalScrapeApiKey } from "../middleware/externalScrapeAuth.js";

const router = express.Router();

router.post("/expose/jobs", requireExternalScrapeApiKey, postExternalScrapedJob);

export default router;
