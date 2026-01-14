/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Express App Factory
 * Creates and configures the Express application
 * Can be used by both the standalone server and the CLI
 */

import express, { Express } from 'express';
import routes from './routes/index.js';
import { setupMiddleware } from './middleware/index.js';

// CLI Configuration Interface
// Note: This interface is intentionally duplicated from cli/types.ts to decouple
// the server from CLI dependencies. Keep in sync if changes are needed.
export interface CLIConfig {
  mode: 'demo' | 'configure';
  port: number;
  noBrowser: boolean;
  storage?: {
    endpoint?: string;
    username?: string;
    password?: string;
  };
  agent: {
    type: 'mock' | 'mlcommons' | 'langgraph';
    endpoint?: string;
  };
  judge: {
    type: 'mock' | 'bedrock';
    region?: string;
    modelId?: string;
  };
  traces?: {
    endpoint?: string;
    index?: string;
  };
}

// Global CLI config - set by CLI when starting the app
let globalCLIConfig: CLIConfig | null = null;

/**
 * Get the current CLI configuration
 */
export function getCLIConfig(): CLIConfig | null {
  return globalCLIConfig;
}

/**
 * Check if running in any CLI mode
 */
export function isCLIMode(): boolean {
  return globalCLIConfig !== null || !!process.env.CLI_MODE;
}

/**
 * Check if agent should use mock
 */
export function useMockAgent(): boolean {
  return globalCLIConfig?.agent.type === 'mock' || process.env.AGENT_TYPE === 'mock';
}

/**
 * Check if judge should use mock
 */
export function useMockJudge(): boolean {
  return globalCLIConfig?.judge.type === 'mock' || process.env.JUDGE_TYPE === 'mock';
}

/**
 * Create and configure the Express application
 * @param config Optional CLI configuration
 * @returns Configured Express app
 */
export function createApp(config?: CLIConfig): Express {
  // Store CLI config globally if provided
  if (config) {
    globalCLIConfig = config;

    // Also set environment variables for compatibility
    process.env.CLI_MODE = config.mode;
    process.env.AGENT_TYPE = config.agent.type;
    process.env.JUDGE_TYPE = config.judge.type;

    if (config.storage?.endpoint) {
      process.env.OPENSEARCH_STORAGE_ENDPOINT = config.storage.endpoint;
    }
    if (config.storage?.username) {
      process.env.OPENSEARCH_STORAGE_USERNAME = config.storage.username;
    }
    if (config.storage?.password) {
      process.env.OPENSEARCH_STORAGE_PASSWORD = config.storage.password;
    }
    if (config.agent.endpoint) {
      process.env.MLCOMMONS_ENDPOINT = config.agent.endpoint;
    }
    if (config.judge.region) {
      process.env.AWS_REGION = config.judge.region;
    }
    if (config.judge.modelId) {
      process.env.BEDROCK_MODEL_ID = config.judge.modelId;
    }
    if (config.traces?.endpoint) {
      process.env.OPENSEARCH_LOGS_ENDPOINT = config.traces.endpoint;
    }
    if (config.traces?.index) {
      process.env.OPENSEARCH_LOGS_TRACES_INDEX = config.traces.index;
    }
  }

  const app = express();

  // Setup middleware (CORS, JSON parsing, static serving)
  setupMiddleware(app);

  // Setup routes
  app.use(routes);

  return app;
}

export default createApp;
