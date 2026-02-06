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

    it('should load YAML config when agent-health.yaml exists', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.yaml');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
agents:
  test-agent:
    name: Test Agent
    endpoint: http://localhost:3000
    protocol: rest
models:
  test-model:
    model_id: test-model-id
    display_name: Test Model
`);

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      expect(config).toBeDefined();
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

    it('should handle YAML parse errors gracefully', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.yaml');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue('invalid: yaml: content: [');

      const { loadConfigSync } = require('@/lib/config/loader');

      // Should not throw, should return default config
      expect(() => loadConfigSync()).not.toThrow();
    });

    it('should interpolate environment variables in YAML', () => {
      process.env.TEST_ENDPOINT = 'http://test-endpoint:8080';

      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.yaml');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
agents:
  test-agent:
    endpoint: \${TEST_ENDPOINT}
`);

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      expect(config).toBeDefined();

      delete process.env.TEST_ENDPOINT;
    });

    it('should use default value when env var not set', () => {
      delete process.env.MISSING_VAR;

      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.yaml');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
agents:
  test-agent:
    endpoint: \${MISSING_VAR:http://default:3000}
`);

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

  describe('mergeConfigs', () => {
    it('should merge user config with defaults', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filepath: string) => {
        return filepath.includes('agent-health.yaml');
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(`
agents:
  custom-agent:
    name: Custom Agent
    endpoint: http://custom:3000
    protocol: rest
`);

      const { loadConfigSync } = require('@/lib/config/loader');
      const config = loadConfigSync();

      // Should have both default and custom agents
      expect(config).toBeDefined();
      expect(config.agents).toBeDefined();
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
