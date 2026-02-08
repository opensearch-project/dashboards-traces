/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs and path modules
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
}));

describe('Config Loader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('loadConfigSync', () => {
    it('should return default config when no config file exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      expect(config).toBeDefined();
      expect(config.agents).toBeDefined();
      expect(config.models).toBeDefined();
    });

    it('should load TypeScript config when agent-health.config.ts exists', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.config.ts');
      });

      // Mock require for the TS config
      jest.doMock('/test/agent-health.config.ts', () => ({
        default: {
          agents: { 'ts-agent': { name: 'TS Agent' } },
          models: { 'ts-model': { model_id: 'ts-model-id' } },
        },
      }), { virtual: true });

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      expect(config).toBeDefined();
    });
  });

  describe('findConfigFile', () => {
    it('should return default config when files do not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      // Should return a valid config object with defaults
      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });
  });
});

describe('defineConfig', () => {
  it('should return the config object unchanged', () => {
    const { defineConfig } = require('@/lib/config/defineConfig');

    const testConfig = {
      agents: { 'test': { name: 'Test' } },
      models: { 'model': { model_id: 'id' } },
    };

    const result = defineConfig(testConfig);

    expect(result).toBe(testConfig);
  });
});
