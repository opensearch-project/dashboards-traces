/**
 * Test Cases Routes - Versioned CRUD operations
 */

import { Router, Request, Response } from 'express';
import { getOpenSearchClient, INDEXES } from '../../services/opensearchClient';
import { getAllTestCases, getTestCaseById } from '../../services/storage';

const router = Router();
const INDEX = INDEXES.testCases;

function generateId(): string {
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// GET /api/storage/test-cases - List all (latest versions)
router.get('/api/storage/test-cases', async (_req: Request, res: Response) => {
  try {
    const testCases = await getAllTestCases();
    res.json({ testCases, total: testCases.length });
  } catch (error: any) {
    console.error('[StorageAPI] List test cases failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/test-cases/:id - Get latest version
router.get('/api/storage/test-cases/:id', async (req: Request, res: Response) => {
  try {
    const testCase = await getTestCaseById(req.params.id);
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }
    res.json(testCase);
  } catch (error: any) {
    console.error('[StorageAPI] Get test case failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/test-cases/:id/versions - Get all versions
router.get('/api/storage/test-cases/:id/versions', async (req: Request, res: Response) => {
  try {
    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size: 1000,
        sort: [{ version: { order: 'desc' } }],
        query: { term: { id: req.params.id } },
      },
    });

    const versions = result.body.hits?.hits?.map((hit: any) => hit._source) || [];
    res.json({ versions, total: versions.length });
  } catch (error: any) {
    console.error('[StorageAPI] Get test case versions failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/storage/test-cases/:id/versions/:version - Get specific version
router.get('/api/storage/test-cases/:id/versions/:version', async (req: Request, res: Response) => {
  try {
    const { id, version } = req.params;
    const client = getOpenSearchClient();
    const result = await client.search({
      index: INDEX,
      body: {
        size: 1,
        query: {
          bool: {
            must: [{ term: { id } }, { term: { version: parseInt(version) } }],
          },
        },
      },
    });

    const testCase = result.body.hits?.hits?.[0]?._source;
    if (!testCase) {
      return res.status(404).json({ error: 'Test case version not found' });
    }
    res.json(testCase);
  } catch (error: any) {
    console.error('[StorageAPI] Get test case version failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/test-cases - Create new (version 1)
router.post('/api/storage/test-cases', async (req: Request, res: Response) => {
  try {
    const client = getOpenSearchClient();
    const testCase = { ...req.body };

    if (!testCase.id) testCase.id = generateId();
    testCase.version = 1;
    testCase.createdAt = new Date().toISOString();
    testCase.updatedAt = testCase.createdAt;

    const docId = `${testCase.id}-v${testCase.version}`;
    await client.index({ index: INDEX, id: docId, body: testCase, refresh: true });

    console.log(`[StorageAPI] Created test case: ${testCase.id} v${testCase.version}`);
    res.status(201).json(testCase);
  } catch (error: any) {
    console.error('[StorageAPI] Create test case failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/storage/test-cases/:id - Create new version
router.put('/api/storage/test-cases/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getOpenSearchClient();

    // Get current latest version
    const searchResult = await client.search({
      index: INDEX,
      body: {
        size: 1,
        sort: [{ version: { order: 'desc' } }],
        query: { term: { id } },
      },
    });
    const currentVersion = searchResult.body.hits?.hits?.[0]?._source?.version || 0;

    // Create new version
    const newTestCase = {
      ...req.body,
      id,
      version: currentVersion + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const docId = `${id}-v${newTestCase.version}`;
    await client.index({ index: INDEX, id: docId, body: newTestCase, refresh: true });

    console.log(`[StorageAPI] Updated test case: ${id} → v${newTestCase.version}`);
    res.json(newTestCase);
  } catch (error: any) {
    console.error('[StorageAPI] Update test case failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/storage/test-cases/:id - Delete all versions
router.delete('/api/storage/test-cases/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getOpenSearchClient();

    const result = await client.deleteByQuery({
      index: INDEX,
      body: { query: { term: { id } } },
      refresh: true,
    });

    const deleted = (result.body as any).deleted || 0;
    console.log(`[StorageAPI] Deleted test case: ${id} (${deleted} versions)`);
    res.json({ deleted });
  } catch (error: any) {
    console.error('[StorageAPI] Delete test case failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/storage/test-cases/bulk - Bulk create
router.post('/api/storage/test-cases/bulk', async (req: Request, res: Response) => {
  try {
    const { testCases } = req.body;
    if (!Array.isArray(testCases)) {
      return res.status(400).json({ error: 'testCases must be an array' });
    }

    const client = getOpenSearchClient();
    const now = new Date().toISOString();
    const operations: any[] = [];

    for (const tc of testCases) {
      if (!tc.id) tc.id = generateId();
      tc.version = tc.version || 1;
      tc.createdAt = tc.createdAt || now;
      tc.updatedAt = tc.updatedAt || now;

      const docId = `${tc.id}-v${tc.version}`;
      operations.push({ index: { _index: INDEX, _id: docId } });
      operations.push(tc);
    }

    const result = await client.bulk({ body: operations, refresh: true });

    console.log(`[StorageAPI] Bulk created ${testCases.length} test cases`);
    res.json({ created: testCases.length, errors: result.body.errors });
  } catch (error: any) {
    console.error('[StorageAPI] Bulk create test cases failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
