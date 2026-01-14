/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ContextWindowBar
 *
 * Displays a stacked horizontal bar showing the breakdown of token usage
 * in an LLM request (system prompt, messages, tools).
 */

import React from 'react';
import { estimateTokens } from '@/services/traces/utils';

interface ContextWindowBarProps {
  systemPrompt: string;
  messages: string | object;
  toolCount: number;
  actualInputTokens?: number;
}

const ContextWindowBar: React.FC<ContextWindowBarProps> = ({
  systemPrompt,
  messages,
  toolCount,
  actualInputTokens
}) => {
  // Estimate tokens for each component
  const systemTokens = estimateTokens(systemPrompt);
  const messageTokens = estimateTokens(messages);
  const toolTokens = toolCount * 150; // Rough estimate per tool definition

  const estimatedTotal = systemTokens + messageTokens + toolTokens;
  const displayTotal = actualInputTokens || estimatedTotal;

  // Calculate percentages
  const systemPct = displayTotal > 0 ? (systemTokens / displayTotal) * 100 : 0;
  const messagePct = displayTotal > 0 ? (messageTokens / displayTotal) * 100 : 0;
  const toolPct = displayTotal > 0 ? (toolTokens / displayTotal) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="h-4 flex rounded overflow-hidden bg-muted">
        {systemPct > 0 && (
          <div
            className="bg-purple-500 transition-all"
            style={{ width: `${systemPct}%` }}
            title={`System: ~${systemTokens.toLocaleString()} tokens`}
          />
        )}
        {messagePct > 0 && (
          <div
            className="bg-blue-500 transition-all"
            style={{ width: `${messagePct}%` }}
            title={`Messages: ~${messageTokens.toLocaleString()} tokens`}
          />
        )}
        {toolPct > 0 && (
          <div
            className="bg-amber-500 transition-all"
            style={{ width: `${toolPct}%` }}
            title={`Tools: ~${toolTokens.toLocaleString()} tokens`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
          <span className="text-muted-foreground">System</span>
          <span className="font-mono">~{systemTokens.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
          <span className="text-muted-foreground">Messages</span>
          <span className="font-mono">~{messageTokens.toLocaleString()}</span>
        </div>
        {toolCount > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
            <span className="text-muted-foreground">Tools ({toolCount})</span>
            <span className="font-mono">~{toolTokens.toLocaleString()}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-muted-foreground">Total:</span>
          <span className="font-mono font-medium">
            {actualInputTokens
              ? actualInputTokens.toLocaleString()
              : `~${estimatedTotal.toLocaleString()}`
            }
          </span>
        </div>
      </div>
    </div>
  );
};

export default ContextWindowBar;
