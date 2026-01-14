/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Health Check Route
 */

import { Request, Response, Router } from 'express';

const router = Router();

/**
 * GET /health - Simple health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'bedrock-judge-proxy' });
});

export default router;
