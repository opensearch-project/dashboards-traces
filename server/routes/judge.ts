/**
 * Judge API Route - Evaluate agent trajectories
 */

import { Request, Response, Router } from 'express';
import { evaluateTrajectory, parseBedrockError } from '../services/bedrockService';

const router = Router();

/**
 * POST /api/judge - Evaluate agent trajectory
 */
router.post('/api/judge', async (req: Request, res: Response) => {
  try {
    const { trajectory, expectedOutcomes, expectedTrajectory, logs, modelId } = req.body;

    // Validate required fields
    if (!trajectory) {
      return res.status(400).json({
        error: 'Missing required field: trajectory'
      });
    }

    if (!expectedOutcomes?.length && !expectedTrajectory?.length) {
      return res.status(400).json({
        error: 'Missing required field: expectedOutcomes or expectedTrajectory'
      });
    }

    // Call Bedrock service to evaluate trajectory
    // modelId is optional - falls back to BEDROCK_MODEL_ID env var if not provided
    const result = await evaluateTrajectory({
      trajectory,
      expectedOutcomes,
      expectedTrajectory,
      logs
    }, modelId);

    res.json(result);

  } catch (error: any) {
    console.error('[JudgeAPI] Error during evaluation:', error);

    const errorMessage = parseBedrockError(error);

    res.status(500).json({
      error: `Bedrock Judge evaluation failed: ${errorMessage}`,
      details: error.message
    });
  }
});

export default router;
