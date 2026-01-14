/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for Bedrock Judge client
 *
 * Run tests:
 *   npm test -- --testPathPattern=bedrockJudge
 */

import { callBedrockJudge } from '@/services/evaluation/bedrockJudge';
import { TrajectoryStep } from '@/types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('callBedrockJudge', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const mockTrajectory: TrajectoryStep[] = [
    {
      id: 'step-1',
      timestamp: Date.now(),
      type: 'thinking',
      content: 'Analyzing the problem...',
    },
    {
      id: 'step-2',
      timestamp: Date.now(),
      type: 'action',
      content: 'Executing query',
      toolName: 'opensearch_query',
      toolArgs: { query: 'test' },
    },
  ];

  const mockExpected = {
    expectedOutcomes: ['Agent should analyze the problem', 'Agent should execute a query'],
  };

  const mockJudgeResponse = {
    passFailStatus: 'passed',
    metrics: { accuracy: 85 },
    llmJudgeReasoning: 'The agent performed well.',
    improvementStrategies: [],
  };

  it('should pass modelId to the backend API when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockJudgeResponse,
    });

    const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';

    await callBedrockJudge(
      mockTrajectory,
      mockExpected,
      undefined,
      undefined,
      modelId
    );

    // Verify fetch was called with the modelId in the body
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);

    expect(requestBody.modelId).toBe(modelId);
  });

  it('should not include modelId when not provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockJudgeResponse,
    });

    await callBedrockJudge(
      mockTrajectory,
      mockExpected,
      undefined,
      undefined
      // No modelId
    );

    // Verify fetch was called without modelId (undefined)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);

    expect(requestBody.modelId).toBeUndefined();
  });

  it('should include all required fields in the request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockJudgeResponse,
    });

    const logs = [{ timestamp: '2024-01-01', index: 'test', message: 'log entry' }];
    const modelId = 'test-model-id';

    await callBedrockJudge(
      mockTrajectory,
      mockExpected,
      logs,
      undefined,
      modelId
    );

    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);

    expect(requestBody.trajectory).toEqual(mockTrajectory);
    expect(requestBody.expectedOutcomes).toEqual(mockExpected.expectedOutcomes);
    expect(requestBody.logs).toEqual(logs);
    expect(requestBody.modelId).toBe(modelId);
  });

  it('should return judge result on successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockJudgeResponse,
    });

    const result = await callBedrockJudge(
      mockTrajectory,
      mockExpected,
      undefined,
      undefined,
      'test-model'
    );

    expect(result.passFailStatus).toBe('passed');
    expect(result.metrics.accuracy).toBe(85);
    expect(result.llmJudgeReasoning).toBe('The agent performed well.');
  });

  it('should retry on failure and eventually succeed', async () => {
    // First call fails, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockJudgeResponse,
      });

    const result = await callBedrockJudge(
      mockTrajectory,
      mockExpected
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.passFailStatus).toBe('passed');
  });
});
