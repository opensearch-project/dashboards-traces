/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenSearch Client Service
 * Provides a singleton client for OpenSearch storage operations using the official SDK.
 *
 * Storage is optional - when not configured, APIs return sample data only.
 */

import { Client } from '@opensearch-project/opensearch';

let client: Client | null = null;
let clientInitialized = false;

export interface StorageConfig {
  endpoint: string;
  username?: string;
  password?: string;
}

/**
 * Check if storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!process.env.OPENSEARCH_STORAGE_ENDPOINT;
}

/**
 * Get or create the OpenSearch client singleton.
 * Returns null if storage is not configured.
 */
export function getOpenSearchClient(): Client | null {
  if (!clientInitialized) {
    clientInitialized = true;

    const endpoint = process.env.OPENSEARCH_STORAGE_ENDPOINT;
    if (!endpoint) {
      // Storage not configured - sample data only mode
      return null;
    }

    const username = process.env.OPENSEARCH_STORAGE_USERNAME;
    const password = process.env.OPENSEARCH_STORAGE_PASSWORD;

    const config: any = {
      node: endpoint,
      ssl: { rejectUnauthorized: false },
    };

    // Add auth only if credentials provided
    if (username && password) {
      config.auth = { username, password };
    }

    client = new Client(config);
  }
  return client;
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
