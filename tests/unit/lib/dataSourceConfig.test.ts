/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getConfigStatus,
  loadDataSourceConfig,
  clearDataSourceConfig,
  getStorageConfigHeaders,
  getObservabilityConfigHeaders,
  hasStorageCredentials,
  hasObservabilityCredentials,
  DEFAULT_OTEL_INDEXES,
} from '@/lib/dataSourceConfig';

// Mock fetch
global.fetch = jest.fn();

describe('dataSourceConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('DEFAULT_OTEL_INDEXES', () => {
    it('should export default OTEL indexes', () => {
      expect(DEFAULT_OTEL_INDEXES).toBeDefined();
      expect(typeof DEFAULT_OTEL_INDEXES).toBe('object');
    });
  });

  describe('getConfigStatus', () => {
    it('should return configuration status from API', async () => {
      const mockStatus = {
        hasStorageConfig: true,
        hasObservabilityConfig: false,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      const status = await getConfigStatus();

      expect(status).toEqual(mockStatus);
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error when API fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
      });

      await expect(getConfigStatus()).rejects.toThrow('Failed to get config status');
    });
  });

  describe('loadDataSourceConfig', () => {
    it('should return null (browser-only function)', () => {
      const result = loadDataSourceConfig();

      expect(result).toBeNull();
    });
  });

  describe('clearDataSourceConfig', () => {
    it('should not throw when clearing config', () => {
      expect(() => clearDataSourceConfig()).not.toThrow();
    });
  });

  describe('getStorageConfigHeaders', () => {
    it('should return storage config headers', () => {
      const headers = getStorageConfigHeaders();

      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });
  });

  describe('getObservabilityConfigHeaders', () => {
    it('should return observability config headers', () => {
      const headers = getObservabilityConfigHeaders();

      expect(headers).toBeDefined();
      expect(typeof headers).toBe('object');
    });
  });

  describe('hasStorageCredentials', () => {
    it('should return boolean for storage credentials', () => {
      const result = hasStorageCredentials();

      expect(typeof result).toBe('boolean');
    });
  });

  describe('hasObservabilityCredentials', () => {
    it('should return boolean for observability credentials', () => {
      const result = hasObservabilityCredentials();

      expect(typeof result).toBe('boolean');
    });
  });
});
