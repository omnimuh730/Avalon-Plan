import express from "express";
import {
	postJobAnalyzePage,
	postJobAnalyzeFlags,
} from "../controllers/bidJobAnalyzeController.js";

const router = express.Router();

router.post("/job-analyze/page", postJobAnalyzePage);
router.post("/job-analyze/flags", postJobAnalyzeFlags);

export default router;
