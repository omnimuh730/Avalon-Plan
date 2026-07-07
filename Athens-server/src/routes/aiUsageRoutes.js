import { Router } from "express";
import { getAiUsage, getAiUsageSummary } from "../controllers/aiUsageController.js";

const router = Router();

router.get("/ai-usage", getAiUsage);
router.get("/ai-usage/summary", getAiUsageSummary);

export default router;
