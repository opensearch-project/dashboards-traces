/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import testCasesRoutes from '@/server/routes/storage/testCases';

// Mock the opensearchClient
const mockSearch = jest.fn();
const mockIndex = jest.fn();
const mockDeleteByQuery = jest.fn();
const mockBulk = jest.fn();

jest.mock('@/server/services/opensearchClient', () => ({
  getOpenSearchClient: () => ({
    search: mockSearch,
    index: mockIndex,
    deleteByQuery: mockDeleteByQuery,
    bulk: mockBulk,
  }),
  isStorageConfigured: jest.fn().mockReturnValue(true),
  INDEXES: { testCases: 'test-cases-index' },
}));

// Mock sample test cases
jest.mock('@/cli/demo/sampleTestCases', () => ({
  SAMPLE_TEST_CASES: [
    {
      id: 'demo-test-case-1',
      name: 'Sample Test Case 1',
      description: 'A sample test case',
      labels: ['category:RCA', 'difficulty:Medium'],
      initialPrompt: 'Test prompt',
      context: [{ type: 'incident', content: { title: 'Test incident' } }],
      expectedOutcomes: ['Expected outcome 1'],
      tags: ['promoted'],
    },
  ],
}));

// Silence console output
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});

// Helper to create mock request/response
function createMocks(params: any = {}, body: any = {}) {
  const req = { params, body } as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

// Helper to get route handler
function getRouteHandler(router: any, method: string, path: string) {
  const routes = router.stack;
  const route = routes.find(
    (layer: any) =>
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()]
  );
  return route?.route.stack[0].handle;
}

describe('Test Cases Storage Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/storage/test-cases', () => {
    it('should return combined sample and real test cases', async () => {
      mockSearch.mockResolvedValue({
        body: {
          aggregations: {
            by_id: {
              buckets: [
                {
                  key: 'tc-123',
                  latest: {
                    hits: {
                      hits: [
                        {
                          _source: {
                            id: 'tc-123',
                            name: 'Real Test Case',
                            createdAt: '2024-01-01T00:00:00Z',
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      });

      const { req, res } = createMocks();
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          testCases: expect.arrayContaining([
            expect.objectContaining({ id: 'tc-123' }),
            expect.objectContaining({ id: 'demo-test-case-1' }),
          ]),
        })
      );
    });

    it('should return only sample data when OpenSearch unavailable', async () => {
      mockSearch.mockRejectedValue(new Error('Connection refused'));

      const { req, res } = createMocks();
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          testCases: expect.arrayContaining([
            expect.objectContaining({ id: 'demo-test-case-1' }),
          ]),
        })
      );
    });
  });

  describe('GET /api/storage/test-cases/:id', () => {
    it('should return sample test case for demo ID', async () => {
      const { req, res } = createMocks({ id: 'demo-test-case-1' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'demo-test-case-1',
          name: 'Sample Test Case 1',
        })
      );
    });

    it('should return 404 for non-existent sample ID', async () => {
      const { req, res } = createMocks({ id: 'demo-nonexistent' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Test case not found' });
    });

    it('should fetch from OpenSearch for non-sample ID', async () => {
      mockSearch.mockResolvedValue({
        body: {
          hits: {
            hits: [
              {
                _source: {
                  id: 'tc-123',
                  name: 'Real Test Case',
                  version: 1,
                },
              },
            ],
          },
        },
      });

      const { req, res } = createMocks({ id: 'tc-123' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(mockSearch).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tc-123' })
      );
    });

    it('should return 404 when test case not found in OpenSearch', async () => {
      mockSearch.mockResolvedValue({
        body: {
          hits: { hits: [] },
        },
      });

      const { req, res } = createMocks({ id: 'tc-nonexistent' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('GET /api/storage/test-cases/:id/versions', () => {
    it('should return single version for sample test case', async () => {
      const { req, res } = createMocks({ id: 'demo-test-case-1' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id/versions');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          versions: expect.arrayContaining([
            expect.objectContaining({ id: 'demo-test-case-1' }),
          ]),
          total: 1,
        })
      );
    });

    it('should return multiple versions from OpenSearch', async () => {
      mockSearch.mockResolvedValue({
        body: {
          hits: {
            hits: [
              { _source: { id: 'tc-123', version: 2 } },
              { _source: { id: 'tc-123', version: 1 } },
            ],
          },
        },
      });

      const { req, res } = createMocks({ id: 'tc-123' });
      const handler = getRouteHandler(testCasesRoutes, 'get', '/api/storage/test-cases/:id/versions');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          versions: expect.arrayContaining([
            expect.objectContaining({ version: 2 }),
            expect.objectContaining({ version: 1 }),
          ]),
          total: 2,
        })
      );
    });
  });

  describe('GET /api/storage/test-cases/:id/versions/:version', () => {
    it('should return version 1 for sample test case', async () => {
      const { req, res } = createMocks({ id: 'demo-test-case-1', version: '1' });
      const handler = getRouteHandler(
        testCasesRoutes,
        'get',
        '/api/storage/test-cases/:id/versions/:version'
      );

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'demo-test-case-1' })
      );
    });

    it('should return 404 for non-existent version of sample', async () => {
      const { req, res } = createMocks({ id: 'demo-test-case-1', version: '2' });
      const handler = getRouteHandler(
        testCasesRoutes,
        'get',
        '/api/storage/test-cases/:id/versions/:version'
      );

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should fetch specific version from OpenSearch', async () => {
      mockSearch.mockResolvedValue({
        body: {
          hits: {
            hits: [{ _source: { id: 'tc-123', version: 2 } }],
          },
        },
      });

      const { req, res } = createMocks({ id: 'tc-123', version: '2' });
      const handler = getRouteHandler(
        testCasesRoutes,
        'get',
        '/api/storage/test-cases/:id/versions/:version'
      );

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tc-123', version: 2 })
      );
    });
  });

  describe('POST /api/storage/test-cases', () => {
    it('should reject creating test case with demo prefix', async () => {
      const { req, res } = createMocks(
        {},
        { id: 'demo-new-test', name: 'Invalid Test' }
      );
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('demo- prefix'),
        })
      );
    });

    it('should create new test case with generated ID', async () => {
      mockIndex.mockResolvedValue({ body: { result: 'created' } });

      const { req, res } = createMocks(
        {},
        { name: 'New Test Case', initialPrompt: 'Test prompt' }
      );
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases');

      await handler(req, res);

      expect(mockIndex).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Test Case',
          version: 1,
        })
      );
    });

    it('should use provided ID', async () => {
      mockIndex.mockResolvedValue({ body: { result: 'created' } });

      const { req, res } = createMocks(
        {},
        { id: 'custom-id-123', name: 'New Test Case' }
      );
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'custom-id-123' })
      );
    });
  });

  describe('PUT /api/storage/test-cases/:id', () => {
    it('should reject modifying sample data', async () => {
      const { req, res } = createMocks(
        { id: 'demo-test-case-1' },
        { name: 'Modified' }
      );
      const handler = getRouteHandler(testCasesRoutes, 'put', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('sample data'),
        })
      );
    });

    it('should create new version when updating', async () => {
      mockSearch.mockResolvedValue({
        body: {
          hits: {
            hits: [{ _source: { id: 'tc-123', version: 1 } }],
          },
        },
      });
      mockIndex.mockResolvedValue({ body: { result: 'created' } });

      const { req, res } = createMocks(
        { id: 'tc-123' },
        { name: 'Updated Test Case' }
      );
      const handler = getRouteHandler(testCasesRoutes, 'put', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'tc-123',
          version: 2,
        })
      );
    });
  });

  describe('DELETE /api/storage/test-cases/:id', () => {
    it('should reject deleting sample data', async () => {
      const { req, res } = createMocks({ id: 'demo-test-case-1' });
      const handler = getRouteHandler(testCasesRoutes, 'delete', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('sample data'),
        })
      );
    });

    it('should delete all versions', async () => {
      mockDeleteByQuery.mockResolvedValue({
        body: { deleted: 3 },
      });

      const { req, res } = createMocks({ id: 'tc-123' });
      const handler = getRouteHandler(testCasesRoutes, 'delete', '/api/storage/test-cases/:id');

      await handler(req, res);

      expect(mockDeleteByQuery).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ deleted: 3 });
    });
  });

  describe('POST /api/storage/test-cases/bulk', () => {
    it('should reject non-array input', async () => {
      const { req, res } = createMocks({}, { testCases: 'not-an-array' });
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases/bulk');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'testCases must be an array',
      });
    });

    it('should reject test cases with demo prefix', async () => {
      const { req, res } = createMocks(
        {},
        { testCases: [{ id: 'demo-new', name: 'Invalid' }] }
      );
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases/bulk');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('demo- prefix'),
        })
      );
    });

    it('should bulk create test cases', async () => {
      mockBulk.mockResolvedValue({
        body: { errors: false },
      });

      const { req, res } = createMocks(
        {},
        {
          testCases: [
            { name: 'Test Case 1' },
            { name: 'Test Case 2' },
          ],
        }
      );
      const handler = getRouteHandler(testCasesRoutes, 'post', '/api/storage/test-cases/bulk');

      await handler(req, res);

      expect(mockBulk).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          created: 2,
          errors: false,
        })
      );
    });
  });
});
