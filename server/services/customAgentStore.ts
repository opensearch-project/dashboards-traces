/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * In-memory store for custom agent endpoints added via the UI.
 * Custom agents are lost on server restart (by design — they are lightweight
 * and easy to re-add via Settings).
 */

import type { AgentConfig } from '@/types';

const store = new Map<string, AgentConfig>();

/**
 * Add a custom agent to the store.
 * The agent will have `isCustom: true` set automatically.
 */
export function addCustomAgent(agent: AgentConfig): void {
  store.set(agent.key, { ...agent, isCustom: true });
}

/**
 * Remove a custom agent by its key.
 * @returns true if the agent was found and removed, false otherwise.
 */
export function removeCustomAgent(key: string): boolean {
  return store.delete(key);
}

/**
 * Get all custom agents.
 */
export function getCustomAgents(): AgentConfig[] {
  return Array.from(store.values());
}

/**
 * Clear all custom agents.
 */
export function clearCustomAgents(): void {
  store.clear();
}
