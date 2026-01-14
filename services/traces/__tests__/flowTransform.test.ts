/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for flowTransform.ts - flow transformation utilities
 *
 * Note: applyDagreLayout is not tested here as it depends on the dagre library
 * which requires complex mocking. The function is tested through integration tests.
 */

import { CategorizedSpan, SpanCategory } from '@/types';
import {
  detectParallelExecution,
  countSpansInTree,
} from '../flowTransform';

// Helper to create test spans
function createSpan(
  overrides: Partial<CategorizedSpan> & {
    spanId: string;
    category: SpanCategory;
    startTime: string;
    endTime: string;
  }
): CategorizedSpan {
  return {
    spanId: overrides.spanId,
    traceId: 'test-trace',
    name: overrides.name || 'test-span',
    displayName: overrides.name || 'test-span',
    startTime: overrides.startTime,
    endTime: overrides.endTime,
    duration: new Date(overrides.endTime).getTime() - new Date(overrides.startTime).getTime(),
    status: 'OK',
    category: overrides.category,
    categoryLabel: overrides.category,
    categoryColor: '#888888',
    categoryIcon: 'circle',
    attributes: overrides.attributes || {},
    children: overrides.children,
  };
}

describe('detectParallelExecution', () => {
  it('returns empty array for empty input', () => {
    expect(detectParallelExecution([])).toEqual([]);
  });

  it('returns empty array for single span', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'LLM',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
      }),
    ];
    expect(detectParallelExecution(spans)).toEqual([]);
  });

  it('detects overlapping spans as parallel', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:02Z',
      }),
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:01Z',
        endTime: '2024-01-01T00:00:03Z',
      }),
    ];

    const result = detectParallelExecution(spans);
    expect(result).toHaveLength(1);
    expect(result[0].spans.map(s => s.spanId)).toContain('1');
    expect(result[0].spans.map(s => s.spanId)).toContain('2');
  });

  it('does not detect sequential spans as parallel', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
      }),
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:02Z',
        endTime: '2024-01-01T00:00:03Z',
      }),
    ];

    const result = detectParallelExecution(spans);
    expect(result).toHaveLength(0);
  });

  it('detects multiple parallel groups', () => {
    const spans = [
      // First parallel group
      createSpan({
        spanId: '1',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:02Z',
      }),
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:01Z',
        endTime: '2024-01-01T00:00:02Z',
      }),
      // Sequential gap
      createSpan({
        spanId: '3',
        category: 'LLM',
        startTime: '2024-01-01T00:00:05Z',
        endTime: '2024-01-01T00:00:06Z',
      }),
      // Second parallel group
      createSpan({
        spanId: '4',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:10Z',
        endTime: '2024-01-01T00:00:12Z',
      }),
      createSpan({
        spanId: '5',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:11Z',
        endTime: '2024-01-01T00:00:13Z',
      }),
    ];

    const result = detectParallelExecution(spans);
    expect(result).toHaveLength(2);
    expect(result[0].spans.map(s => s.spanId).sort()).toEqual(['1', '2']);
    expect(result[1].spans.map(s => s.spanId).sort()).toEqual(['4', '5']);
  });

  it('sorts spans by start time before detecting', () => {
    const spans = [
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:01Z',
        endTime: '2024-01-01T00:00:03Z',
      }),
      createSpan({
        spanId: '1',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:02Z',
      }),
    ];

    const result = detectParallelExecution(spans);
    expect(result).toHaveLength(1);
    // First span in group should be the one that started first
    expect(result[0].spans[0].spanId).toBe('1');
  });

  it('groups three or more parallel spans together', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:05Z',
      }),
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:01Z',
        endTime: '2024-01-01T00:00:04Z',
      }),
      createSpan({
        spanId: '3',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:02Z',
        endTime: '2024-01-01T00:00:03Z',
      }),
    ];

    const result = detectParallelExecution(spans);
    expect(result).toHaveLength(1);
    expect(result[0].spans).toHaveLength(3);
  });
});

describe('countSpansInTree', () => {
  it('returns 0 for empty array', () => {
    expect(countSpansInTree([])).toBe(0);
  });

  it('counts single span', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'LLM',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
      }),
    ];
    expect(countSpansInTree(spans)).toBe(1);
  });

  it('counts multiple root spans', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'LLM',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
      }),
      createSpan({
        spanId: '2',
        category: 'TOOL',
        startTime: '2024-01-01T00:00:01Z',
        endTime: '2024-01-01T00:00:02Z',
      }),
    ];
    expect(countSpansInTree(spans)).toBe(2);
  });

  it('counts nested spans', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'AGENT',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:05Z',
        children: [
          createSpan({
            spanId: '1.1',
            category: 'LLM',
            startTime: '2024-01-01T00:00:01Z',
            endTime: '2024-01-01T00:00:02Z',
          }),
          createSpan({
            spanId: '1.2',
            category: 'TOOL',
            startTime: '2024-01-01T00:00:02Z',
            endTime: '2024-01-01T00:00:03Z',
            children: [
              createSpan({
                spanId: '1.2.1',
                category: 'OTHER',
                startTime: '2024-01-01T00:00:02Z',
                endTime: '2024-01-01T00:00:03Z',
              }),
            ],
          }),
        ],
      }),
    ];
    expect(countSpansInTree(spans)).toBe(4);
  });

  it('handles spans without children', () => {
    const spans = [
      createSpan({
        spanId: '1',
        category: 'LLM',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:01Z',
        children: undefined,
      }),
    ];
    expect(countSpansInTree(spans)).toBe(1);
  });
});
