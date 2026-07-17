import express from "express";
import {
	listBidResults,
	updateBidResultStatus,
	startBidResult,
	completeBidResult,
	skipBidResult,
	saveBidResultFlags,
	uploadBidRecording,
} from "../controllers/bidResultsController.js";

const router = express.Router();

router.get("/bid-results", listBidResults);
router.patch("/bid-results/:id", updateBidResultStatus);
router.post("/bid-results/start", startBidResult);
router.post("/bid-results/complete", completeBidResult);
router.post("/bid-results/skip", skipBidResult);
router.post("/bid-results/flags", saveBidResultFlags);
router.post("/bid-recordings/upload", uploadBidRecording);

export default router;
