/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Difficulty, DateFormatVariant } from "@/types"
import { DEFAULT_CONFIG } from "@/lib/constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ==================== Label Styling ====================

// Special colors for difficulty labels only
const DIFFICULTY_LABEL_COLORS: Record<string, string> = {
  'difficulty:Easy': 'bg-blue-900/30 text-opensearch-blue border-blue-800',
  'difficulty:Medium': 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
  'difficulty:Hard': 'bg-red-900/30 text-red-400 border-red-800',
};

// Generic label color palette (used for all other labels, hash-based)
const LABEL_COLOR_PALETTE = [
  'bg-blue-900/20 text-blue-300 border-blue-700',
  'bg-purple-900/30 text-purple-400 border-purple-800',
  'bg-cyan-900/30 text-cyan-400 border-cyan-800',
  'bg-pink-900/30 text-pink-400 border-pink-800',
  'bg-orange-900/30 text-orange-400 border-orange-800',
  'bg-teal-900/30 text-teal-400 border-teal-800',
  'bg-indigo-900/30 text-indigo-400 border-indigo-800',
  'bg-muted text-muted-foreground border-border',
];

/**
 * Returns Tailwind classes for styling label badges
 * Only difficulty:Easy/Medium/Hard get special colors; all others use hash-based palette
 */
export const getLabelColor = (label: string): string => {
  // Check exact match for difficulty labels
  if (DIFFICULTY_LABEL_COLORS[label]) {
    return DIFFICULTY_LABEL_COLORS[label];
  }

  // All other labels use hash-based color assignment for consistency
  const hash = label.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return LABEL_COLOR_PALETTE[hash % LABEL_COLOR_PALETTE.length];
};

// Mapping from difficulty value to full label for backward compat
const DIFFICULTY_VALUE_COLORS: Record<string, string> = {
  'Easy': 'bg-blue-900/30 text-opensearch-blue border-blue-800',
  'Medium': 'bg-yellow-900/30 text-yellow-400 border-yellow-800',
  'Hard': 'bg-red-900/30 text-red-400 border-red-800',
};

/**
 * Returns Tailwind classes for styling difficulty badges
 * @deprecated Use getLabelColor with difficulty: prefixed labels instead
 */
export const getDifficultyColor = (difficulty: Difficulty): string => {
  return DIFFICULTY_VALUE_COLORS[difficulty] || DIFFICULTY_VALUE_COLORS['Medium'];
};

// ==================== Date Formatting ====================

/**
 * Formats a timestamp string to a localized date string
 * @param timestamp - ISO timestamp string
 * @param variant - 'date' (date only), 'datetime' (default, with time), 'detailed' (with seconds)
 */
export const formatDate = (
  timestamp: string,
  variant: DateFormatVariant = 'datetime'
): string => {
  const date = new Date(timestamp);
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  if (variant === 'datetime' || variant === 'detailed') {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  if (variant === 'detailed') {
    options.second = '2-digit';
  }

  return date.toLocaleString('en-US', options);
};

/**
 * Formats a timestamp to relative time (e.g., "5m ago", "2h ago")
 * Falls back to formatDate for timestamps older than 7 days
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(timestamp);
};

// ==================== Model Utilities ====================

/**
 * Gets the display name for a model ID from config
 */
export const getModelName = (modelId: string): string => {
  const model = DEFAULT_CONFIG.models[modelId];
  return model?.display_name || modelId;
};

// ==================== Text Utilities ====================

/**
 * Truncates text to a specified length with ellipsis
 */
export const truncate = (text: string, length: number): string => {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
};
