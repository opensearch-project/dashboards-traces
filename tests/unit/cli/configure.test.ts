/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { runConfigureMode } from '@/cli/commands/configure';

// Mock external dependencies
jest.mock('chalk', () => {
  const chalk = {
    cyan: jest.fn((s: string) => s),
    gray: jest.fn((s: string) => s),
    green: jest.fn((s: string) => s),
    bold: jest.fn((s: string) => s),
    red: jest.fn((s: string) => s),
  };
  // Support both chalk.green() and chalk.green.bold()
  (chalk.green as any).bold = jest.fn((s: string) => s);
  return {
    __esModule: true,
    default: chalk,
  };
});

jest.mock('ora', () => {
  const mockSpinner = {
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
  };
  const oraFn = jest.fn(() => mockSpinner);
  return {
    __esModule: true,
    default: oraFn,
  };
});

jest.mock('open', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

// Mock startServer - jest.fn is hoisted so declare inside the factory
jest.mock('@/cli/utils/startServer', () => ({
  startServer: jest.fn().mockResolvedValue(undefined),
}));

// Mock inquirer - dynamic import
jest.mock('inquirer', () => ({
  default: {
    prompt: jest.fn(),
  },
}));

// Mock fs/promises for saveConfig
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}));

// Mock os for homedir
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/mock/home'),
}));

// Get mocked startServer
import { startServer as mockStartServer } from '@/cli/utils/startServer';

describe('Configure Command', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;
  let inquirerMock: any;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);

    // Get the mock for inquirer
    inquirerMock = require('inquirer').default;
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('runConfigureMode', () => {
    it('should configure with all mock options (minimal config)', async () => {
      // Setup prompts to select mock options and skip storage
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // Step 1: no storage
        .mockResolvedValueOnce({ agentType: 'mock' }) // Step 2: mock agent
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Step 3: mock judge
        .mockResolvedValueOnce({ enableTraces: false }) // Step 4: no traces
        .mockResolvedValueOnce({ save: false }); // Don't save config

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'configure',
          port: 4001,
          agent: { type: 'mock' },
          judge: { type: 'mock' },
        })
      );
    });

    it('should configure with storage options', async () => {
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: true }) // Step 1: configure storage
        .mockResolvedValueOnce({
          endpoint: 'http://opensearch:9200',
          username: 'admin',
          password: 'secret123',
        }) // Storage config
        .mockResolvedValueOnce({ agentType: 'mock' }) // Mock agent
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Mock judge
        .mockResolvedValueOnce({ enableTraces: false }) // No traces
        .mockResolvedValueOnce({ save: false }); // Don't save

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          storage: {
            endpoint: 'http://opensearch:9200',
            username: 'admin',
            password: 'secret123',
          },
        })
      );
    });

    it('should configure with mlcommons agent', async () => {
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // No storage
        .mockResolvedValueOnce({ agentType: 'mlcommons' }) // ML-Commons agent
        .mockResolvedValueOnce({ endpoint: 'http://localhost:9200/_plugins/_ml/agents/abc/_execute/stream' }) // Agent endpoint
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Mock judge
        .mockResolvedValueOnce({ enableTraces: false }) // No traces
        .mockResolvedValueOnce({ save: false }); // Don't save

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: {
            type: 'mlcommons',
            endpoint: 'http://localhost:9200/_plugins/_ml/agents/abc/_execute/stream',
          },
        })
      );
    });

    it('should configure with langgraph agent', async () => {
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // No storage
        .mockResolvedValueOnce({ agentType: 'langgraph' }) // Langgraph agent
        .mockResolvedValueOnce({ endpoint: 'http://localhost:8080/agent/stream' }) // Agent endpoint
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Mock judge
        .mockResolvedValueOnce({ enableTraces: false }) // No traces
        .mockResolvedValueOnce({ save: false }); // Don't save

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: {
            type: 'langgraph',
            endpoint: 'http://localhost:8080/agent/stream',
          },
        })
      );
    });

    it('should configure with bedrock judge', async () => {
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // No storage
        .mockResolvedValueOnce({ agentType: 'mock' }) // Mock agent
        .mockResolvedValueOnce({ judgeType: 'bedrock' }) // Bedrock judge
        .mockResolvedValueOnce({ region: 'us-east-1', modelId: 'anthropic.claude-v2' }) // Bedrock config
        .mockResolvedValueOnce({ enableTraces: false }) // No traces
        .mockResolvedValueOnce({ save: false }); // Don't save

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          judge: {
            type: 'bedrock',
            region: 'us-east-1',
            modelId: 'anthropic.claude-v2',
          },
        })
      );
    });

    it('should configure with traces enabled', async () => {
      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // No storage
        .mockResolvedValueOnce({ agentType: 'mock' }) // Mock agent
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Mock judge
        .mockResolvedValueOnce({ enableTraces: true }) // Enable traces
        .mockResolvedValueOnce({ endpoint: 'http://traces:9200', index: 'otel-*' }) // Traces config
        .mockResolvedValueOnce({ save: false }); // Don't save

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(mockStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          traces: {
            endpoint: 'http://traces:9200',
            index: 'otel-*',
          },
        })
      );
    });

    it('should save config when requested', async () => {
      const fsMock = require('fs/promises');

      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false }) // No storage
        .mockResolvedValueOnce({ agentType: 'mock' }) // Mock agent
        .mockResolvedValueOnce({ judgeType: 'mock' }) // Mock judge
        .mockResolvedValueOnce({ enableTraces: false }) // No traces
        .mockResolvedValueOnce({ save: true }); // Save config

      await runConfigureMode({ port: 4001, noBrowser: true });

      expect(fsMock.mkdir).toHaveBeenCalledWith(
        '/mock/home/.agent-health',
        { recursive: true }
      );
      expect(fsMock.writeFile).toHaveBeenCalledWith(
        '/mock/home/.agent-health/config.json',
        expect.any(String),
        { mode: 0o600 }
      );
    });

    it('should open browser when noBrowser is false', async () => {
      const openModule = require('open');

      inquirerMock.prompt
        .mockResolvedValueOnce({ configureStorage: false })
        .mockResolvedValueOnce({ agentType: 'mock' })
        .mockResolvedValueOnce({ judgeType: 'mock' })
        .mockResolvedValueOnce({ enableTraces: false })
        .mockResolvedValueOnce({ save: false });

      await runConfigureMode({ port: 4001, noBrowser: false });

      expect(openModule.default).toHaveBeenCalledWith('http://localhost:4001');
    });

    it('should handle errors gracefully', async () => {
      inquirerMock.prompt.mockRejectedValueOnce(new Error('User cancelled'));

      await expect(runConfigureMode({ port: 4001, noBrowser: true }))
        .rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
