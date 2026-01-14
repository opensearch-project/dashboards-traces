/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TraceSummary - Reusable trace summary components
 *
 * Provides summary stats, tools used section, and time distribution bar
 * for trace visualization views.
 */

import React from 'react';
import { Bot, Zap, Wrench, AlertCircle, Clock } from 'lucide-react';
import { CategorizedSpan, TimeRange } from '@/types';
import { CategoryStats, ToolInfo } from '@/services/traces/traceStats';
import { formatDuration } from '@/services/traces/utils';
import { getCategoryColors } from '@/services/traces';
import { cn } from '@/lib/utils';

/**
 * Stat card component - displays a single metric
 */
export const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtext?: string;
  colorClass?: string;
}> = ({ icon, label, value, subtext, colorClass = 'text-muted-foreground' }) => (
  <div className="bg-muted/30 rounded-lg p-4 flex flex-col gap-1">
    <div className={cn('flex items-center gap-2 text-sm', colorClass)}>
      {icon}
      <span>{label}</span>
    </div>
    <div className="text-2xl font-bold">{value}</div>
    {subtext && <div className="text-xs text-muted-foreground">{subtext}</div>}
  </div>
);

/**
 * Summary stats grid - LLM Calls, Tool Calls, Unique Tools, Errors
 */
export const SummaryStatsGrid: React.FC<{
  categoryStats: CategoryStats[];
  toolStats: ToolInfo[];
}> = ({ categoryStats, toolStats }) => {
  const llmCount = categoryStats.find(s => s.category === 'LLM')?.count || 0;
  const toolCount = categoryStats.find(s => s.category === 'TOOL')?.count || 0;
  const errorCount = categoryStats.find(s => s.category === 'ERROR')?.count || 0;
  const llmDuration = categoryStats.find(s => s.category === 'LLM')?.totalDuration || 0;
  const toolDuration = categoryStats.find(s => s.category === 'TOOL')?.totalDuration || 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<Zap size={16} />}
        label="LLM Calls"
        value={llmCount}
        subtext={formatDuration(llmDuration)}
        colorClass="text-purple-400"
      />
      <StatCard
        icon={<Wrench size={16} />}
        label="Tool Calls"
        value={toolCount}
        subtext={formatDuration(toolDuration)}
        colorClass="text-amber-400"
      />
      <StatCard
        icon={<Wrench size={16} />}
        label="Unique Tools"
        value={toolStats.length}
        colorClass="text-amber-400"
      />
      <StatCard
        icon={<AlertCircle size={16} />}
        label="Errors"
        value={errorCount}
        colorClass={errorCount > 0 ? 'text-red-400' : 'text-muted-foreground'}
      />
    </div>
  );
};

/**
 * Tools used section - displays list of unique tools with counts
 */
export const ToolsUsedSection: React.FC<{
  toolStats: ToolInfo[];
}> = ({ toolStats }) => {
  if (toolStats.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Wrench size={14} />
        Tools Used
      </h3>
      <div className="flex flex-wrap gap-2">
        {toolStats.map((tool) => (
          <div
            key={tool.name}
            className="bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-1.5 text-sm"
          >
            <span className="text-amber-400 font-medium">{tool.name}</span>
            {tool.count > 1 && (
              <span className="text-amber-400/70 ml-1">×{tool.count}</span>
            )}
            <span className="text-muted-foreground ml-2 text-xs">
              {formatDuration(tool.totalDuration)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Time distribution bar component - horizontal bar with legend
 */
export const TimeDistributionBar: React.FC<{
  stats: CategoryStats[];
  totalDuration: number;
}> = ({ stats, totalDuration }) => {
  if (stats.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground flex items-center gap-2">
          <Clock size={14} />
          Time Distribution
        </span>
        <span className="font-mono text-muted-foreground">{formatDuration(totalDuration)}</span>
      </div>

      {/* Bar */}
      <div className="h-8 rounded-md overflow-hidden flex bg-muted/30">
        {stats.map((stat) => {
          const colors = getCategoryColors(stat.category);
          const widthPercent = Math.max(stat.percentage, 1); // Min 1% for visibility

          return (
            <div
              key={stat.category}
              className={cn('h-full flex items-center justify-center text-xs font-medium', colors.bar)}
              style={{ width: `${widthPercent}%` }}
              title={`${stat.category}: ${formatDuration(stat.totalDuration)} (${stat.percentage.toFixed(1)}%)`}
            >
              {stat.percentage >= 8 && (
                <span className="text-white/90 truncate px-1">
                  {stat.category}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        {stats.map((stat) => {
          const colors = getCategoryColors(stat.category);
          // Format percentage: ~0% for near-zero with actual spans, decimals for small values
          const formattedPercent = (() => {
            if (stat.percentage === 0) return '0';
            if (stat.percentage < 0.005) return '~0'; // Shows as ~0% when count > 0 but rounds to 0.00
            if (stat.percentage < 1) return stat.percentage.toFixed(2);
            if (stat.percentage < 10) return stat.percentage.toFixed(1);
            return stat.percentage.toFixed(0);
          })();
          return (
            <div key={stat.category} className="flex items-center gap-2">
              <div className={cn('w-3 h-3 rounded-sm', colors.bar)} />
              <span className={colors.text}>{stat.category}</span>
              <span className="text-muted-foreground">
                {formattedPercent}% ({formatDuration(stat.totalDuration)})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Trace summary header - shows root container info
 */
export const TraceSummaryHeader: React.FC<{
  rootContainer: CategorizedSpan | null;
  spanCount: number;
  totalDuration: number;
}> = ({ rootContainer, spanCount, totalDuration }) => {
  if (!rootContainer) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-background/50">
      <div className="flex items-center gap-2">
        <Bot className="text-indigo-400" size={18} />
        <span className="font-semibold text-sm">
          {rootContainer.displayName || rootContainer.name}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{spanCount} spans</span>
        <span className="font-mono">{formatDuration(totalDuration)}</span>
      </div>
    </div>
  );
};
