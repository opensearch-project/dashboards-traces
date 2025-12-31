/**
 * Runs Routes - Test case execution results with search, annotations, and lookups
 */

import { Router, Request, Response } from 'express';
import { getOpenSearchClient, INDEXES } from '../../services/opensearchClient';
import { createRun, getRunById, updateRun } from '../../services/storage';

const router = Router();
const INDEX = INDEXES.runs;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// GET /api/storage/runs - List all (paginated)
router.get('/api/storage/runs', async (req: Request, res: Response) => {
  try {
    const { size = '100', from = '0' } = req.query;
    const client = getOpenSearchClient();

    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        from: parseInt(from as string),
        sort: [{ createdAt: { order: 'desc' } }],
        query: { match_all: {} },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;

    res.json({ runs, total, size: parseInt(size as string), from: parseInt(from as string) });
  } catch (error: any) {
    console.error('[StorageAPI] List runs failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/runs/:id - Get by ID
router.get('/api/storage/runs/:id', async (req: Request, res: Response) => {
  try {
    const run = await getRunById(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(run);
  } catch (error: any) {
    console.error('[StorageAPI] Get run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/runs - Create
router.post('/api/storage/runs', async (req: Request, res: Response) => {
  try {
    const run = await createRun(req.body);
    console.log(`[StorageAPI] Created run: ${run.id}`);
    res.status(201).json(run);
  } catch (error: any) {
    console.error('[StorageAPI] Create run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/storage/runs/:id - Partial update
router.patch('/api/storage/runs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const updated = await updateRun(id, updates);
    console.log(`[StorageAPI] Updated run: ${id}`);
    res.json(updated);
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Run not found' });
    }
    console.error('[StorageAPI] Patch run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/storage/runs/:id - Delete
router.delete('/api/storage/runs/:id', async (req: Request, res: Response) => {
  try {
    const client = getOpenSearchClient();
    await client.delete({ index: INDEX, id: req.params.id, refresh: true });

    console.log(`[StorageAPI] Deleted run: ${req.params.id}`);
    res.json({ deleted: true });
  } catch (error: any) {
    if (error.meta?.statusCode === 404) {
      return res.status(404).json({ error: 'Run not found' });
    }
    console.error('[StorageAPI] Delete run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/runs/search - Advanced search
router.post('/api/storage/runs/search', async (req: Request, res: Response) => {
  try {
    const {
      experimentId, testCaseId, experimentRunId, agentId, modelId,
      status, passFailStatus, tags, dateRange, size = 100, from = 0
    } = req.body;

    const must: any[] = [];
    if (experimentId) must.push({ term: { experimentId } });
    if (testCaseId) must.push({ term: { testCaseId } });
    if (experimentRunId) must.push({ term: { experimentRunId } });
    if (agentId) must.push({ term: { agentId } });
    if (modelId) must.push({ term: { modelId } });
    if (status) must.push({ term: { status } });
    if (passFailStatus) must.push({ term: { passFailStatus } });
    if (tags?.length) must.push({ terms: { tags } });

    if (dateRange) {
      const range: any = { createdAt: {} };
      if (dateRange.start) range.createdAt.gte = dateRange.start;
      if (dateRange.end) range.createdAt.lte = dateRange.end;
      must.push({ range });
    }

    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size, from,
        sort: [{ createdAt: { order: 'desc' } }],
        query: must.length > 0 ? { bool: { must } } : { match_all: {} },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;
    res.json({ runs, total });
  } catch (error: any) {
    console.error('[StorageAPI] Search runs failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/runs/by-test-case/:testCaseId
router.get('/api/storage/runs/by-test-case/:testCaseId', async (req: Request, res: Response) => {
  try {
    const { size = '100' } = req.query;
    const client = getOpenSearchClient();

    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        sort: [{ createdAt: { order: 'desc' } }],
        query: { term: { testCaseId: req.params.testCaseId } },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;
    res.json({ runs, total });
  } catch (error: any) {
    console.error('[StorageAPI] Get runs by test case failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/runs/by-experiment/:experimentId
router.get('/api/storage/runs/by-experiment/:experimentId', async (req: Request, res: Response) => {
  try {
    const { size = '1000' } = req.query;
    const client = getOpenSearchClient();

    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        sort: [{ createdAt: { order: 'desc' } }],
        query: { term: { experimentId: req.params.experimentId } },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;
    res.json({ runs, total });
  } catch (error: any) {
    console.error('[StorageAPI] Get runs by experiment failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/runs/by-experiment-run/:experimentId/:runId
router.get('/api/storage/runs/by-experiment-run/:experimentId/:runId', async (req: Request, res: Response) => {
  try {
    const { experimentId, runId } = req.params;
    const { size = '1000' } = req.query;
    const client = getOpenSearchClient();

    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        sort: [{ createdAt: { order: 'desc' } }],
        query: {
          bool: {
            must: [{ term: { experimentId } }, { term: { experimentRunId: runId } }],
          },
        },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;
    res.json({ runs, total });
  } catch (error: any) {
    console.error('[StorageAPI] Get runs by experiment run failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/runs/iterations/:experimentId/:testCaseId
router.get('/api/storage/runs/iterations/:experimentId/:testCaseId', async (req: Request, res: Response) => {
  try {
    const { experimentId, testCaseId } = req.params;
    const { experimentRunId, size = '100' } = req.query;

    const must: any[] = [{ term: { experimentId } }, { term: { testCaseId } }];
    if (experimentRunId) must.push({ term: { experimentRunId } });

    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size: parseInt(size as string),
        sort: [{ iteration: { order: 'asc' } }],
        query: { bool: { must } },
      },
    });

    const runs = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    const total = (result.body.hits?.total as any)?.value ?? runs.length;
    res.json({
      runs, total,
      maxIteration: runs.length > 0 ? Math.max(...runs.map((r: any) => r.iteration || 1)) : 0,
    });
  } catch (error: any) {
    console.error('[StorageAPI] Get iterations failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/runs/:id/annotations - Add annotation
router.post('/api/storage/runs/:id/annotations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const annotation = { ...req.body };

    annotation.id = annotation.id || generateId('ann');
    annotation.createdAt = new Date().toISOString();
    annotation.updatedAt = annotation.createdAt;

    const client = getOpenSearchClient();
    await client.update({
      index: INDEX, id,
      body: {
        script: {
          source: 'if (ctx._source.annotations == null) { ctx._source.annotations = []; } ctx._source.annotations.add(params.annotation)',
          params: { annotation },
        },
      },
      refresh: true,
    });

    console.log(`[StorageAPI] Added annotation to run: ${id}`);
    res.status(201).json(annotation);
  } catch (error: any) {
    console.error('[StorageAPI] Add annotation failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/storage/runs/:id/annotations/:annotationId - Update annotation
router.put('/api/storage/runs/:id/annotations/:annotationId', async (req: Request, res: Response) => {
  try {
    const { id, annotationId } = req.params;
    const updates = { ...req.body, updatedAt: new Date().toISOString() };

    const client = getOpenSearchClient();
    await client.update({
      index: INDEX, id,
      body: {
        script: {
          source: `
            for (int i = 0; i < ctx._source.annotations.size(); i++) {
              if (ctx._source.annotations[i].id == params.annotationId) {
                ctx._source.annotations[i].text = params.text;
                ctx._source.annotations[i].tags = params.tags;
                ctx._source.annotations[i].updatedAt = params.updatedAt;
                break;
              }
            }
          `,
          params: { annotationId, text: updates.text, tags: updates.tags || [], updatedAt: updates.updatedAt },
        },
      },
      refresh: true,
    });

    console.log(`[StorageAPI] Updated annotation ${annotationId} on run: ${id}`);
    res.json({ ...updates, id: annotationId });
  } catch (error: any) {
    console.error('[StorageAPI] Update annotation failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/storage/runs/:id/annotations/:annotationId - Delete annotation
router.delete('/api/storage/runs/:id/annotations/:annotationId', async (req: Request, res: Response) => {
  try {
    const { id, annotationId } = req.params;

    const client = getOpenSearchClient();
    await client.update({
      index: INDEX, id,
      body: {
        script: {
          source: 'ctx._source.annotations.removeIf(a -> a.id == params.annotationId)',
          params: { annotationId },
        },
      },
      refresh: true,
    });

    console.log(`[StorageAPI] Deleted annotation ${annotationId} from run: ${id}`);
    res.json({ deleted: true });
  } catch (error: any) {
    console.error('[StorageAPI] Delete annotation failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/runs/bulk - Bulk create
router.post('/api/storage/runs/bulk', async (req: Request, res: Response) => {
  try {
    const { runs } = req.body;
    if (!Array.isArray(runs)) {
      return res.status(400).json({ error: 'runs must be an array' });
    }

    const client = getOpenSearchClient();
    const now = new Date().toISOString();
    const operations: any[] = [];

    for (const run of runs) {
      if (!run.id) run.id = generateId('run');
      run.createdAt = run.createdAt || now;
      run.annotations = run.annotations || [];

      operations.push({ index: { _index: INDEX, _id: run.id } });
      operations.push(run);
    }

    const result = await client.bulk({ body: operations, refresh: true });

    console.log(`[StorageAPI] Bulk created ${runs.length} runs`);
    res.json({ created: runs.length, errors: result.body.errors });
  } catch (error: any) {
    console.error('[StorageAPI] Bulk create runs failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
