import { Router } from "express";
import {
  getAiUsage,
  getAiUsageSummary,
  getAiUsageMonitor,
} from "../controllers/aiUsageController.js";

const router = Router();

router.get("/ai-usage", getAiUsage);
router.get("/ai-usage/summary", getAiUsageSummary);
router.get("/ai-usage/monitor", getAiUsageMonitor);

export default router;
