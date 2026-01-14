/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export { openSearchClient } from './client';
export type { OpenSearchLog, LogQueryParams } from '@/types';

import { openSearchClient } from './client';
import { OpenSearchLog, LogQueryParams } from '@/types';

/**
 * Convenience function to fetch logs with default parameters
 */
export async function fetchLogs(params?: Partial<LogQueryParams>): Promise<OpenSearchLog[]> {
  return openSearchClient.fetchLogs(params);
}

/**
 * Fetch logs for a specific evaluation run
 */
export async function fetchLogsForRun(runId: string, params?: Partial<LogQueryParams>): Promise<OpenSearchLog[]> {
  return openSearchClient.fetchLogsForRun(runId, params);
}

/**
 * Test OpenSearch connection
 */
export async function testOpenSearchConnection(): Promise<boolean> {
  return openSearchClient.testConnection();
}
