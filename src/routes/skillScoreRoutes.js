import express from 'express';
import { recalculateSkillScore } from '../controllers/skillScoreController.js';

const router = express.Router();

router.post('/skillscore/recalculate', recalculateSkillScore);

export default router;

