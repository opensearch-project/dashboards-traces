/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Logs Service - Fetch agent execution logs from OpenSearch
 */

// ============================================================================
// Types
// ============================================================================

export interface LogsQueryOptions {
  runId?: string;
  query?: string;
  startTime?: number;
  endTime?: number;
  size?: number;
}

export interface LogEntry {
  timestamp: string;
  index: string;
  message: string;
  level: string;
  source: string;
  [key: string]: any; // Additional source fields
}

export interface LogsResponse {
  hits: {
    hits: any[];
    total: any;
  };
  logs: LogEntry[];
  total: number;
}

export interface OpenSearchLogsConfig {
  endpoint: string;
  username?: string;
  password?: string;
  indexPattern?: string;
}

export interface LegacyLogsQueryOptions {
  endpoint: string;
  indexPattern: string;
  query: any;
  auth?: string;
}

// ============================================================================
// Main Logs Query Functions
// ============================================================================

/**
 * Fetch agent execution logs from OpenSearch
 * Uses server-side credentials to avoid CORS issues
 */
export async function fetchLogs(
  options: LogsQueryOptions,
  config: OpenSearchLogsConfig
): Promise<LogsResponse> {
  const { runId, query, startTime, endTime, size = 100 } = options;
  const { endpoint, username, password, indexPattern = 'ml-commons-logs-*' } = config;

  if (!endpoint) {
    throw new Error('OpenSearch Logs not configured. Please set OPENSEARCH_LOGS_ENDPOINT');
  }

  console.log('[LogsService] Fetching logs:', { runId, query, size });

  // Build OpenSearch query
  const searchBody: any = {
    size,
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: {
      bool: {
        must: [],
      },
    },
  };

  // Add time range filter only if not searching by runId
  // When searching by runId, we want to find logs regardless of age
  if (!runId) {
    const now = Date.now();
    const effectiveEndTime = endTime || now;
    const effectiveStartTime = startTime || (now - 60 * 60 * 1000);
    searchBody.query.bool.must.push({
      range: {
        '@timestamp': {
          gte: effectiveStartTime,
          lte: effectiveEndTime,
          format: 'epoch_millis',
        },
      },
    });
  }

  // Add runId or custom query filter
  // Search in message field since run_id is embedded in log message text as [run_id=xxx]
  if (runId) {
    searchBody.query.bool.must.push({
      match: { message: runId }
    });
  } else if (query) {
    searchBody.query.bool.must.push({
      match: { message: query }
    });
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (username && password) {
    headers['Authorization'] = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }

  const url = `${endpoint}/${indexPattern}/_search`;
  console.log('[LogsService] Request URL:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(searchBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LogsService] Query failed:', response.status, errorText);
    throw new Error(`OpenSearch query failed: ${errorText}`);
  }

  const data = await response.json();
  const hitCount = data.hits?.total?.value || data.hits?.hits?.length || 0;
  console.log('[LogsService] Found', hitCount, 'logs');

  // Transform hits to log format
  const logs: LogEntry[] = (data.hits?.hits || []).map((hit: any) => {
    const source = hit._source;
    return {
      timestamp: source['@timestamp'] || source.timestamp || new Date().toISOString(),
      index: hit._index,
      message: source.message || JSON.stringify(source),
      level: source.level || source.severity || 'info',
      source: source.source || source.logger || 'unknown',
      ...source,
    };
  });

  return {
    hits: { hits: data.hits?.hits || [], total: data.hits?.total },
    logs,
    total: hitCount
  };
}

// ============================================================================
// Legacy Proxy Function (Deprecated)
// ============================================================================

/**
 * Proxy OpenSearch log queries to avoid CORS
 * @deprecated Use fetchLogs instead
 */
export async function fetchLogsLegacy(options: LegacyLogsQueryOptions): Promise<any> {
  const { endpoint, indexPattern, query, auth } = options;

  if (!endpoint || !indexPattern || !query) {
    throw new Error('Missing required fields: endpoint, indexPattern, and query');
  }

  console.log('[LogsService] Legacy proxy - Fetching logs from:', endpoint);
  console.log('[LogsService] Index pattern:', indexPattern);
  console.log('[LogsService] Query:', JSON.stringify(query).substring(0, 200));

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add auth if provided
  if (auth) {
    headers['Authorization'] = auth;
  }

  const url = `${endpoint}/${indexPattern}/_search`;
  console.log('[LogsService] Request URL:', url);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LogsService] Legacy query failed:', response.status, errorText);
    throw new Error(`OpenSearch query failed: ${errorText}`);
  }

  const data = await response.json();
  console.log('[LogsService] Response hits:', data.hits?.total?.value || data.hits?.hits?.length || 0);

  return data;
}
