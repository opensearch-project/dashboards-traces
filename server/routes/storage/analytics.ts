/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Analytics Routes - Read-only queries and aggregations
 */

import { Router, Request, Response } from 'express';
import { getOpenSearchClient, INDEXES } from '../../services/opensearchClient';

const router = Router();
const INDEX = INDEXES.analytics;

// GET /api/storage/analytics - Query with filters
router.get('/api/storage/analytics', async (req: Request, res: Response) => {
  try {
    const { experimentId, testCaseId, agentId, modelId, passFailStatus, size = '1000', from = '0' } = req.query;

    const must: any[] = [];
    if (experimentId) must.push({ term: { experimentId } });
    if (testCaseId) must.push({ term: { testCaseId } });
    if (agentId) must.push({ term: { agentId } });
    if (modelId) must.push({ term: { modelId } });
    if (passFailStatus) must.push({ term: { passFailStatus } });

    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        from: parseInt(from as string),
        sort: [{ createdAt: { order: 'desc' } }],
        query: must.length > 0 ? { bool: { must } } : { match_all: {} },
      },
    });

    const records = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? records.length;
    res.json({ records, total });
  } catch (error: any) {
    console.error('[StorageAPI] Analytics query failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/analytics/aggregations - Aggregated metrics
router.get('/api/storage/analytics/aggregations', async (req: Request, res: Response) => {
  try {
    const { experimentId, groupBy = 'agentId' } = req.query;

    const must: any[] = [];
    if (experimentId) must.push({ term: { experimentId } });

    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size: 0,
        query: must.length > 0 ? { bool: { must } } : { match_all: {} },
        aggs: {
          groups: {
            terms: { field: groupBy as string, size: 100 },
            aggs: {
              avg_accuracy: { avg: { field: 'metric_accuracy' } },
              avg_faithfulness: { avg: { field: 'metric_faithfulness' } },
              avg_latency: { avg: { field: 'metric_latency_score' } },
              avg_trajectory: { avg: { field: 'metric_trajectory_alignment_score' } },
              pass_count: { filter: { term: { passFailStatus: 'passed' } } },
              fail_count: { filter: { term: { passFailStatus: 'failed' } } },
              total_runs: { value_count: { field: 'runId' } },
            },
          },
        },
      },
    });

    const buckets = (result.body.aggregations?.groups as any)?.buckets || [];
    const aggregations = buckets.map((bucket: any) => ({
      key: bucket.key,
      metrics: {
        avgAccuracy: bucket.avg_accuracy?.value,
        avgFaithfulness: bucket.avg_faithfulness?.value,
        avgLatency: bucket.avg_latency?.value,
        avgTrajectory: bucket.avg_trajectory?.value,
      },
      passCount: bucket.pass_count?.doc_count || 0,
      failCount: bucket.fail_count?.doc_count || 0,
      totalRuns: bucket.total_runs?.value || 0,
    }));

    res.json({ aggregations, groupBy });
  } catch (error: any) {
    console.error('[StorageAPI] Analytics aggregations failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/analytics/search - Complex search with custom aggs
router.post('/api/storage/analytics/search', async (req: Request, res: Response) => {
  try {
    const { filters, aggs, size = 1000, from = 0 } = req.body;

    const body: any = {
      size, from,
      sort: [{ createdAt: { order: 'desc' } }],
    };

    if (filters && Object.keys(filters).length > 0) {
      const must: any[] = [];
      for (const [field, value] of Object.entries(filters)) {
        if (Array.isArray(value)) {
          must.push({ terms: { [field]: value } });
        } else {
          must.push({ term: { [field]: value } });
        }
      }
      body.query = { bool: { must } };
    } else {
      body.query = { match_all: {} };
    }

    if (aggs) body.aggs = aggs;

    const client = getOpenSearchClient();
    const result = await client.search({ index: INDEX, body });

    const records = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? 0;
    res.json({ records, total, aggregations: result.body.aggregations || {} });
  } catch (error: any) {
    console.error('[StorageAPI] Analytics search failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
