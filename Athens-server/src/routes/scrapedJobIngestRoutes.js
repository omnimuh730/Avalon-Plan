import express from "express";
import { postExternalScrapedJob } from "../controllers/scrapedJobIngestController.js";

const router = express.Router();

router.post("/expose/jobs", postExternalScrapedJob);

export default router;
