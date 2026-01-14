/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sample Experiment for Demo Mode
 *
 * Pre-configured experiment with a completed run showcasing evaluation results.
 * Always visible alongside real experiments - IDs prefixed with 'demo-'.
 */

import type { Experiment } from '../../types/index.js';

export const SAMPLE_EXPERIMENTS: Experiment[] = [
  {
    id: 'demo-exp-001',
    name: 'RCA Agent Evaluation - Demo',
    description: 'Pre-loaded demo experiment showcasing 5 RCA scenarios with a completed baseline run.',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-15T10:30:00.000Z',
    testCaseIds: [
      'demo-otel-001',
      'demo-otel-002',
      'demo-otel-003',
      'demo-otel-004',
      'demo-otel-005',
    ],
    runs: [
      {
        id: 'demo-run-001',
        name: 'Baseline Run',
        description: 'Initial evaluation with Claude 3.5 Sonnet',
        createdAt: '2024-01-15T10:05:00.000Z',
        status: 'completed',
        agentKey: 'ml-commons',
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        results: {
          'demo-otel-001': { reportId: 'demo-report-001', status: 'completed' },
          'demo-otel-002': { reportId: 'demo-report-002', status: 'completed' },
          'demo-otel-003': { reportId: 'demo-report-003', status: 'completed' },
          'demo-otel-004': { reportId: 'demo-report-004', status: 'completed' },
          'demo-otel-005': { reportId: 'demo-report-005', status: 'completed' },
        },
      },
    ],
  },
];

/**
 * Get a sample experiment by ID
 */
export function getSampleExperiment(id: string): Experiment | undefined {
  return SAMPLE_EXPERIMENTS.find(exp => exp.id === id);
}

/**
 * Get all sample experiments
 */
export function getAllSampleExperiments(): Experiment[] {
  return [...SAMPLE_EXPERIMENTS];
}

/**
 * Check if an ID is a sample experiment
 */
export function isSampleExperimentId(id: string): boolean {
  return id.startsWith('demo-exp-') || id.startsWith('demo-run-');
}
