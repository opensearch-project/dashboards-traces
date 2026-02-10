/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck - Test file uses simplified mock objects
import { runServerEvaluation } from '@/services/client/evaluationApi';
import type { TrajectoryStep, TestCase } from '@/types';

// Helper to create a mock ReadableStream from SSE data chunks
function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

// Helper to format SSE data
function sseData(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

describe('evaluationApi', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('runServerEvaluation', () => {
    const mockReport = {
      id: 'report-123',
      status: 'completed',
      passFailStatus: 'passed',
      metrics: { accuracy: 85 },
      trajectorySteps: 3,
      llmJudgeReasoning: 'Good performance',
    };

    it('should execute evaluation and return completed result', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test Case 1', agent: 'Test Agent' }),
        sseData({
          type: 'step',
          stepIndex: 0,
          step: { id: 's1', type: 'thinking', content: 'Analyzing...', timestamp: Date.now() },
        }),
        sseData({
          type: 'step',
          stepIndex: 1,
          step: { id: 's2', type: 'response', content: 'Done', timestamp: Date.now() },
        }),
        sseData({ type: 'completed', reportId: 'report-123', report: mockReport }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const onStep = jest.fn();
      const result = await runServerEvaluation(
        { agentKey: 'test-agent', modelId: 'claude-sonnet', testCaseId: 'tc-1' },
        onStep
      );

      expect(global.fetch).toHaveBeenCalledWith('/api/evaluate', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));

      expect(onStep).toHaveBeenCalledTimes(2);
      expect(onStep).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'thinking', content: 'Analyzing...' })
      );

      expect(result.reportId).toBe('report-123');
      expect(result.report).toEqual(mockReport);
    });

    it('should support inline test case in request body', async () => {
      const inlineTestCase: TestCase = {
        id: 'adhoc-1',
        name: 'Ad-hoc Test',
        description: 'test',
        labels: [],
        category: 'Ad-hoc',
        difficulty: 'Medium',
        currentVersion: 1,
        versions: [],
        isPromoted: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        initialPrompt: 'test prompt',
        context: [],
      };

      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Ad-hoc Test', agent: 'Test Agent' }),
        sseData({ type: 'completed', reportId: 'report-456', report: mockReport }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const result = await runServerEvaluation({
        agentKey: 'test-agent',
        modelId: 'claude-sonnet',
        testCase: inlineTestCase,
      });

      // Verify the inline test case was sent in the request body
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      expect(body.testCase).toBeDefined();
      expect(body.testCase.id).toBe('adhoc-1');
      expect(body.testCaseId).toBeUndefined();

      expect(result.reportId).toBe('report-456');
    });

    it('should throw on HTTP error with JSON error body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({ error: 'Agent not found: unknown-agent' }),
      });

      await expect(
        runServerEvaluation({ agentKey: 'unknown-agent', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('Agent not found: unknown-agent');
    });

    it('should throw on HTTP error when JSON parsing fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(
        runServerEvaluation({ agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('Internal Server Error');
    });

    it('should throw when no response body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: null,
      });

      await expect(
        runServerEvaluation({ agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('No response body');
    });

    it('should throw on SSE error event', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        sseData({ type: 'error', error: 'Connector execution failed' }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      await expect(
        runServerEvaluation({ agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('Connector execution failed');
    });

    it('should throw when stream ends without completed event', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        sseData({ type: 'step', stepIndex: 0, step: { type: 'thinking', content: 'hmm' } }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      await expect(
        runServerEvaluation({ agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('Evaluation completed without returning result');
    });

    it('should handle incomplete JSON chunks gracefully', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        'data: {"type": "ste', // Incomplete JSON
        'p", "stepIndex": 0, "step": {"type": "thinking", "content": "test"}}\n\n', // Rest of JSON
        sseData({ type: 'completed', reportId: 'report-789', report: mockReport }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const onStep = jest.fn();
      const result = await runServerEvaluation(
        { agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' },
        onStep
      );

      expect(result.reportId).toBe('report-789');
    });

    it('should process completed event in remaining buffer', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        `data: ${JSON.stringify({ type: 'completed', reportId: 'report-buf', report: mockReport })}`, // No trailing \n\n
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      const result = await runServerEvaluation(
        { agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' }
      );

      expect(result.reportId).toBe('report-buf');
    });

    it('should work without onStep callback', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        sseData({ type: 'step', stepIndex: 0, step: { type: 'thinking', content: 'test' } }),
        sseData({ type: 'completed', reportId: 'report-no-cb', report: mockReport }),
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      // Should not throw when no onStep callback provided
      const result = await runServerEvaluation(
        { agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' }
      );

      expect(result.reportId).toBe('report-no-cb');
    });

    it('should throw on error event in remaining buffer', async () => {
      const mockStream = createMockSSEStream([
        sseData({ type: 'started', testCase: 'Test', agent: 'Agent' }),
        `data: ${JSON.stringify({ type: 'error', error: 'Buffer error' })}`, // No trailing \n\n
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      await expect(
        runServerEvaluation({ agentKey: 'test', modelId: 'test', testCaseId: 'tc-1' })
      ).rejects.toThrow('Buffer error');
    });
  });
});
