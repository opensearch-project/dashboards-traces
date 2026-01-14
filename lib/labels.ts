/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Label utilities for the unified labels system
 *
 * Labels use a generic prefix:value format (e.g., "category:RCA", "priority:High")
 * Any prefix can be used - the system is completely freeform.
 * Special colors are only applied to difficulty:Easy/Medium/Hard labels.
 */

// Valid difficulty values for special color treatment
export const DIFFICULTY_VALUES = ['Easy', 'Medium', 'Hard'] as const;
export type DifficultyValue = typeof DIFFICULTY_VALUES[number];

/**
 * Extract prefix from a label (e.g., "difficulty:Easy" -> "difficulty")
 * Returns null for labels without a colon
 */
export function extractPrefix(label: string): string | null {
  const colonIndex = label.indexOf(':');
  return colonIndex > 0 ? label.substring(0, colonIndex) : null;
}

/**
 * Extract value from a label (e.g., "difficulty:Easy" -> "Easy")
 * Returns the full label if no prefix
 */
export function extractValue(label: string): string {
  const colonIndex = label.indexOf(':');
  return colonIndex > 0 ? label.substring(colonIndex + 1) : label;
}

/**
 * Create a prefixed label
 */
export function createLabel(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

/**
 * Get the display name for a label (strips prefix if present)
 */
export function getLabelDisplayName(label: string): string {
  return extractValue(label);
}

/**
 * Check if a label has a specific prefix
 */
export function hasPrefix(label: string, prefix: string): boolean {
  const fullPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  return label.startsWith(fullPrefix);
}

/**
 * Get all unique prefixes from a set of labels
 */
export function getUniquePrefixes(labels: string[]): string[] {
  const prefixes = new Set<string>();
  for (const label of labels) {
    const prefix = extractPrefix(label);
    if (prefix) prefixes.add(prefix);
  }
  return Array.from(prefixes).sort();
}

/**
 * Filter labels by prefix
 */
export function filterByPrefix(labels: string[], prefix: string): string[] {
  const fullPrefix = prefix.endsWith(':') ? prefix : `${prefix}:`;
  return labels.filter(l => l.startsWith(fullPrefix));
}

/**
 * Group labels by their prefix
 * Labels without a prefix are grouped under ''
 */
export function groupByPrefix(labels: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  for (const label of labels) {
    const prefix = extractPrefix(label) || '';
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(label);
  }

  return groups;
}

/**
 * Check if a label is a difficulty label
 */
export function isDifficultyLabel(label: string): boolean {
  return label.startsWith('difficulty:');
}

// ==================== Backward Compatibility ====================

/**
 * Parsed labels structure for backward compatibility with legacy category/difficulty fields
 */
export interface ParsedLabels {
  difficulty?: DifficultyValue;
  category?: string;
  subcategory?: string;
  generic: string[];
}

/**
 * Parse a labels array into structured format for backward compatibility
 * Extracts difficulty, category, subcategory from prefixed labels
 */
export function parseLabels(labels: string[]): ParsedLabels {
  const result: ParsedLabels = { generic: [] };

  for (const label of labels) {
    if (label.startsWith('difficulty:')) {
      const value = label.substring(11);
      if (DIFFICULTY_VALUES.includes(value as DifficultyValue)) {
        result.difficulty = value as DifficultyValue;
      }
    } else if (label.startsWith('category:')) {
      result.category = label.substring(9);
    } else if (label.startsWith('subcategory:')) {
      result.subcategory = label.substring(12);
    } else {
      result.generic.push(label);
    }
  }

  return result;
}

/**
 * Build a labels array from individual fields
 * Used for migration and backward compatibility
 */
export function buildLabels(fields: {
  category?: string;
  subcategory?: string;
  difficulty?: string;
  generic?: string[];
}): string[] {
  const labels: string[] = [];

  if (fields.difficulty) {
    labels.push(`difficulty:${fields.difficulty}`);
  }
  if (fields.category) {
    labels.push(`category:${fields.category}`);
  }
  if (fields.subcategory) {
    labels.push(`subcategory:${fields.subcategory}`);
  }
  if (fields.generic) {
    labels.push(...fields.generic);
  }

  return labels;
}
