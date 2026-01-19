/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { runDemoMode } from '@/cli/commands/demo';

// Mock external dependencies
jest.mock('chalk', () => {
  const chalk = {
    cyan: jest.fn((s: string) => s),
    gray: jest.fn((s: string) => s),
    green: jest.fn((s: string) => s),
    bold: jest.fn((s: string) => s),
    red: jest.fn((s: string) => s),
  };
  // Support chalk.cyan.bold(), chalk.green.bold() patterns
  (chalk.cyan as any).bold = jest.fn((s: string) => s);
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

// Get mocked startServer
import { startServer } from '@/cli/utils/startServer';
const mockedStartServer = startServer as jest.MockedFunction<typeof startServer>;

describe('Demo Command', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.env = { ...originalEnv };
  });

  describe('runDemoMode', () => {
    it('should start server in demo mode with default options', async () => {
      await runDemoMode({ port: 4001, noBrowser: false });

      expect(mockedStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'demo',
          port: 4001,
          noBrowser: false,
          agent: { type: 'mock' },
          judge: { type: 'mock' },
        })
      );
    });

    it('should not open browser when noBrowser is true', async () => {
      const openModule = require('open');

      await runDemoMode({ port: 4001, noBrowser: true });

      expect(mockedStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          noBrowser: true,
        })
      );
      // open() is called after startServer resolves, but only if noBrowser is false
      expect(openModule.default).not.toHaveBeenCalled();
    });

    it('should open browser when noBrowser is false', async () => {
      const openModule = require('open');

      await runDemoMode({ port: 5000, noBrowser: false });

      expect(openModule.default).toHaveBeenCalledWith('http://localhost:5000');
    });

    it('should use custom port', async () => {
      await runDemoMode({ port: 8080, noBrowser: true });

      expect(mockedStartServer).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 8080,
        })
      );
    });

    it('should display configuration information', async () => {
      await runDemoMode({ port: 4001, noBrowser: true });

      // Check that console.log was called with config info
      expect(consoleLogSpy).toHaveBeenCalled();
      const logCalls = consoleLogSpy.mock.calls.flat().join(' ');
      expect(logCalls).toContain('Configuration');
      expect(logCalls).toContain('Storage');
      expect(logCalls).toContain('Agent');
      expect(logCalls).toContain('Judge');
    });

    it('should handle server startup error', async () => {
      mockedStartServer.mockRejectedValueOnce(new Error('Server failed'));

      await expect(runDemoMode({ port: 4001, noBrowser: true }))
        .rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should create demo config with mock agent and judge', async () => {
      await runDemoMode({ port: 4001, noBrowser: true });

      const configArg = mockedStartServer.mock.calls[0][0];
      expect(configArg.agent).toEqual({ type: 'mock' });
      expect(configArg.judge).toEqual({ type: 'mock' });
      // Storage not configured in demo mode
      expect(configArg.storage).toBeUndefined();
    });
  });
});
