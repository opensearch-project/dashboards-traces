/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ExperimentRun,
  EvaluationReport,
  EvaluationMetrics,
  Category,
  TrajectoryStep,
  LLMJudgeResponse,
  ImprovementStrategy,
  ToolCallStatus,
} from '@/types';

// Mock test case metadata for comparison display
export interface MockTestCaseMeta {
  id: string;
  name: string;
  labels?: string[];
  category: Category;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  version: string;
}

// Mock test cases with version info
export const MOCK_TEST_CASES: MockTestCaseMeta[] = [
  { id: 'baseline-01', name: 'Basic PPL Query', category: 'Baseline', difficulty: 'Easy', version: 'v1' },
  { id: 'baseline-02', name: 'Index Lookup Query', category: 'Baseline', difficulty: 'Medium', version: 'v2' },
  { id: 'rca-01', name: 'Error Spike Analysis', category: 'RCA', difficulty: 'Hard', version: 'v1' },
  { id: 'rca-02', name: 'Latency Investigation', category: 'RCA', difficulty: 'Medium', version: 'v1' },
  { id: 'conv-01', name: 'Follow-up Clarification', category: 'Conversational Queries', difficulty: 'Medium', version: 'v1' },
];

// Version history
export const MOCK_TEST_CASE_VERSIONS: Record<string, Record<string, string>> = {
  'baseline-01': { 'run-baseline': 'v1', 'run-contextfix': 'v1', 'run-claude45': 'v1' },
  'baseline-02': { 'run-baseline': 'v1', 'run-contextfix': 'v2', 'run-claude45': 'v2' },
  'rca-01': { 'run-baseline': 'v1', 'run-contextfix': 'v1', 'run-claude45': 'v1' },
  'rca-02': { 'run-contextfix': 'v1', 'run-claude45': 'v1' },
  'conv-01': { 'run-baseline': 'v1', 'run-contextfix': 'v1' },
};

// Mock experiment runs
export const MOCK_RUNS: ExperimentRun[] = [
  {
    id: 'run-baseline',
    name: 'Baseline v1',
    createdAt: '2025-01-15T10:00:00Z',
    agentKey: 'langgraph',
    modelId: 'claude-sonnet-4',
    results: {
      'baseline-01': { reportId: 'report-baseline-01-r1', status: 'completed' },
      'baseline-02': { reportId: 'report-baseline-02-r1', status: 'completed' },
      'rca-01': { reportId: 'report-rca-01-r1', status: 'completed' },
      'conv-01': { reportId: 'report-conv-01-r1', status: 'completed' },
    },
  },
  {
    id: 'run-contextfix',
    name: 'With Context Fix',
    createdAt: '2025-01-16T14:30:00Z',
    agentKey: 'langgraph',
    modelId: 'claude-sonnet-4',
    results: {
      'baseline-01': { reportId: 'report-baseline-01-r2', status: 'completed' },
      'baseline-02': { reportId: 'report-baseline-02-r2', status: 'completed' },
      'rca-01': { reportId: 'report-rca-01-r2', status: 'completed' },
      'rca-02': { reportId: 'report-rca-02-r2', status: 'completed' },
      'conv-01': { reportId: 'report-conv-01-r2', status: 'completed' },
    },
  },
  {
    id: 'run-claude45',
    name: 'Claude 4.5 Test',
    createdAt: '2025-01-17T09:15:00Z',
    agentKey: 'langgraph',
    modelId: 'claude-opus-4-5',
    results: {
      'baseline-01': { reportId: 'report-baseline-01-r3', status: 'completed' },
      'baseline-02': { reportId: 'report-baseline-02-r3', status: 'failed' },
      'rca-01': { reportId: 'report-rca-01-r3', status: 'completed' },
      'rca-02': { reportId: 'report-rca-02-r3', status: 'completed' },
    },
  },
];

// Helper functions
function createMetrics(accuracy: number, faithfulness: number, trajectoryAlignment: number, latencyScore: number): EvaluationMetrics {
  return { accuracy, faithfulness, trajectory_alignment_score: trajectoryAlignment, latency_score: latencyScore };
}

function createTrajectory(steps: Partial<TrajectoryStep>[]): TrajectoryStep[] {
  let timestamp = Date.now();
  return steps.map((step, i) => {
    const latency = step.latencyMs || 100;
    timestamp += latency;
    return {
      id: `step-${i + 1}`,
      timestamp,
      type: step.type || 'action',
      content: step.content || '',
      toolName: step.toolName,
      toolArgs: step.toolArgs,
      toolOutput: step.toolOutput,
      status: step.status || ToolCallStatus.SUCCESS,
      latencyMs: latency,
    };
  });
}

function createJudgeResponse(promptTokens: number, completionTokens: number, latencyMs: number): LLMJudgeResponse {
  return {
    modelId: 'claude-sonnet-4',
    timestamp: new Date().toISOString(),
    promptTokens,
    completionTokens,
    latencyMs,
    rawResponse: 'Evaluation completed successfully.',
  };
}

// Mock evaluation reports with full data
export const MOCK_REPORTS: Record<string, EvaluationReport> = {
  // ============ Run 1 (Baseline) ============
  'report-baseline-01-r1': {
    id: 'report-baseline-01-r1',
    timestamp: '2025-01-15T10:05:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'baseline-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(80, 75, 82, 90),
    llmJudgeReasoning: 'Good basic query handling with minor inefficiencies. The agent correctly identified the data source and constructed a valid PPL query, though the approach could be more direct.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Analyzing user query for PPL generation...', latencyMs: 150 },
      { type: 'action', toolName: 'get_index_mappings', toolArgs: { index: 'logs-*' }, latencyMs: 320 },
      { type: 'tool_result', content: 'Retrieved mappings for logs-* index', latencyMs: 50 },
      { type: 'assistant', content: 'Building PPL query based on schema...', latencyMs: 180 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | stats count() by service' }, latencyMs: 450 },
      { type: 'tool_result', content: 'Query returned 5 results', latencyMs: 30 },
      { type: 'response', content: 'Here are the service counts from your logs...', latencyMs: 120 },
    ]),
    llmJudgeResponse: createJudgeResponse(2100, 650, 2800),
    improvementStrategies: [
      { category: 'Efficiency', issue: 'Extra mapping lookup', recommendation: 'Cache index mappings for repeated queries', priority: 'medium' },
      { category: 'Accuracy', issue: 'Missing time filter', recommendation: 'Add default time range to queries', priority: 'low' },
    ],
  },
  'report-baseline-02-r1': {
    id: 'report-baseline-02-r1',
    timestamp: '2025-01-15T10:10:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'baseline-02',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(65, 60, 70, 85),
    llmJudgeReasoning: 'Index lookup completed but with suboptimal path. The agent made unnecessary intermediate calls before finding the correct index pattern.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Need to find the correct index for this query...', latencyMs: 200 },
      { type: 'action', toolName: 'list_indices', toolArgs: {}, latencyMs: 280 },
      { type: 'tool_result', content: 'Found 12 indices', latencyMs: 40 },
      { type: 'action', toolName: 'get_index_mappings', toolArgs: { index: 'metrics-*' }, latencyMs: 350 },
      { type: 'tool_result', content: 'Wrong index - no relevant fields', latencyMs: 30 },
      { type: 'action', toolName: 'get_index_mappings', toolArgs: { index: 'traces-*' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Found correct schema', latencyMs: 35 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=traces-* | where service="checkout"' }, latencyMs: 520 },
      { type: 'tool_result', content: 'Query executed successfully', latencyMs: 25 },
      { type: 'response', content: 'Found checkout service traces...', latencyMs: 140 },
    ]),
    llmJudgeResponse: createJudgeResponse(2450, 780, 3200),
    improvementStrategies: [
      { category: 'Efficiency', issue: 'Suboptimal index discovery', recommendation: 'Use index naming conventions to identify correct index faster', priority: 'high' },
      { category: 'Context', issue: 'Missing context awareness', recommendation: 'Leverage previous query context for index selection', priority: 'high' },
    ],
  },
  'report-rca-01-r1': {
    id: 'report-rca-01-r1',
    timestamp: '2025-01-15T10:15:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'rca-01',
    status: 'completed',
    passFailStatus: 'failed',
    metrics: createMetrics(70, 68, 65, 75),
    llmJudgeReasoning: 'Failed to identify root cause correctly. The agent found correlated events but missed the actual source of the error spike, attributing it to a downstream effect rather than the upstream cause.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Investigating error spike...', latencyMs: 180 },
      { type: 'action', toolName: 'search_logs', toolArgs: { query: 'level:error', timeRange: '1h' }, latencyMs: 420 },
      { type: 'tool_result', content: 'Found 1,234 error logs', latencyMs: 60 },
      { type: 'action', toolName: 'aggregate_by_service', toolArgs: { field: 'service.name' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Top services: payment (45%), order (35%), inventory (20%)', latencyMs: 45 },
      { type: 'assistant', content: 'Payment service has most errors, investigating...', latencyMs: 150 },
      { type: 'action', toolName: 'get_service_traces', toolArgs: { service: 'payment' }, latencyMs: 550 },
      { type: 'tool_result', content: 'Payment traces show timeout errors', latencyMs: 55 },
      { type: 'response', content: 'Root cause: Payment service timeout issues', latencyMs: 160, status: ToolCallStatus.FAILURE },
    ]),
    llmJudgeResponse: createJudgeResponse(3100, 920, 4100),
    improvementStrategies: [
      { category: 'Analysis', issue: 'Incorrect root cause identification', recommendation: 'Follow error propagation upstream before concluding', priority: 'high' },
      { category: 'Thoroughness', issue: 'Incomplete trace analysis', recommendation: 'Examine full trace tree, not just top-level service', priority: 'high' },
      { category: 'Context', issue: 'Missing dependency awareness', recommendation: 'Map service dependencies before analysis', priority: 'medium' },
    ],
  },
  'report-conv-01-r1': {
    id: 'report-conv-01-r1',
    timestamp: '2025-01-15T10:20:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'conv-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(72, 70, 75, 88),
    llmJudgeReasoning: 'Follow-up handled adequately. The agent maintained context from previous query but could have provided more detailed clarification.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'User asking for clarification on previous results...', latencyMs: 120 },
      { type: 'action', toolName: 'get_previous_context', toolArgs: {}, latencyMs: 80 },
      { type: 'tool_result', content: 'Retrieved previous query context', latencyMs: 20 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | where service="api" | stats avg(latency)' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Average latency: 245ms', latencyMs: 35 },
      { type: 'response', content: 'The average latency for the API service is 245ms', latencyMs: 100 },
    ]),
    llmJudgeResponse: createJudgeResponse(1800, 520, 2200),
    improvementStrategies: [
      { category: 'Clarity', issue: 'Brief response', recommendation: 'Provide more context in follow-up responses', priority: 'low' },
    ],
  },

  // ============ Run 2 (Context Fix) - Improved ============
  'report-baseline-01-r2': {
    id: 'report-baseline-01-r2',
    timestamp: '2025-01-16T14:35:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'baseline-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(92, 95, 90, 92),
    llmJudgeReasoning: 'Excellent query handling with context improvements. The agent efficiently constructed the query with proper time bounds and aggregations.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Analyzing query with enhanced context...', latencyMs: 100 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | where @timestamp > now() - 1h | stats count() by service' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Query returned 5 results with time filtering', latencyMs: 25 },
      { type: 'response', content: 'Here are the service counts from the last hour...', latencyMs: 80 },
    ]),
    llmJudgeResponse: createJudgeResponse(1950, 480, 2100),
    improvementStrategies: [
      { category: 'Optimization', issue: 'Could add caching', recommendation: 'Consider caching frequent query patterns', priority: 'low' },
    ],
  },
  'report-baseline-02-r2': {
    id: 'report-baseline-02-r2',
    timestamp: '2025-01-16T14:40:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'baseline-02',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(85, 88, 82, 90),
    llmJudgeReasoning: 'Index lookup much improved with new context handling. Direct path to correct index using naming conventions.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Using context to identify correct index pattern...', latencyMs: 90 },
      { type: 'action', toolName: 'get_index_mappings', toolArgs: { index: 'traces-*' }, latencyMs: 280 },
      { type: 'tool_result', content: 'Found correct schema', latencyMs: 30 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=traces-* | where service="checkout"' }, latencyMs: 420 },
      { type: 'tool_result', content: 'Query executed successfully', latencyMs: 25 },
      { type: 'response', content: 'Found checkout service traces with detailed breakdown...', latencyMs: 95 },
    ]),
    llmJudgeResponse: createJudgeResponse(2200, 620, 2600),
    improvementStrategies: [
      { category: 'Caching', issue: 'Repeated mapping lookups', recommendation: 'Add index mapping cache', priority: 'medium' },
    ],
  },
  'report-rca-01-r2': {
    id: 'report-rca-01-r2',
    timestamp: '2025-01-16T14:45:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'rca-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(87, 85, 88, 82),
    llmJudgeReasoning: 'Root cause identified correctly with clear explanation. The agent properly traced the error upstream to the database connection pool exhaustion.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Investigating error spike with dependency analysis...', latencyMs: 160 },
      { type: 'action', toolName: 'search_logs', toolArgs: { query: 'level:error', timeRange: '1h' }, latencyMs: 400 },
      { type: 'tool_result', content: 'Found 1,234 error logs', latencyMs: 55 },
      { type: 'action', toolName: 'get_service_dependencies', toolArgs: {}, latencyMs: 320 },
      { type: 'tool_result', content: 'Dependency map loaded', latencyMs: 40 },
      { type: 'action', toolName: 'trace_error_propagation', toolArgs: { startService: 'payment' }, latencyMs: 480 },
      { type: 'tool_result', content: 'Traced to database service', latencyMs: 50 },
      { type: 'action', toolName: 'analyze_service_metrics', toolArgs: { service: 'database' }, latencyMs: 350 },
      { type: 'tool_result', content: 'Connection pool at 100% utilization', latencyMs: 45 },
      { type: 'response', content: 'Root cause: Database connection pool exhaustion causing cascading failures', latencyMs: 140 },
    ]),
    llmJudgeResponse: createJudgeResponse(3400, 1050, 4500),
    improvementStrategies: [
      { category: 'Speed', issue: 'Analysis took multiple steps', recommendation: 'Parallelize independent service checks', priority: 'medium' },
    ],
  },
  'report-rca-02-r2': {
    id: 'report-rca-02-r2',
    timestamp: '2025-01-16T14:50:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'rca-02',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(82, 80, 78, 85),
    llmJudgeReasoning: 'Latency investigation thorough and accurate. Identified slow database queries as the primary contributor.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Analyzing latency patterns...', latencyMs: 140 },
      { type: 'action', toolName: 'get_latency_percentiles', toolArgs: { service: 'api', percentiles: [50, 95, 99] }, latencyMs: 380 },
      { type: 'tool_result', content: 'p50: 120ms, p95: 450ms, p99: 1200ms', latencyMs: 40 },
      { type: 'action', toolName: 'trace_slow_requests', toolArgs: { threshold: '500ms' }, latencyMs: 520 },
      { type: 'tool_result', content: 'Found 45 slow traces', latencyMs: 55 },
      { type: 'response', content: 'Latency spike caused by slow database queries during peak hours', latencyMs: 120 },
    ]),
    llmJudgeResponse: createJudgeResponse(2600, 750, 3100),
    improvementStrategies: [
      { category: 'Depth', issue: 'Could provide query examples', recommendation: 'Include specific slow query examples in response', priority: 'low' },
    ],
  },
  'report-conv-01-r2': {
    id: 'report-conv-01-r2',
    timestamp: '2025-01-16T14:55:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Sonnet 4',
    testCaseId: 'conv-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(90, 92, 88, 91),
    llmJudgeReasoning: 'Excellent conversational follow-up handling. Rich context maintenance and detailed explanations.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Processing follow-up with full conversation context...', latencyMs: 80 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | where service="api" | stats avg(latency), max(latency), min(latency)' }, latencyMs: 350 },
      { type: 'tool_result', content: 'Detailed latency stats retrieved', latencyMs: 30 },
      { type: 'response', content: 'The API service latency breakdown: avg 245ms, max 1.2s, min 45ms. The high variance suggests intermittent slow queries.', latencyMs: 110 },
    ]),
    llmJudgeResponse: createJudgeResponse(1650, 480, 1900),
    improvementStrategies: [],
  },

  // ============ Run 3 (Claude 4.5) - Mixed ============
  'report-baseline-01-r3': {
    id: 'report-baseline-01-r3',
    timestamp: '2025-01-17T09:20:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Opus 4.5',
    testCaseId: 'baseline-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(88, 85, 90, 95),
    llmJudgeReasoning: 'Very good performance with faster response. The new model shows improved latency but slightly less detailed explanations.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Processing query...', latencyMs: 60 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | stats count() by service' }, latencyMs: 280 },
      { type: 'tool_result', content: 'Query returned 5 results', latencyMs: 20 },
      { type: 'response', content: 'Service counts from logs...', latencyMs: 55 },
    ]),
    llmJudgeResponse: createJudgeResponse(1400, 380, 1600),
    improvementStrategies: [
      { category: 'Completeness', issue: 'Brief response', recommendation: 'Add more context to query results', priority: 'low' },
    ],
  },
  'report-baseline-02-r3': {
    id: 'report-baseline-02-r3',
    timestamp: '2025-01-17T09:25:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Opus 4.5',
    testCaseId: 'baseline-02',
    status: 'failed',
    passFailStatus: 'failed',
    metrics: createMetrics(82, 80, 78, 92),
    llmJudgeReasoning: 'Failed validation despite good metrics - incorrect index selected. The model chose logs-* instead of traces-* for trace data, leading to incorrect results.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Finding relevant index...', latencyMs: 50 },
      { type: 'action', toolName: 'execute_ppl', toolArgs: { query: 'source=logs-* | where service="checkout"' }, latencyMs: 260 },
      { type: 'tool_result', content: 'Query executed but wrong data source', latencyMs: 25, status: ToolCallStatus.FAILURE },
      { type: 'response', content: 'Found checkout logs...', latencyMs: 45 },
    ]),
    llmJudgeResponse: createJudgeResponse(1300, 350, 1500),
    improvementStrategies: [
      { category: 'Accuracy', issue: 'Wrong index selection', recommendation: 'Verify index contains expected data type before querying', priority: 'high' },
      { category: 'Validation', issue: 'Missing result validation', recommendation: 'Add sanity check on query results', priority: 'high' },
    ],
  },
  'report-rca-01-r3': {
    id: 'report-rca-01-r3',
    timestamp: '2025-01-17T09:30:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Opus 4.5',
    testCaseId: 'rca-01',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(85, 82, 86, 88),
    llmJudgeReasoning: 'Good RCA performance, slightly below context fix version. Correct root cause found but with less detailed explanation.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Analyzing error spike...', latencyMs: 70 },
      { type: 'action', toolName: 'search_logs', toolArgs: { query: 'level:error' }, latencyMs: 320 },
      { type: 'tool_result', content: 'Found errors', latencyMs: 35 },
      { type: 'action', toolName: 'trace_error_propagation', toolArgs: { startService: 'payment' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Traced to database', latencyMs: 40 },
      { type: 'response', content: 'Root cause: Database connection issues', latencyMs: 65 },
    ]),
    llmJudgeResponse: createJudgeResponse(2200, 580, 2800),
    improvementStrategies: [
      { category: 'Detail', issue: 'Sparse explanation', recommendation: 'Provide more detailed root cause analysis', priority: 'medium' },
    ],
  },
  'report-rca-02-r3': {
    id: 'report-rca-02-r3',
    timestamp: '2025-01-17T09:35:00Z',
    agentName: 'Langgraph',
    modelName: 'Claude Opus 4.5',
    testCaseId: 'rca-02',
    status: 'completed',
    passFailStatus: 'passed',
    metrics: createMetrics(88, 86, 84, 90),
    llmJudgeReasoning: 'Excellent latency investigation with detailed analysis. Fast and accurate identification of slow queries.',
    trajectory: createTrajectory([
      { type: 'assistant', content: 'Checking latency...', latencyMs: 55 },
      { type: 'action', toolName: 'get_latency_percentiles', toolArgs: { service: 'api' }, latencyMs: 290 },
      { type: 'tool_result', content: 'Latency data retrieved', latencyMs: 30 },
      { type: 'action', toolName: 'trace_slow_requests', toolArgs: { threshold: '500ms' }, latencyMs: 380 },
      { type: 'tool_result', content: 'Slow traces identified', latencyMs: 35 },
      { type: 'response', content: 'Latency caused by slow DB queries: SELECT * FROM orders WHERE...', latencyMs: 70 },
    ]),
    llmJudgeResponse: createJudgeResponse(2100, 620, 2500),
    improvementStrategies: [],
  },
};

// Helper functions
export function getMockRuns(): ExperimentRun[] {
  return MOCK_RUNS;
}

export function getMockReportsByIds(reportIds: string[]): EvaluationReport[] {
  return reportIds.map(id => MOCK_REPORTS[id]).filter((r): r is EvaluationReport => r !== undefined);
}

export function getMockTestCaseMeta(testCaseId: string): MockTestCaseMeta | undefined {
  return MOCK_TEST_CASES.find(tc => tc.id === testCaseId);
}

export function getMockTestCaseVersion(testCaseId: string, runId: string): string | undefined {
  return MOCK_TEST_CASE_VERSIONS[testCaseId]?.[runId];
}

// Helper to calculate total latency from trajectory
export function calculateTotalLatency(trajectory: TrajectoryStep[]): number {
  return trajectory.reduce((sum, step) => sum + (step.latencyMs || 0), 0);
}
