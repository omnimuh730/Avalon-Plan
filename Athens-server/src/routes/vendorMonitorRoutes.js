import express from "express";
import {
	getBidSessions,
	getBidSessionsAnalytics,
	getBidSessionDetail,
	deleteBidSession,
	deleteBidSessionsBulk,
} from "../controllers/vendorMonitorController.js";
import {
	listVendorTasks,
	addVendorTasks,
	updateVendorTask,
	deleteVendorTask,
	clearVendorTasks,
	getVendorTasksAnalytics,
} from "../controllers/vendorTaskController.js";

const router = express.Router();

router.get("/vendor/bid-sessions", getBidSessions);
router.get("/vendor/bid-sessions/analytics", getBidSessionsAnalytics);
router.delete("/vendor/bid-sessions", deleteBidSessionsBulk);
router.get("/vendor/bid-sessions/:sessionId", getBidSessionDetail);
router.delete("/vendor/bid-sessions/:sessionId", deleteBidSession);

router.get("/vendor/tasks/analytics", getVendorTasksAnalytics);
router.get("/vendor/tasks", listVendorTasks);
router.post("/vendor/tasks", addVendorTasks);
router.patch("/vendor/tasks/:taskId", updateVendorTask);
router.delete("/vendor/tasks/:taskId", deleteVendorTask);
router.delete("/vendor/tasks", clearVendorTasks);

export default router;
