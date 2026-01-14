/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple Debug Utility
 * Uses standard console levels with a verbose toggle
 */

// Check localStorage for debug setting, default to false
export function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('agenteval_debug') === 'true';
  } catch {
    return false;
  }
}

export function setDebugEnabled(enabled: boolean): void {
  localStorage.setItem('agenteval_debug', String(enabled));
}

/**
 * Debug log - only shown when debug mode is enabled
 * Use for verbose/detailed logs that are noisy in normal operation
 */
export function debug(module: string, ...args: unknown[]): void {
  if (isDebugEnabled()) {
    console.debug(`[${module}]`, ...args);
  }
}

/**
 * Standard log levels - always available, use appropriately:
 * - console.error() - errors
 * - console.warn() - warnings
 * - console.info() - important milestones (connection established, eval complete)
 * - console.log() - normal operational logs
 * - debug() - verbose details (raw data, classifications, etc.)
 */
