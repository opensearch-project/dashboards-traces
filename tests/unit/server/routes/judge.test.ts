/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from 'express';
import judgeRoutes from '@/server/routes/judge';
import { evaluateTrajectory, parseBedrockError } from '@/server/services/bedrockService';
// Mock the bedrock service
jest.mock('@/server/services/bedrockService', () => ({
  evaluateTrajectory: jest.fn(),
  parseBedrockError: jest.fn(),
}));

// Mock the app module (server/app.ts from server/routes/__tests__)
const mockUseMockJudge = jest.fn().mockReturnValue(false);
jest.mock('@/server/app', () => ({
  useMockJudge: () => mockUseMockJudge(),
}));

const mockEvaluateTrajectory = evaluateTrajectory as jest.MockedFunction<typeof evaluateTrajectory>;
const mockParseBedrockError = parseBedrockError as jest.MockedFunction<typeof parseBedrockError>;

// Helper to create mock request/response
function createMocks(body: any = {}) {
  const req = {
    body,
  } as Request;
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

describe('Judge Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMockJudge.mockReturnValue(false);
  });

  describe('POST /api/judge', () => {
    it('returns 400 when trajectory is missing', async () => {
      const { req, res } = createMocks({});
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required field: trajectory',
      });
    });

    it('returns 400 when expectedOutcomes and expectedTrajectory are missing', async () => {
      const { req, res } = createMocks({
        trajectory: [{ type: 'action', content: 'test' }],
      });
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required field: expectedOutcomes or expectedTrajectory',
      });
    });

    it('uses mock judge in demo mode', async () => {
      mockUseMockJudge.mockReturnValue(true);

      const { req, res } = createMocks({
        trajectory: [{ type: 'action', toolName: 'cluster_health' }],
        expectedOutcomes: ['Identify root cause'],
      });
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      expect(mockEvaluateTrajectory).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          passFailStatus: expect.stringMatching(/passed|failed/),
          accuracy: expect.any(Number),
          reasoning: expect.any(String),
        })
      );
    });

    it('calls Bedrock service for real evaluation', async () => {
      mockUseMockJudge.mockReturnValue(false);
      mockEvaluateTrajectory.mockResolvedValue({
        passFailStatus: 'passed',
        metrics: {
          accuracy: 0.95,
        },
        llmJudgeReasoning: 'Good performance',
        improvementStrategies: [],
        duration: 100,
      });

      const { req, res } = createMocks({
        trajectory: [{ type: 'action', toolName: 'cluster_health' }],
        expectedOutcomes: ['Identify root cause'],
        modelId: 'test-model',
      });
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      expect(mockEvaluateTrajectory).toHaveBeenCalledWith(
        expect.objectContaining({
          trajectory: expect.any(Array),
          expectedOutcomes: expect.any(Array),
        }),
        'test-model'
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          passFailStatus: 'passed',
          metrics: expect.objectContaining({
            accuracy: 0.95,
          }),
        })
      );
    });

    it('returns 500 on Bedrock error', async () => {
      mockUseMockJudge.mockReturnValue(false);
      const error = new Error('Bedrock connection failed');
      mockEvaluateTrajectory.mockRejectedValue(error);
      mockParseBedrockError.mockReturnValue('Bedrock connection failed');

      const { req, res } = createMocks({
        trajectory: [{ type: 'action' }],
        expectedOutcomes: ['Test'],
      });
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Bedrock Judge evaluation failed'),
        })
      );
    });

    it('handles trajectory with tool calls in mock mode', async () => {
      mockUseMockJudge.mockReturnValue(true);

      const { req, res } = createMocks({
        trajectory: [
          { type: 'action', toolName: 'cluster_health' },
          { type: 'response', content: 'The root cause is...' },
        ],
        expectedOutcomes: ['Check cluster health', 'Identify root cause'],
      });
      const handler = getRouteHandler(judgeRoutes, 'post', '/api/judge');

      await handler(req, res);

      // With tool calls and conclusion, should have higher accuracy
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accuracy: expect.any(Number),
          reasoning: expect.stringContaining('diagnostic tools'),
        })
      );
    });
  });
});
