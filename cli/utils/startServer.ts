/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared Server Startup Utility
 * Used by all CLI commands to start the Express server
 */

import type { CLIConfig } from '../types.js';

/**
 * Start the Express server with CLI config
 * Sets environment variables and creates the app instance
 */
export async function startServer(config: CLIConfig): Promise<void> {
  // Set environment variables for the server
  process.env.CLI_MODE = config.mode;
  process.env.VITE_BACKEND_PORT = String(config.port);
  process.env.AGENT_TYPE = config.agent.type;
  process.env.JUDGE_TYPE = config.judge.type;

  // Storage configuration (optional)
  if (config.storage?.endpoint) {
    process.env.OPENSEARCH_STORAGE_ENDPOINT = config.storage.endpoint;
  }
  if (config.storage?.username) {
    process.env.OPENSEARCH_STORAGE_USERNAME = config.storage.username;
  }
  if (config.storage?.password) {
    process.env.OPENSEARCH_STORAGE_PASSWORD = config.storage.password;
  }

  // Agent configuration
  if (config.agent.endpoint) {
    process.env.MLCOMMONS_ENDPOINT = config.agent.endpoint;
  }

  // Judge configuration
  if (config.judge.region) {
    process.env.AWS_REGION = config.judge.region;
  }
  if (config.judge.modelId) {
    process.env.BEDROCK_MODEL_ID = config.judge.modelId;
  }

  // Traces configuration
  if (config.traces) {
    if (config.traces.endpoint) {
      process.env.OPENSEARCH_LOGS_ENDPOINT = config.traces.endpoint;
    }
    if (config.traces.index) {
      process.env.OPENSEARCH_LOGS_TRACES_INDEX = config.traces.index;
    }
  }

  // Dynamic import the server module
  const { createApp } = await import('../../server/app.js');

  const app = createApp(config);

  return new Promise((resolve) => {
    app.listen(config.port, '0.0.0.0', () => {
      resolve();
    });
  });
}
