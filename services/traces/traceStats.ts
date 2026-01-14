/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trace Statistics Utilities
 *
 * Shared helper functions for calculating trace statistics.
 * Used by TraceFlowView.
 */

import { CategorizedSpan, SpanCategory } from '@/types';
import { ATTR_GEN_AI_TOOL_NAME } from '@opentelemetry/semantic-conventions/incubating';

/**
 * Category statistics for trace analysis
 */
export interface CategoryStats {
  category: SpanCategory;
  count: number;
  totalDuration: number;
  percentage: number;
}

/**
 * Tool usage information
 */
export interface ToolInfo {
  name: string;
  count: number;
  totalDuration: number;
}

/**
 * Extract tool name from a span
 */
export function extractToolName(span: CategorizedSpan): string | null {
  // Try gen_ai.tool.name attribute first (OTel semantic convention)
  const toolName = span.attributes?.[ATTR_GEN_AI_TOOL_NAME];
  if (toolName) return toolName;

  // Parse from displayName or name
  const name = span.displayName || span.name || '';

  // Look for tool name patterns
  const patterns = [
    /execute_tool\s+(\S+)/i,
    /executeTools,\s*(\S+)/i,
    /tool\.execute\s+(\S+)/i,
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return match[1];
  }

  // Try to get the last meaningful part after comma
  if (name.includes(',')) {
    const parts = name.split(',');
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart && !lastPart.includes('agent.node')) {
      return lastPart;
    }
  }

  return null;
}

/**
 * Flatten span tree and collect all spans
 */
export function flattenSpans(spans: CategorizedSpan[]): CategorizedSpan[] {
  const result: CategorizedSpan[] = [];

  const collect = (spanList: CategorizedSpan[]) => {
    for (const span of spanList) {
      result.push(span);
      if (span.children && span.children.length > 0) {
        collect(span.children as CategorizedSpan[]);
      }
    }
  };

  collect(spans);
  return result;
}

/**
 * Calculate category statistics from spans
 *
 * Percentages are calculated relative to the sum of all category durations,
 * not trace duration, because spans can overlap (LLM calls inside AGENT spans).
 * This ensures percentages naturally sum to 100%.
 */
export function calculateCategoryStats(spans: CategorizedSpan[], _totalDuration: number): CategoryStats[] {
  const categoryMap = new Map<SpanCategory, { count: number; duration: number }>();

  for (const span of spans) {
    const existing = categoryMap.get(span.category) || { count: 0, duration: 0 };
    categoryMap.set(span.category, {
      count: existing.count + 1,
      duration: existing.duration + (span.duration || 0),
    });
  }

  // Calculate sum of all category durations for percentage calculation
  let sumOfAllDurations = 0;
  categoryMap.forEach((data) => {
    sumOfAllDurations += data.duration;
  });

  const stats: CategoryStats[] = [];
  categoryMap.forEach((data, category) => {
    stats.push({
      category,
      count: data.count,
      totalDuration: data.duration,
      percentage: sumOfAllDurations > 0 ? (data.duration / sumOfAllDurations) * 100 : 0,
    });
  });

  // Sort by duration descending
  return stats.sort((a, b) => b.totalDuration - a.totalDuration);
}

/**
 * Extract unique tools with usage stats
 */
export function extractToolStats(spans: CategorizedSpan[]): ToolInfo[] {
  const toolMap = new Map<string, { count: number; duration: number }>();

  for (const span of spans) {
    if (span.category === 'TOOL') {
      const toolName = extractToolName(span);
      if (toolName) {
        const existing = toolMap.get(toolName) || { count: 0, duration: 0 };
        toolMap.set(toolName, {
          count: existing.count + 1,
          duration: existing.duration + (span.duration || 0),
        });
      }
    }
  }

  const tools: ToolInfo[] = [];
  toolMap.forEach((data, name) => {
    tools.push({
      name,
      count: data.count,
      totalDuration: data.duration,
    });
  });

  // Sort by usage count descending
  return tools.sort((a, b) => b.count - a.count);
}
