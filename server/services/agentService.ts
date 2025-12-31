/**
 * Agent Service - Proxy SSE streaming requests to agents
 */

import { Response } from 'express';

// ============================================================================
// Types
// ============================================================================

export interface AgentProxyRequest {
  endpoint: string;
  payload: any;
  headers?: Record<string, string>;
}

export interface SSEHeaders {
  'Content-Type': string;
  'Cache-Control': string;
  'Connection': string;
  'X-Accel-Buffering': string;
}

// ============================================================================
// Agent Proxy Functions
// ============================================================================

/**
 * Set SSE (Server-Sent Events) headers on the response
 */
export function setSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/**
 * Send an AG UI RUN_ERROR event
 */
export function sendErrorEvent(res: Response, message: string): void {
  res.write(`data: ${JSON.stringify({
    type: 'RUN_ERROR',
    message,
    timestamp: Date.now()
  })}\n\n`);
  res.end();
}

/**
 * Proxy agent request and stream SSE response back to client
 *
 * @param request - Agent proxy request configuration
 * @param res - Express Response object for streaming
 */
export async function proxyAgentRequest(
  request: AgentProxyRequest,
  res: Response
): Promise<void> {
  const { endpoint, payload, headers: customHeaders = {} } = request;

  console.log('\n========== AGENT PROXY REQUEST ==========');
  console.log('[AgentProxy] Target endpoint:', endpoint);
  console.log('[AgentProxy] Custom headers:', Object.keys(customHeaders));
  console.log('[AgentProxy] Payload:', JSON.stringify(payload).substring(0, 200) + '...');

  // Set SSE headers for streaming response
  setSSEHeaders(res);

  // Make request to agent endpoint
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      ...customHeaders,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AgentProxy] Agent returned error:', response.status, errorText);

    // Send a proper AG UI RUN_ERROR event so frontend can handle it
    sendErrorEvent(res, `Agent error: ${response.status} - ${errorText}`);
    return;
  }

  console.log('[AgentProxy] Connected to agent, streaming response...');
  console.log('[AgentProxy] Response headers:', Object.fromEntries(response.headers.entries()));

  // Stream the response back to client
  const reader = response.body?.getReader();
  if (!reader) {
    console.error('[AgentProxy] No response body reader available');
    sendErrorEvent(res, 'Agent response has no body stream');
    return;
  }

  const decoder = new TextDecoder();
  let totalBytes = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      totalBytes += value.length;
      chunkCount++;

      // Log first few chunks and then periodically
      if (chunkCount <= 3 || chunkCount % 10 === 0) {
        console.log(`[AgentProxy] Chunk #${chunkCount} (${value.length} bytes):`,
          chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));
      }

      res.write(chunk);
    }
  } catch (streamError) {
    console.error('[AgentProxy] Stream error:', streamError);
  } finally {
    reader.releaseLock();
  }

  console.log(`[AgentProxy] Stream completed - ${chunkCount} chunks, ${totalBytes} bytes total`);
  res.end();
}

/**
 * Validate agent proxy request
 */
export function validateAgentRequest(request: Partial<AgentProxyRequest>): { valid: boolean; error?: string } {
  if (!request.endpoint) {
    return { valid: false, error: 'Missing required field: endpoint' };
  }

  if (!request.payload) {
    return { valid: false, error: 'Missing required field: payload' };
  }

  return { valid: true };
}
