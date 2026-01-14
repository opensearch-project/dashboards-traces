/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock Trajectory Generator
 * Generates simulated agent trajectories for testing without a real agent
 */

import { v4 as uuidv4 } from 'uuid';
import { TestCase, TrajectoryStep, ToolCallStatus } from '@/types';

export async function generateMockTrajectory(testCase: TestCase): Promise<TrajectoryStep[]> {
  // Simulate Agent Thinking Latency
  const steps: TrajectoryStep[] = [];

  // Initial Thought
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'assistant',
    content: `I need to investigate the ${testCase.name}. Based on the context, I should check the cluster health and then drill down into node stats.`,
    latencyMs: 1200
  });

  await new Promise(r => setTimeout(r, 1000));

  // Action 1
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'action',
    content: "Checking cluster health...",
    toolName: 'opensearch_cluster_health',
    toolArgs: { local: true },
    latencyMs: 450
  });

  await new Promise(r => setTimeout(r, 800));

  // Tool Result 1
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'tool_result',
    content: JSON.stringify({ status: "yellow", number_of_nodes: 3, unassigned_shards: 0 }),
    status: ToolCallStatus.SUCCESS
  });

  await new Promise(r => setTimeout(r, 1500));

  // Action 2 (Simulating deviations based on "randomness" for demo)
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'action',
    content: "Checking node stats for hot threads...",
    toolName: 'opensearch_nodes_stats',
    toolArgs: { metric: "jvm,os" },
    latencyMs: 890
  });

   await new Promise(r => setTimeout(r, 1200));

  // Tool Result 2
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'tool_result',
    content: "Node-1: CPU 12%, Node-2: CPU 15%, Node-3: CPU 98% (Data Node)",
    status: ToolCallStatus.SUCCESS
  });

  // Final Response
  steps.push({
    id: uuidv4(),
    timestamp: Date.now(),
    type: 'response',
    content: "The root cause appears to be High CPU utilization on Node-3. This correlates with the user reports. Recommendation: Investigate Node-3 specific tasks or hot threads.",
    latencyMs: 2000
  });

  return steps;
}
