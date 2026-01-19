/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { startServer } from '@/cli/utils/startServer';
import type { CLIConfig } from '@/cli/types';

// Mock the createApp function from server/app
const mockListen = jest.fn((port: number, host: string, cb: () => void) => cb());
const mockApp = { listen: mockListen };
const mockCreateApp = jest.fn().mockReturnValue(mockApp);

jest.mock('@/server/app', () => ({
  createApp: mockCreateApp,
}));

describe('startServer', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    // Clear env vars that might be set
    delete process.env.CLI_MODE;
    delete process.env.VITE_BACKEND_PORT;
    delete process.env.AGENT_TYPE;
    delete process.env.JUDGE_TYPE;
    delete process.env.OPENSEARCH_STORAGE_ENDPOINT;
    delete process.env.OPENSEARCH_STORAGE_USERNAME;
    delete process.env.OPENSEARCH_STORAGE_PASSWORD;
    delete process.env.MLCOMMONS_ENDPOINT;
    delete process.env.AWS_REGION;
    delete process.env.BEDROCK_MODEL_ID;
    delete process.env.OPENSEARCH_LOGS_ENDPOINT;
    delete process.env.OPENSEARCH_LOGS_TRACES_INDEX;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should set basic environment variables', async () => {
    const config: CLIConfig = {
      mode: 'demo',
      port: 4001,
      noBrowser: false,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(process.env.CLI_MODE).toBe('demo');
    expect(process.env.VITE_BACKEND_PORT).toBe('4001');
    expect(process.env.AGENT_TYPE).toBe('mock');
    expect(process.env.JUDGE_TYPE).toBe('mock');
  });

  it('should set storage environment variables when provided', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      storage: {
        endpoint: 'http://opensearch:9200',
        username: 'admin',
        password: 'secret',
      },
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(process.env.OPENSEARCH_STORAGE_ENDPOINT).toBe('http://opensearch:9200');
    expect(process.env.OPENSEARCH_STORAGE_USERNAME).toBe('admin');
    expect(process.env.OPENSEARCH_STORAGE_PASSWORD).toBe('secret');
  });

  it('should set agent endpoint for non-mock agents', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      agent: {
        type: 'mlcommons',
        endpoint: 'http://localhost:9200/_plugins/_ml/agents/test/_execute/stream',
      },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(process.env.MLCOMMONS_ENDPOINT).toBe(
      'http://localhost:9200/_plugins/_ml/agents/test/_execute/stream'
    );
  });

  it('should set judge environment variables for bedrock', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      agent: { type: 'mock' },
      judge: {
        type: 'bedrock',
        region: 'us-west-2',
        modelId: 'anthropic.claude-v3',
      },
    };

    await startServer(config);

    expect(process.env.AWS_REGION).toBe('us-west-2');
    expect(process.env.BEDROCK_MODEL_ID).toBe('anthropic.claude-v3');
  });

  it('should set traces environment variables when provided', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
      traces: {
        endpoint: 'http://traces:9200',
        index: 'otel-v1-*',
      },
    };

    await startServer(config);

    expect(process.env.OPENSEARCH_LOGS_ENDPOINT).toBe('http://traces:9200');
    expect(process.env.OPENSEARCH_LOGS_TRACES_INDEX).toBe('otel-v1-*');
  });

  it('should call createApp with config', async () => {
    const config: CLIConfig = {
      mode: 'demo',
      port: 4001,
      noBrowser: false,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(mockCreateApp).toHaveBeenCalledWith(config);
  });

  it('should start server listening on specified port', async () => {
    const config: CLIConfig = {
      mode: 'demo',
      port: 5000,
      noBrowser: false,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(mockListen).toHaveBeenCalledWith(5000, '0.0.0.0', expect.any(Function));
  });

  it('should not set optional env vars when not provided', async () => {
    const config: CLIConfig = {
      mode: 'demo',
      port: 4001,
      noBrowser: false,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(process.env.OPENSEARCH_STORAGE_ENDPOINT).toBeUndefined();
    expect(process.env.MLCOMMONS_ENDPOINT).toBeUndefined();
    expect(process.env.AWS_REGION).toBeUndefined();
    expect(process.env.OPENSEARCH_LOGS_ENDPOINT).toBeUndefined();
  });

  it('should handle storage without auth', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      storage: {
        endpoint: 'http://opensearch:9200',
        // No username/password
      },
      agent: { type: 'mock' },
      judge: { type: 'mock' },
    };

    await startServer(config);

    expect(process.env.OPENSEARCH_STORAGE_ENDPOINT).toBe('http://opensearch:9200');
    expect(process.env.OPENSEARCH_STORAGE_USERNAME).toBeUndefined();
    expect(process.env.OPENSEARCH_STORAGE_PASSWORD).toBeUndefined();
  });

  it('should handle traces without index', async () => {
    const config: CLIConfig = {
      mode: 'configure',
      port: 4001,
      noBrowser: true,
      agent: { type: 'mock' },
      judge: { type: 'mock' },
      traces: {
        endpoint: 'http://traces:9200',
        // No index specified
      },
    };

    await startServer(config);

    expect(process.env.OPENSEARCH_LOGS_ENDPOINT).toBe('http://traces:9200');
    expect(process.env.OPENSEARCH_LOGS_TRACES_INDEX).toBeUndefined();
  });
});
