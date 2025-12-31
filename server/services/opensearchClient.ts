/**
 * OpenSearch Client Service
 * Provides a singleton client for OpenSearch storage operations using the official SDK.
 */

import { Client } from '@opensearch-project/opensearch';

let client: Client | null = null;

export interface StorageConfig {
  endpoint: string;
  username: string;
  password: string;
}

/**
 * Get or create the OpenSearch client singleton
 */
export function getOpenSearchClient(): Client {
  if (!client) {
    const endpoint = process.env.OPENSEARCH_STORAGE_ENDPOINT;
    const username = process.env.OPENSEARCH_STORAGE_USERNAME;
    const password = process.env.OPENSEARCH_STORAGE_PASSWORD;

    if (!endpoint || !username || !password) {
      throw new Error('OpenSearch storage not configured. Set OPENSEARCH_STORAGE_* environment variables.');
    }

    client = new Client({
      node: endpoint,
      auth: { username, password },
      ssl: { rejectUnauthorized: false },
    });
  }
  return client;
}

/**
 * Check if storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.OPENSEARCH_STORAGE_ENDPOINT &&
    process.env.OPENSEARCH_STORAGE_USERNAME &&
    process.env.OPENSEARCH_STORAGE_PASSWORD
  );
}

/**
 * Index names for storage
 */
export const INDEXES = {
  testCases: 'evals_test_cases',
  experiments: 'evals_experiments',
  runs: 'evals_runs',
  analytics: 'evals_analytics',
} as const;

export type IndexName = (typeof INDEXES)[keyof typeof INDEXES];
