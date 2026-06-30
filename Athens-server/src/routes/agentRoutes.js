import express from "express";
import {
  getAgentActivity,
  getAgentDashboard,
  getAgentHealth,
  getAgentJobSources,
  getAgentModels,
  getAgentRuns,
  postAgentDeploy,
} from "../controllers/agentController.js";

const router = express.Router();

router.get("/health", getAgentHealth);
router.get("/dashboard", getAgentDashboard);
router.get("/runs", getAgentRuns);
router.get("/activity", getAgentActivity);
router.get("/job-sources", getAgentJobSources);
router.get("/models", getAgentModels);
router.post("/deploy", postAgentDeploy);

export default router;
