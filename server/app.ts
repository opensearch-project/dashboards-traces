/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Express App Factory
 * Creates and configures the Express application
 */

import express, { Express } from 'express';
import routes from './routes/index.js';
import { setupMiddleware, setupSpaFallback } from './middleware/index.js';
import { loadConfig } from '@/lib/config/index';

// Register server-side connectors (subprocess, claude-code)
// This import has side effects that register connectors with the registry
import '@/services/connectors/server';

/**
 * Create and configure the Express application
 * Server loads its own config to ensure the cache is populated in the same
 * module scope as route handlers (fixes CLI-spawned server config isolation).
 * @returns Configured Express app
 */
export async function createApp(): Promise<Express> {
  await loadConfig();

  const app = express();

  // Setup middleware (CORS, JSON parsing, static assets)
  setupMiddleware(app);

  // Setup routes
  app.use(routes);

  // SPA fallback - must be after routes so API requests aren't intercepted
  setupSpaFallback(app);

  return app;
}

export default createApp;
