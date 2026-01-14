/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bedrock Service - LLM Judge evaluation using AWS Bedrock
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import config from '../config';
import { TrajectoryStep } from '@/types';
import { JUDGE_SYSTEM_PROMPT } from '../prompts/judgePrompt';

// ============================================================================
// Types
// ============================================================================

export interface JudgeRequest {
  trajectory: TrajectoryStep[];
  expectedOutcomes?: string[];
  expectedTrajectory?: any[];
  logs?: any[];
}

export interface JudgeResponse {
  passFailStatus: 'passed' | 'failed';
  metrics: {
    accuracy: number;
    faithfulness?: number;
    latency_score?: number;
    trajectory_alignment_score?: number;
  };
  llmJudgeReasoning: string;
  improvementStrategies: string[];
  duration: number;
}

interface BedrockJudgeResult {
  pass_fail_status: string;
  accuracy?: number;
  metrics?: {
    accuracy?: number;
    faithfulness?: number;
    latency_score?: number;
    trajectory_alignment_score?: number;
  };
  reasoning: string;
  improvement_strategies?: string[];
}

// ============================================================================
// Bedrock Client Initialization
// ============================================================================

const bedrockClient = new BedrockRuntimeClient({
  region: config.AWS_REGION,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Truncate large strings to reduce token count
 */
export function truncateString(str: string | undefined | null, maxLength: number = 1000): string {
  if (!str || str.length <= maxLength) return str || '';
  return str.substring(0, maxLength) + `... [truncated ${str.length - maxLength} chars]`;
}

/**
 * Reduce trajectory size by truncating large tool outputs
 */
export function compactTrajectory(trajectory: TrajectoryStep[]): TrajectoryStep[] {
  return trajectory.map(step => {
    const compacted = { ...step };

    // Truncate large content fields
    if (compacted.content && typeof compacted.content === 'string') {
      compacted.content = truncateString(compacted.content, 500);
    }

    // Truncate large tool outputs
    if (compacted.toolOutput) {
      if (typeof compacted.toolOutput === 'string') {
        compacted.toolOutput = truncateString(compacted.toolOutput, 1000);
      } else if (typeof compacted.toolOutput === 'object') {
        compacted.toolOutput = truncateString(JSON.stringify(compacted.toolOutput), 1000);
      }
    }

    return compacted;
  });
}

/**
 * Build the evaluation prompt for the LLM judge
 */
export function buildEvaluationPrompt(
  trajectory: TrajectoryStep[],
  expectedOutcomes?: string[],
  expectedTrajectory?: any[],
  logs?: any[]
): string {
  // Compact trajectory to reduce size
  const compactedTrajectory = compactTrajectory(trajectory);
  const trajectoryJson = JSON.stringify(compactedTrajectory, null, 2);

  // Limit logs to 20 most recent
  const logsJson = logs && logs.length > 0
    ? JSON.stringify(logs.slice(0, 20), null, 2)
    : 'No logs available';

  // Build expected section based on what's provided
  let expectedSection = '';
  if (expectedOutcomes && expectedOutcomes.length > 0) {
    // Use expectedOutcomes (new format)
    expectedSection = `## Expected Outcomes
The agent should achieve the following outcomes:
${expectedOutcomes.map((outcome, i) => `${i + 1}. ${outcome}`).join('\n')}`;
  } else if (expectedTrajectory && expectedTrajectory.length > 0) {
    // Fall back to expectedTrajectory (legacy format)
    const expectedJson = JSON.stringify(expectedTrajectory, null, 2);
    expectedSection = `## Expected Trajectory (Legacy)
\`\`\`json
${expectedJson}
\`\`\``;
  } else {
    expectedSection = '## Expected Outcomes\nNo expected outcomes defined.';
  }

  return `# Evaluation Task

## Actual Agent Trajectory
\`\`\`json
${trajectoryJson}
\`\`\`

${expectedSection}

## OpenSearch Logs (Recent 20)
\`\`\`json
${logsJson}
\`\`\`

Please evaluate the agent's performance and provide your assessment in the JSON format specified.`;
}

// ============================================================================
// Main Evaluation Function
// ============================================================================

/**
 * Evaluate agent trajectory using AWS Bedrock LLM Judge
 * @param request - The judge request containing trajectory and expected outcomes
 * @param modelId - Optional model ID to use for evaluation (falls back to config.BEDROCK_MODEL_ID)
 */
export async function evaluateTrajectory(
  request: JudgeRequest,
  modelId?: string
): Promise<JudgeResponse> {
  const { trajectory, expectedOutcomes, expectedTrajectory, logs } = request;

  // Use provided modelId or fall back to configured default
  const effectiveModelId = modelId || config.BEDROCK_MODEL_ID;

  console.log('\n========== BEDROCK JUDGE REQUEST ==========');
  console.log('[JudgeAPI] Received evaluation request');
  console.log('[JudgeAPI] Trajectory steps:', trajectory.length);
  console.log('[JudgeAPI] Expected outcomes:', expectedOutcomes?.length || 0);
  console.log('[JudgeAPI] Expected trajectory steps:', expectedTrajectory?.length || 0);
  console.log('[JudgeAPI] Logs provided:', logs?.length || 0);
  console.log('[JudgeAPI] Model:', effectiveModelId, modelId ? '(from request)' : '(default)');

  // Log trajectory summary for debugging
  console.log('\n--- Trajectory Summary ---');
  trajectory.forEach((step, idx) => {
    console.log(`Step ${idx + 1}: ${step.type} ${step.toolName ? `(${step.toolName})` : ''}`);
  });

  // Log expected outcomes or trajectory
  if (expectedOutcomes?.length) {
    console.log('\n--- Expected Outcomes ---');
    expectedOutcomes.forEach((outcome, idx) => {
      console.log(`${idx + 1}. ${outcome}`);
    });
  } else if (expectedTrajectory?.length) {
    console.log('\n--- Expected Trajectory (Legacy) ---');
    expectedTrajectory.forEach((step: any, idx) => {
      console.log(`Step ${idx + 1}: ${step.description} (Tools: ${step.requiredTools?.join(', ') || 'none'})`);
    });
  }

  // Build evaluation prompt
  const userPrompt = buildEvaluationPrompt(trajectory, expectedOutcomes, expectedTrajectory, logs);

  console.log('\n[JudgeAPI] Prompt built, length:', userPrompt.length, 'characters');

  // Create Bedrock command
  const command = new ConverseCommand({
    modelId: effectiveModelId,
    messages: [
      {
        role: 'user',
        content: [{ text: userPrompt }],
      },
    ],
    system: [{ text: JUDGE_SYSTEM_PROMPT }],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.1,
    },
  });

  // Call Bedrock
  console.log('\n[JudgeAPI] Calling Bedrock API...');
  const startTime = Date.now();
  const response = await bedrockClient.send(command);
  const duration = Date.now() - startTime;

  console.log('[JudgeAPI] ✓ Response received in', duration, 'ms');

  // Extract response text
  let responseText = '';
  if (response.output?.message?.content) {
    for (const content of response.output.message.content) {
      if ('text' in content && content.text) {
        responseText += content.text;
      }
    }
  }

  console.log('\n--- Raw Bedrock Response ---');
  console.log(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));

  // Parse JSON response
  let jsonText = responseText.trim();
  const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1];
    console.log('[JudgeAPI] Extracted JSON from markdown code block');
  } else {
    const startIdx = jsonText.indexOf('{');
    const endIdx = jsonText.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) {
      jsonText = jsonText.slice(startIdx, endIdx + 1);
      console.log('[JudgeAPI] Extracted JSON from text');
    }
  }

  const result: BedrockJudgeResult = JSON.parse(jsonText);

  console.log('\n========== BEDROCK JUDGE RESPONSE ==========');
  console.log('[JudgeAPI] Pass/Fail Status:', result.pass_fail_status?.toUpperCase() || 'MISSING');

  // Handle both new simplified format (accuracy at top level) and legacy format (accuracy in metrics)
  const accuracy = result.accuracy ?? result.metrics?.accuracy ?? 0;
  console.log('[JudgeAPI] Accuracy:', accuracy);
  console.log('[JudgeAPI] ✓ Evaluation completed successfully\n');

  // Return structured response - simplified metrics
  return {
    passFailStatus: (result.pass_fail_status || 'failed') as 'passed' | 'failed',
    metrics: {
      accuracy: accuracy,
      // Legacy metrics (may be present in old responses, optional)
      faithfulness: result.metrics?.faithfulness,
      latency_score: result.metrics?.latency_score,
      trajectory_alignment_score: result.metrics?.trajectory_alignment_score,
    },
    llmJudgeReasoning: result.reasoning,
    improvementStrategies: result.improvement_strategies || [],
    duration,
  };
}

/**
 * Parse error messages from Bedrock API failures
 */
export function parseBedrockError(error: Error): string {
  const errorMessage = error.message;

  if (errorMessage.includes('ExpiredToken') || errorMessage.includes('CredentialsProviderError')) {
    return 'AWS credentials expired or invalid. Please refresh your AWS credentials.';
  } else if (errorMessage.includes('ThrottlingException')) {
    return 'Bedrock API rate limit exceeded. Please try again in a moment.';
  } else if (errorMessage.includes('ValidationException')) {
    return 'Invalid request to Bedrock. Please check your configuration.';
  } else if (errorMessage.includes('JSON')) {
    return 'Failed to parse LLM judge response. The model may have returned invalid JSON.';
  }

  return errorMessage || 'Unknown error occurred';
}
