/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Trace Comparison Service
 *
 * Aligns two span trees using LCS-based algorithm for side-by-side comparison.
 * Follows the same pattern as trajectoryDiffService but works with hierarchical spans.
 */

import {
  Span,
  CategorizedSpan,
  AlignedSpanPair,
  TraceComparisonResult,
  ToolSimilarityConfig,
} from '@/types';
import { categorizeSpanTree } from './spanCategorization';
import { calculateToolSimilarity } from './toolSimilarity';
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_AGENT_NAME,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_TOOL_NAME,
} from '@opentelemetry/semantic-conventions/incubating';

const MATCH_THRESHOLD = 0.6;
const MODIFIED_THRESHOLD = 0.4;

/**
 * Calculate similarity between two spans (0-1).
 * Takes into account span name, category, attributes, and duration.
 */
export function calculateSpanSimilarity(
  left: CategorizedSpan,
  right: CategorizedSpan,
  toolConfig?: ToolSimilarityConfig
): number {
  let score = 0;

  // Category match: 0.3 weight
  if (left.category === right.category) {
    score += 0.3;
  }

  // Name/operation match: 0.3 weight
  const leftOp = left.attributes?.[ATTR_GEN_AI_OPERATION_NAME] || left.name;
  const rightOp = right.attributes?.[ATTR_GEN_AI_OPERATION_NAME] || right.name;
  if (leftOp === rightOp) {
    score += 0.3;
  }

  // For TOOL spans, use tool similarity config if available
  if (left.category === 'TOOL' && right.category === 'TOOL' && toolConfig) {
    const toolSim = calculateToolSimilarity(left, right, toolConfig);
    score += toolSim * 0.25;
  } else {
    // For non-tool spans, compare relevant attributes
    const leftAgent = left.attributes?.[ATTR_GEN_AI_AGENT_NAME];
    const rightAgent = right.attributes?.[ATTR_GEN_AI_AGENT_NAME];
    const leftModel = left.attributes?.[ATTR_GEN_AI_REQUEST_MODEL];
    const rightModel = right.attributes?.[ATTR_GEN_AI_REQUEST_MODEL];
    const leftTool = left.attributes?.[ATTR_GEN_AI_TOOL_NAME];
    const rightTool = right.attributes?.[ATTR_GEN_AI_TOOL_NAME];

    if (
      (leftAgent && rightAgent && leftAgent === rightAgent) ||
      (leftModel && rightModel && leftModel === rightModel) ||
      (leftTool && rightTool && leftTool === rightTool)
    ) {
      score += 0.25;
    }
  }

  // Duration similarity: 0.15 weight (within 50% range is similar)
  const leftDuration = new Date(left.endTime).getTime() - new Date(left.startTime).getTime();
  const rightDuration = new Date(right.endTime).getTime() - new Date(right.startTime).getTime();
  const maxDuration = Math.max(leftDuration, rightDuration);
  if (maxDuration > 0) {
    const durationRatio = Math.min(leftDuration, rightDuration) / maxDuration;
    score += durationRatio * 0.15;
  } else {
    score += 0.15;
  }

  return Math.min(score, 1);
}

/**
 * Align two span arrays using LCS-based dynamic programming.
 * Returns aligned pairs with type annotations.
 */
function alignSpanArrays(
  left: CategorizedSpan[],
  right: CategorizedSpan[],
  toolConfig?: ToolSimilarityConfig
): AlignedSpanPair[] {
  // Handle edge cases
  if (left.length === 0 && right.length === 0) {
    return [];
  }
  if (left.length === 0) {
    return right.map(span => ({
      type: 'added' as const,
      rightSpan: span,
      children: span.children && span.children.length > 0
        ? alignSpanArrays([], span.children as CategorizedSpan[], toolConfig)
        : undefined,
    }));
  }
  if (right.length === 0) {
    return left.map(span => ({
      type: 'removed' as const,
      leftSpan: span,
      children: span.children && span.children.length > 0
        ? alignSpanArrays(span.children as CategorizedSpan[], [], toolConfig)
        : undefined,
    }));
  }

  const n = left.length;
  const m = right.length;

  // Build similarity matrix
  const similarity: number[][] = [];
  for (let i = 0; i < n; i++) {
    similarity[i] = [];
    for (let j = 0; j < m; j++) {
      similarity[i][j] = calculateSpanSimilarity(left[i], right[j], toolConfig);
    }
  }

  // DP for optimal alignment
  const dp: number[][] = Array(n + 1).fill(null).map(() => Array(m + 1).fill(0));
  const path: Array<Array<'match' | 'skip_left' | 'skip_right'>> =
    Array(n + 1).fill(null).map(() => Array(m + 1).fill('skip_left'));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const matchScore = similarity[i - 1][j - 1];

      // Match option
      const matchOption = dp[i - 1][j - 1] + (matchScore >= MATCH_THRESHOLD ? matchScore : -0.5);

      // Skip left (removed)
      const skipLeftOption = dp[i - 1][j] - 0.1;

      // Skip right (added)
      const skipRightOption = dp[i][j - 1] - 0.1;

      if (matchOption >= skipLeftOption && matchOption >= skipRightOption) {
        dp[i][j] = matchOption;
        path[i][j] = 'match';
      } else if (skipLeftOption >= skipRightOption) {
        dp[i][j] = skipLeftOption;
        path[i][j] = 'skip_left';
      } else {
        dp[i][j] = skipRightOption;
        path[i][j] = 'skip_right';
      }
    }
  }

  // Backtrack
  const result: AlignedSpanPair[] = [];
  let i = n, j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && path[i][j] === 'match') {
      const sim = similarity[i - 1][j - 1];
      const leftSpan = left[i - 1];
      const rightSpan = right[j - 1];

      // Recursively align children
      const leftChildren = (leftSpan.children || []) as CategorizedSpan[];
      const rightChildren = (rightSpan.children || []) as CategorizedSpan[];
      const alignedChildren = leftChildren.length > 0 || rightChildren.length > 0
        ? alignSpanArrays(leftChildren, rightChildren, toolConfig)
        : undefined;

      if (sim >= MATCH_THRESHOLD) {
        const isExactMatch =
          leftSpan.name === rightSpan.name &&
          leftSpan.category === rightSpan.category &&
          JSON.stringify(leftSpan.attributes) === JSON.stringify(rightSpan.attributes);

        result.push({
          type: isExactMatch ? 'matched' : 'modified',
          leftSpan,
          rightSpan,
          similarity: sim,
          children: alignedChildren,
        });
      } else if (sim >= MODIFIED_THRESHOLD) {
        result.push({
          type: 'modified',
          leftSpan,
          rightSpan,
          similarity: sim,
          children: alignedChildren,
        });
      } else {
        // Too different, separate entries
        result.push({
          type: 'removed',
          leftSpan,
          children: leftChildren.length > 0
            ? alignSpanArrays(leftChildren, [], toolConfig)
            : undefined,
        });
        result.push({
          type: 'added',
          rightSpan,
          children: rightChildren.length > 0
            ? alignSpanArrays([], rightChildren, toolConfig)
            : undefined,
        });
      }
      i--;
      j--;
    } else if (i > 0 && (j === 0 || path[i][j] === 'skip_left')) {
      const leftSpan = left[i - 1];
      const leftChildren = (leftSpan.children || []) as CategorizedSpan[];
      result.push({
        type: 'removed',
        leftSpan,
        children: leftChildren.length > 0
          ? alignSpanArrays(leftChildren, [], toolConfig)
          : undefined,
      });
      i--;
    } else {
      const rightSpan = right[j - 1];
      const rightChildren = (rightSpan.children || []) as CategorizedSpan[];
      result.push({
        type: 'added',
        rightSpan,
        children: rightChildren.length > 0
          ? alignSpanArrays([], rightChildren, toolConfig)
          : undefined,
      });
      j--;
    }
  }

  // Reverse since we backtracked
  result.reverse();
  return result;
}

/**
 * Count stats recursively from aligned tree
 */
function countAlignedStats(
  aligned: AlignedSpanPair[]
): { matched: number; added: number; removed: number; modified: number } {
  let matched = 0, added = 0, removed = 0, modified = 0;

  for (const pair of aligned) {
    switch (pair.type) {
      case 'matched': matched++; break;
      case 'added': added++; break;
      case 'removed': removed++; break;
      case 'modified': modified++; break;
    }

    if (pair.children) {
      const childStats = countAlignedStats(pair.children);
      matched += childStats.matched;
      added += childStats.added;
      removed += childStats.removed;
      modified += childStats.modified;
    }
  }

  return { matched, added, removed, modified };
}

/**
 * Count total spans in a tree
 */
function countSpans(spans: CategorizedSpan[]): number {
  let count = spans.length;
  for (const span of spans) {
    if (span.children && span.children.length > 0) {
      count += countSpans(span.children as CategorizedSpan[]);
    }
  }
  return count;
}

/**
 * Compare two span trees and return aligned result with statistics.
 * Main entry point for trace comparison.
 */
export function compareTraces(
  leftSpans: Span[],
  rightSpans: Span[],
  toolConfig?: ToolSimilarityConfig
): TraceComparisonResult {
  // Categorize both trees
  const leftCategorized = categorizeSpanTree(leftSpans);
  const rightCategorized = categorizeSpanTree(rightSpans);

  // Align the trees
  const alignedTree = alignSpanArrays(leftCategorized, rightCategorized, toolConfig);

  // Calculate statistics
  const stats = countAlignedStats(alignedTree);

  return {
    alignedTree,
    stats: {
      totalLeft: countSpans(leftCategorized),
      totalRight: countSpans(rightCategorized),
      ...stats,
    },
  };
}

/**
 * Get a flat list of all aligned pairs for easier iteration
 */
export function flattenAlignedTree(aligned: AlignedSpanPair[]): AlignedSpanPair[] {
  const result: AlignedSpanPair[] = [];

  for (const pair of aligned) {
    result.push(pair);
    if (pair.children) {
      result.push(...flattenAlignedTree(pair.children));
    }
  }

  return result;
}

/**
 * Get display info for a comparison type
 */
export function getComparisonTypeInfo(type: AlignedSpanPair['type']): {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  switch (type) {
    case 'matched':
      return {
        label: 'Matched',
        color: 'text-slate-400',
        bgColor: 'bg-slate-500/10',
        borderColor: 'border-slate-500/30',
      };
    case 'added':
      return {
        label: 'Added',
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
      };
    case 'removed':
      return {
        label: 'Removed',
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
      };
    case 'modified':
      return {
        label: 'Modified',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
      };
  }
}
