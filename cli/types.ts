/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CLI Type Definitions
 * Shared types for the CLI commands and server integration
 */

/**
 * CLI Configuration Interface
 * Used to configure the server when started via CLI
 */
export interface CLIConfig {
  mode: 'demo' | 'configure';
  port: number;
  noBrowser: boolean;
  // Storage is optional - if not configured, sample data only mode
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
