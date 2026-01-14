/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Storage Routes - Combines all entity routes
 * Uses OpenSearch JS SDK for all operations
 */

import { Router } from 'express';
import adminRoutes from './admin';
import testCasesRoutes from './testCases';
import experimentsRoutes from './experiments';
import runsRoutes from './runs';
import analyticsRoutes from './analytics';

const router = Router();

router.use(adminRoutes);
router.use(testCasesRoutes);
router.use(experimentsRoutes);
router.use(runsRoutes);
router.use(analyticsRoutes);

export default router;
