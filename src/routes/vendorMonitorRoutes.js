import express from "express";
import {
	getBidSessions,
	getBidSessionDetail,
	deleteBidSession,
	deleteBidSessionsBulk,
} from "../controllers/vendorMonitorController.js";

const router = express.Router();

router.get("/vendor/bid-sessions", getBidSessions);
router.delete("/vendor/bid-sessions", deleteBidSessionsBulk);
router.get("/vendor/bid-sessions/:sessionId", getBidSessionDetail);
router.delete("/vendor/bid-sessions/:sessionId", deleteBidSession);

export default router;
