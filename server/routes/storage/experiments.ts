/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Experiments Routes - Immutable experiments, only runs can be updated
 *
 * Sample data (demo-*) is always included in responses.
 * Real data from OpenSearch is merged when configured.
 */

import { Router, Request, Response } from 'express';
import { getOpenSearchClient, isStorageConfigured, INDEXES } from '../../services/opensearchClient.js';
import { SAMPLE_EXPERIMENTS, isSampleExperimentId } from '../../../cli/demo/sampleExperiments.js';
import { SAMPLE_TEST_CASES } from '../../../cli/demo/sampleTestCases.js';
import { Experiment, ExperimentRun, ExperimentProgress, RunConfigInput, TestCase } from '../../../types/index.js';
import {
  executeRun,
  createCancellationToken,
  CancellationToken,
} from '../../../services/experimentRunner.js';

const router = Router();
const INDEX = INDEXES.experiments;

// Registry of active cancellation tokens for in-progress runs
const activeRuns = new Map<string, CancellationToken>();

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Check if an ID belongs to sample data (read-only)
 */
function isSampleId(id: string): boolean {
  return id.startsWith('demo-');
}

/**
 * Validate run configuration input
 * Returns error message if invalid, null if valid
 */
function validateRunConfig(config: any): string | null {
  if (!config || typeof config !== 'object') {
    return 'Request body must be a valid run configuration object';
  }
  if (!config.name || typeof config.name !== 'string' || !config.name.trim()) {
    return 'name is required and must be a non-empty string';
  }
  if (!config.agentKey || typeof config.agentKey !== 'string') {
    return 'agentKey is required and must be a string';
  }
  if (!config.modelId || typeof config.modelId !== 'string') {
    return 'modelId is required and must be a string';
  }
  return null;
}

/**
 * Get all test cases (sample + real) for lookups
 */
async function getAllTestCases(): Promise<TestCase[]> {
  const sampleTestCases = SAMPLE_TEST_CASES.map(s => ({
    id: s.id,
    name: s.name,
  })) as TestCase[];

  if (!isStorageConfigured()) {
    return sampleTestCases;
  }

  try {
    const client = getOpenSearchClient()!;
    const result = await client.search({
      index: INDEXES.testCases,
      body: {
        size: 10000,
        _source: ['id', 'name'],
        query: { match_all: {} },
      },
    });
    const realTestCases = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    return [...sampleTestCases, ...realTestCases];
  } catch {
    return sampleTestCases;
  }
}

// GET /api/storage/experiments - List all
router.get('/api/storage/experiments', async (_req: Request, res: Response) => {
  try {
    let realData: Experiment[] = [];

    // Fetch from OpenSearch if configured
    if (isStorageConfigured()) {
      try {
        const client = getOpenSearchClient()!;
        const result = await client.search({
          index: INDEX,
          body: {
            size: 1000,
            sort: [{ createdAt: { order: 'desc' } }],
            query: { match_all: {} },
          },
        });
        realData = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
      } catch (e: any) {
        console.warn('[StorageAPI] OpenSearch unavailable, returning sample data only:', e.message);
      }
    }

    // Sort real data by createdAt descending (newest first)
    // OpenSearch query already sorts, but ensure consistency
    const sortedRealData = realData.sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // Sort sample data by createdAt descending
    const sortedSampleData = [...SAMPLE_EXPERIMENTS].sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // User data first, then sample data
    const allData = [...sortedRealData, ...sortedSampleData];
    res.json({ experiments: allData, total: allData.length });
  } catch (error: any) {
    console.error('[StorageAPI] List experiments failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/experiments/:id - Get by ID
router.get('/api/storage/experiments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check sample data first
    if (isSampleId(id)) {
      const sample = SAMPLE_EXPERIMENTS.find(exp => exp.id === id);
      if (sample) {
        return res.json(sample);
      }
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Fetch from OpenSearch
    if (!isStorageConfigured()) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const client = getOpenSearchClient()!;
    const result = await client.get({ index: INDEX, id });

    if (!result.body.found) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    res.json(result.body._source);
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    console.error('[StorageAPI] Get experiment failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/experiments - Create
router.post('/api/storage/experiments', async (req: Request, res: Response) => {
  try {
    const experiment = { ...req.body };

    // Reject creating with demo- prefix
    if (experiment.id && isSampleId(experiment.id)) {
      return res.status(400).json({ error: 'Cannot create experiment with demo- prefix (reserved for sample data)' });
    }

    // Require OpenSearch for writes
    if (!isStorageConfigured()) {
      return res.status(400).json({ error: 'OpenSearch not configured. Cannot create experiments in sample-only mode.' });
    }

    const client = getOpenSearchClient()!;

    if (!experiment.id) experiment.id = generateId('exp');
    experiment.createdAt = new Date().toISOString();
    experiment.runs = (experiment.runs || []).map((run: any) => ({
      ...run,
      id: run.id || generateId('run'),
      createdAt: run.createdAt || experiment.createdAt,
    }));

    await client.index({ index: INDEX, id: experiment.id, body: experiment, refresh: true });

    console.log(`[StorageAPI] Created experiment: ${experiment.id}`);
    res.status(201).json(experiment);
  } catch (error: any) {
    console.error('[StorageAPI] Create experiment failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/storage/experiments/:id - Update runs only
router.put('/api/storage/experiments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { runs } = req.body;

    // Reject modifying sample data
    if (isSampleId(id)) {
      return res.status(400).json({ error: 'Cannot modify sample data. Sample experiments are read-only.' });
    }

    if (!runs) {
      return res.status(400).json({ error: 'Only runs can be updated. Provide { runs: [...] }' });
    }

    // Require OpenSearch for writes
    if (!isStorageConfigured()) {
      return res.status(400).json({ error: 'OpenSearch not configured. Cannot update experiments in sample-only mode.' });
    }

    const client = getOpenSearchClient()!;

    // Get existing experiment
    const getResult = await client.get({ index: INDEX, id });
    if (!getResult.body.found) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const existing = getResult.body._source as any;
    const updated = {
      ...existing,
      runs: runs.map((run: any) => ({
        ...run,
        id: run.id || generateId('run'),
        createdAt: run.createdAt || new Date().toISOString(),
      })),
    };

    await client.index({ index: INDEX, id, body: updated, refresh: true });

    console.log(`[StorageAPI] Attached runs to experiment: ${id} (${updated.runs.length} runs)`);
    res.json(updated);
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    console.error('[StorageAPI] Attach runs to experiment failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/storage/experiments/:id - Delete
router.delete('/api/storage/experiments/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Reject deleting sample data
    if (isSampleId(id)) {
      return res.status(400).json({ error: 'Cannot delete sample data. Sample experiments are read-only.' });
    }

    // Require OpenSearch for writes
    if (!isStorageConfigured()) {
      return res.status(400).json({ error: 'OpenSearch not configured. Cannot delete experiments in sample-only mode.' });
    }

    const client = getOpenSearchClient()!;
    await client.delete({ index: INDEX, id, refresh: true });

    console.log(`[StorageAPI] Deleted experiment: ${id}`);
    res.json({ deleted: true });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Experiment not found' });
    }
    console.error('[StorageAPI] Delete experiment failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/experiments/bulk - Bulk create
router.post('/api/storage/experiments/bulk', async (req: Request, res: Response) => {
  try {
    const { experiments } = req.body;
    if (!Array.isArray(experiments)) {
      return res.status(400).json({ error: 'experiments must be an array' });
    }

    // Check for demo- prefixes
    const hasDemoIds = experiments.some(exp => exp.id && isSampleId(exp.id));
    if (hasDemoIds) {
      return res.status(400).json({ error: 'Cannot create experiments with demo- prefix (reserved for sample data)' });
    }

    // Require OpenSearch for writes
    if (!isStorageConfigured()) {
      return res.status(400).json({ error: 'OpenSearch not configured. Cannot create experiments in sample-only mode.' });
    }

    const client = getOpenSearchClient()!;
    const now = new Date().toISOString();
    const operations: any[] = [];

    for (const exp of experiments) {
      if (!exp.id) exp.id = generateId('exp');
      exp.createdAt = exp.createdAt || now;
      exp.runs = exp.runs || [];

      operations.push({ index: { _index: INDEX, _id: exp.id } });
      operations.push(exp);
    }

    const result = await client.bulk({ body: operations, refresh: true });

    console.log(`[StorageAPI] Bulk created ${experiments.length} experiments`);
    res.json({ created: experiments.length, errors: result.body.errors });
  } catch (error: any) {
    console.error('[StorageAPI] Bulk create experiments failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/experiments/:id/execute - Execute experiment and stream progress via SSE
router.post('/api/storage/experiments/:id/execute', async (req: Request, res: Response) => {
  const { id } = req.params;
  const runConfig: RunConfigInput = req.body;

  // Reject executing sample experiments (they're pre-completed)
  if (isSampleId(id)) {
    return res.status(400).json({
      error: 'Cannot execute sample experiments. Sample data is read-only with pre-completed runs.',
    });
  }

  // Validate run configuration
  const validationError = validateRunConfig(runConfig);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  // Require OpenSearch for execution
  if (!isStorageConfigured()) {
    return res.status(400).json({ error: 'OpenSearch not configured. Cannot execute experiments in sample-only mode.' });
  }

  try {
    const client = getOpenSearchClient()!;

    // Get experiment
    const getResult = await client.get({ index: INDEX, id });
    if (!getResult.body.found) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    const experiment = getResult.body._source as Experiment;

    // Fetch test cases for progress display
    const allTestCases = await getAllTestCases();
    const testCaseMap = new Map(allTestCases.map((tc: any) => [tc.id, tc]));

    // Create new run with 'running' status
    const run: ExperimentRun = {
      ...runConfig,
      id: generateId('run'),
      createdAt: new Date().toISOString(),
      status: 'running',
      results: {},
    };

    // Initialize pending status for all test cases
    experiment.testCaseIds.forEach(testCaseId => {
      run.results[testCaseId] = { reportId: '', status: 'pending' };
    });

    // Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Save run to experiment immediately so it persists across page refreshes
    const initialRuns = [...(experiment.runs || []), run];
    await client.update({
      index: INDEX,
      id,
      body: { doc: { runs: initialRuns } },
      refresh: true,
    });

    // Build test case list for progress display
    const testCasesForProgress = experiment.testCaseIds.map(tcId => {
      const tc = testCaseMap.get(tcId);
      return { id: tcId, name: tc?.name || tcId, status: 'pending' as const };
    });

    // Send initial event with run ID and test cases
    res.write(`data: ${JSON.stringify({
      type: 'started',
      runId: run.id,
      testCases: testCasesForProgress,
    })}\n\n`);

    // Create cancellation token
    const cancellationToken = createCancellationToken();
    activeRuns.set(run.id, cancellationToken);

    // Handle client disconnect - execution continues in background
    req.on('close', () => {});

    try {
      // Execute the run
      const completedRun = await executeRun(
        experiment,
        run,
        (progress: ExperimentProgress) => {
          // Stream progress to client
          res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
        },
        { cancellationToken }
      );

      // Determine final status - check if cancelled
      const wasCancelled = cancellationToken.isCancelled;

      // Mark remaining pending results as failed if cancelled
      if (wasCancelled) {
        Object.entries(completedRun.results).forEach(([testCaseId, result]) => {
          if (result.status === 'pending') {
            completedRun.results[testCaseId] = { ...result, status: 'failed' };
          }
        });
      }

      const finalRun = {
        ...completedRun,
        status: wasCancelled ? 'cancelled' as const : 'completed' as const,
      };

      // Update experiment with final run results
      await client.update({
        index: INDEX,
        id,
        body: {
          script: {
            source: `
              for (int i = 0; i < ctx._source.runs.size(); i++) {
                if (ctx._source.runs[i].id == params.runId) {
                  ctx._source.runs[i] = params.finalRun;
                  break;
                }
              }
            `,
            params: { runId: run.id, finalRun },
          },
        },
        refresh: true,
      });

      // Send completion event with final status
      const eventType = wasCancelled ? 'cancelled' : 'completed';
      res.write(`data: ${JSON.stringify({ type: eventType, run: finalRun })}\n\n`);
    } catch (error: any) {
      console.error(`[StorageAPI] Experiment run failed: ${run.id}`, error.message);

      // Update experiment to mark run as failed
      try {
        const failedRun = { ...run, status: 'failed', error: error.message };
        await client.update({
          index: INDEX,
          id,
          body: {
            script: {
              source: `
                for (int i = 0; i < ctx._source.runs.size(); i++) {
                  if (ctx._source.runs[i].id == params.runId) {
                    ctx._source.runs[i] = params.failedRun;
                    break;
                  }
                }
              `,
              params: { runId: run.id, failedRun },
            },
          },
          refresh: true,
        });
      } catch (updateError: any) {
        console.error(`[StorageAPI] Failed to update experiment with failed run: ${updateError.message}`);
      }

      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message, runId: run.id })}\n\n`);
    } finally {
      // Cleanup
      activeRuns.delete(run.id);
      res.end();
    }
  } catch (error: any) {
    // Handle 404 from OpenSearch client.get()
    if (error.meta?.statusCode === 404) {
      if (!res.headersSent) {
        return res.status(404).json({ error: 'Experiment not found' });
      }
      return;
    }
    console.error('[StorageAPI] Execute experiment failed:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

// POST /api/storage/experiments/:id/cancel - Cancel an in-progress run
router.post('/api/storage/experiments/:id/cancel', async (req: Request, res: Response) => {
  const { runId } = req.body;

  if (!runId) {
    return res.status(400).json({ error: 'runId is required' });
  }

  const cancellationToken = activeRuns.get(runId);
  if (!cancellationToken) {
    return res.status(404).json({ error: 'Run not found or already completed' });
  }

  cancellationToken.cancel();
  res.json({ cancelled: true, runId });
});

export default router;
