/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Client-side API for experiment execution
 *
 * Handles SSE streaming from the server-side experiment runner
 * with proper chunk buffering for incomplete events.
 */

import { ExperimentRun, ExperimentProgress, ExperimentStartedEvent, RunConfigInput } from '@/types';

/**
 * Execute an experiment run via the server-side API with SSE streaming.
 *
 * The server executes the experiment in the background and streams progress
 * events. Even if the client disconnects, the server continues execution.
 *
 * @param experimentId - The experiment ID to run
 * @param runConfig - Configuration for the run (agent, model, etc.)
 * @param onProgress - Callback for progress updates
 * @param onStarted - Optional callback when run starts with test case list
 * @returns The completed ExperimentRun
 */
export async function executeExperimentRun(
  experimentId: string,
  runConfig: RunConfigInput,
  onProgress: (progress: ExperimentProgress) => void,
  onStarted?: (event: ExperimentStartedEvent) => void
): Promise<ExperimentRun> {
  const response = await fetch(`/api/storage/experiments/${experimentId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(runConfig),
  });

  if (!response.ok) {
    throw new Error(`Failed to start experiment run: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let completedRun: ExperimentRun | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append new chunk to buffer
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by double newlines
    const events = buffer.split('\n\n');

    // Keep the last potentially incomplete event in the buffer
    buffer = events.pop() || '';

    // Process complete events
    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'started') {
              onStarted?.({ runId: data.runId, testCases: data.testCases || [] });
            } else if (data.type === 'progress') {
              onProgress(data as ExperimentProgress);
            } else if (data.type === 'completed') {
              completedRun = data.run;
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            // Rethrow application errors, ignore JSON parse errors for incomplete chunks
            if (e instanceof Error && !(e instanceof SyntaxError)) {
              throw e;
            }
            // SyntaxError from JSON.parse on incomplete chunks is expected - ignore
          }
        }
      }
    }
  }

  // Process any remaining buffer content
  if (buffer.trim()) {
    const lines = buffer.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'completed') {
            completedRun = data.run;
          } else if (data.type === 'error') {
            throw new Error(data.error);
          }
        } catch (e) {
          // Rethrow application errors, ignore JSON parse errors for final chunk
          if (e instanceof Error && !(e instanceof SyntaxError)) {
            throw e;
          }
        }
      }
    }
  }

  if (!completedRun) {
    throw new Error('Run completed without returning result');
  }

  return completedRun;
}

/**
 * Cancel an in-progress experiment run.
 *
 * @param experimentId - The experiment ID
 * @param runId - The run ID to cancel
 * @returns Whether the cancellation was successful
 */
export async function cancelExperimentRun(
  experimentId: string,
  runId: string
): Promise<boolean> {
  const response = await fetch(`/api/storage/experiments/${experimentId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runId }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || 'Failed to cancel run');
  }

  const result = await response.json();
  return result.cancelled === true;
}
