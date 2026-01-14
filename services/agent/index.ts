/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Communication Module
 * Exports clean API for interacting with the Ampabhi-SOAP agent
 */

export { AGUIToTrajectoryConverter, computeTrajectoryFromRawEvents } from './aguiConverter';
export { SSEClient, consumeSSEStream } from './sseStream';
export { buildAgentPayload, buildMultiTurnPayload } from './payloadBuilder';
export type { SSEClientOptions } from './sseStream';
export type { AgentMessage, AgentRequestPayload } from './payloadBuilder';
