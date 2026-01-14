/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Traces API Routes - Fetch and query OpenSearch traces
 *
 * Sample trace data (demo-*) is always included in responses.
 * Real data from OpenSearch logs cluster is merged when configured.
 */

import { Request, Response, Router } from 'express';
import { fetchTraces, checkTracesHealth } from '../services/tracesService.js';
import {
  getSampleSpansForRunIds,
  getSampleSpansByTraceId,
  getAllSampleTraceSpans,
  isSampleTraceId,
} from '../../cli/demo/sampleTraces.js';
import type { Span } from '../../types/index.js';

const router = Router();

/**
 * Check if OpenSearch logs cluster is configured
 */
function isLogsConfigured(): boolean {
  return !!(
    process.env.OPENSEARCH_LOGS_ENDPOINT &&
    process.env.OPENSEARCH_LOGS_USERNAME &&
    process.env.OPENSEARCH_LOGS_PASSWORD
  );
}

/**
 * POST /api/traces - Fetch traces by trace ID or run IDs
 */
router.post('/api/traces', async (req: Request, res: Response) => {
  try {
    const { traceId, runIds, startTime, endTime, size = 500, serviceName, textSearch } = req.body;

    // Validate request - allow time range queries for live tailing
    const hasTimeRange = startTime || endTime;
    const hasIdFilter = traceId || (runIds && runIds.length > 0);

    if (!hasIdFilter && !hasTimeRange) {
      return res.status(400).json({
        error: 'Either traceId, runIds, or time range is required'
      });
    }

    // Get sample traces that match the query
    let sampleSpans: Span[] = [];

    if (traceId) {
      // If querying by trace ID, check sample data first
      if (isSampleTraceId(traceId)) {
        sampleSpans = getSampleSpansByTraceId(traceId);
      }
    } else if (runIds && runIds.length > 0) {
      // Filter sample spans by run IDs (via run.id attribute)
      sampleSpans = getSampleSpansForRunIds(runIds);
    }

    let realSpans: Span[] = [];

    // Fetch from OpenSearch logs cluster if configured
    if (isLogsConfigured()) {
      try {
        const endpoint = process.env.OPENSEARCH_LOGS_ENDPOINT!;
        const username = process.env.OPENSEARCH_LOGS_USERNAME!;
        const password = process.env.OPENSEARCH_LOGS_PASSWORD!;
        const indexPattern = process.env.OPENSEARCH_LOGS_TRACES_INDEX || 'otel-v1-apm-span-*';

        const result = await fetchTraces(
          { traceId, runIds, startTime, endTime, size, serviceName, textSearch },
          { endpoint, username, password, indexPattern }
        );

        realSpans = (result.spans || []) as Span[];
      } catch (e: any) {
        console.warn('[TracesAPI] OpenSearch logs unavailable, returning sample data only:', e.message);
      }
    }

    // Merge: sample spans first, then real spans
    const allSpans = [...sampleSpans, ...realSpans];

    res.json({ spans: allSpans, total: allSpans.length });

  } catch (error: any) {
    console.error('[TracesAPI] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/traces/health - Check traces index availability
 */
router.get('/api/traces/health', async (req: Request, res: Response) => {
  try {
    // If logs not configured, return sample-only status
    if (!isLogsConfigured()) {
      return res.json({
        status: 'sample_only',
        message: 'OpenSearch logs not configured. Sample trace data available.',
        sampleTraceCount: getAllSampleTraceSpans().length,
      });
    }

    const endpoint = process.env.OPENSEARCH_LOGS_ENDPOINT!;
    const username = process.env.OPENSEARCH_LOGS_USERNAME!;
    const password = process.env.OPENSEARCH_LOGS_PASSWORD!;
    const indexPattern = process.env.OPENSEARCH_LOGS_TRACES_INDEX || 'otel-v1-apm-span-*';

    // Call traces service to check health
    const result = await checkTracesHealth({
      endpoint,
      username,
      password,
      indexPattern
    });

    res.json(result);
  } catch (error: any) {
    res.json({ status: 'error', error: error.message });
  }
});

export default router;
