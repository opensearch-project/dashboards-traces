/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { RunAggregateMetrics } from '@/types';

interface AggregateMetricsChartProps {
  runs: RunAggregateMetrics[];
  height?: number;
  baselineRunId?: string;
}

// Color palette for runs (up to 6 runs)
const RUN_COLORS = [
  '#3b82f6', // blue-500 (baseline)
  '#015aa3', // opensearch-blue
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
];

interface MetricConfig {
  key: string;
  label: string;
  invert: boolean; // If true, lower values are better (will be inverted for display)
  isTraceMetric?: boolean;
}

// Metrics to display in the radar chart
// For inverted metrics: lower raw value = better performance
const RADAR_METRICS: MetricConfig[] = [
  { key: 'avgAccuracy', label: 'Accuracy', invert: false },
  { key: 'passRatePercent', label: 'Pass Rate', invert: false },
  { key: 'totalTokens', label: 'Token Efficiency', invert: true, isTraceMetric: true },
  { key: 'totalCostUsd', label: 'Cost Efficiency', invert: true, isTraceMetric: true },
  { key: 'avgDurationMs', label: 'Speed', invert: true, isTraceMetric: true },
];

/**
 * Calculate value as percentage of baseline
 * For inverted metrics (lower is better): baseline/value * 100
 * For normal metrics (higher is better): value/baseline * 100
 */
function calculatePercentOfBaseline(
  value: number,
  baselineValue: number,
  invert: boolean
): number {
  if (value === undefined || value === null || value === 0) return 0;
  if (baselineValue === undefined || baselineValue === null || baselineValue === 0) return 100;

  if (invert) {
    // Lower is better: if value < baseline, result > 100 (better)
    return Math.round((baselineValue / value) * 100);
  } else {
    // Higher is better: if value > baseline, result > 100 (better)
    return Math.round((value / baselineValue) * 100);
  }
}

export const AggregateMetricsChart: React.FC<AggregateMetricsChartProps> = ({
  runs,
  height = 350,
  baselineRunId,
}) => {
  if (!runs || runs.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  // Check if any run has trace metrics
  const hasTraceMetrics = runs.some(run => run.totalTokens !== undefined && run.totalTokens > 0);

  // Filter metrics based on available data
  const activeMetrics = RADAR_METRICS.filter(metric => {
    if (metric.isTraceMetric && !hasTraceMetrics) return false;
    return true;
  });

  // Find baseline run by ID, or fall back to first run
  const baselineRun = baselineRunId
    ? runs.find(r => r.runId === baselineRunId) || runs[0]
    : runs[0];

  // Transform data for radar chart
  // Each data point represents a metric with values as % of baseline
  const radarData = activeMetrics.map(metric => {
    const dataPoint: Record<string, string | number> = { metric: metric.label };
    const baselineValue = (baselineRun as any)[metric.key] ?? 0;

    runs.forEach(run => {
      const rawValue = (run as any)[metric.key];
      const percentOfBaseline = calculatePercentOfBaseline(
        rawValue ?? 0,
        baselineValue,
        metric.invert
      );
      dataPoint[run.runName] = percentOfBaseline;
    });

    return dataPoint;
  });

  // Calculate max value for chart domain (to handle runs > 100% of baseline)
  const maxPercent = Math.max(
    100,
    ...radarData.flatMap(d =>
      runs.map(r => (d[r.runName] as number) || 0)
    )
  );
  // Round up to nearest 20 for cleaner axis
  const chartMax = Math.ceil(maxPercent / 20) * 20;

  // Store raw values for tooltip
  const rawValues: Record<string, Record<string, number>> = {};
  activeMetrics.forEach(metric => {
    rawValues[metric.label] = {};
    runs.forEach(run => {
      rawValues[metric.label][run.runName] = (run as any)[metric.key] ?? 0;
    });
  });

  // Custom tooltip to show both normalized and raw values
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const metric = activeMetrics.find(m => m.label === label);

    return (
      <div className="bg-card border border-border rounded-md p-3 shadow-lg">
        <p className="text-sm font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => {
          const rawValue = rawValues[label]?.[entry.name] ?? 0;
          let formattedRaw = rawValue.toString();

          // Format raw values appropriately
          if (metric?.key === 'totalTokens') {
            formattedRaw = rawValue >= 1000 ? `${(rawValue / 1000).toFixed(1)}K` : rawValue.toString();
          } else if (metric?.key === 'totalCostUsd') {
            formattedRaw = `$${rawValue.toFixed(2)}`;
          } else if (metric?.key === 'avgDurationMs') {
            formattedRaw = rawValue >= 1000 ? `${(rawValue / 1000).toFixed(1)}s` : `${rawValue}ms`;
          } else if (metric?.key === 'avgAccuracy' || metric?.key === 'passRatePercent') {
            formattedRaw = `${rawValue}%`;
          }

          return (
            <div key={index} className="flex items-center gap-2 text-xs mb-1">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: entry.fill || entry.stroke }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{formattedRaw}</span>
              <span className="text-muted-foreground">({entry.value}% of baseline)</span>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground mt-2 italic">
          100% = baseline, {'>'} 100% = better than baseline
        </p>
      </div>
    );
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-3">Performance vs Baseline</h4>
      <p className="text-xs text-muted-foreground mb-4">
        All metrics as % of {baselineRun.runName}. 100% = baseline, {'>'}100% = better.
      </p>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={radarData} margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
          <PolarGrid stroke="#374151" />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, chartMax]}
            tick={{ fill: '#6b7280', fontSize: 10 }}
            tickCount={5}
            tickFormatter={(v) => `${v}%`}
          />
          {runs.map((run, index) => (
            <Radar
              key={run.runId}
              name={run.runName}
              dataKey={run.runName}
              stroke={RUN_COLORS[index % RUN_COLORS.length]}
              fill={RUN_COLORS[index % RUN_COLORS.length]}
              fillOpacity={0.1}
              strokeWidth={2}
              strokeDasharray={index > 0 ? '5 5' : undefined}
              dot={{
                r: 4,
                fill: RUN_COLORS[index % RUN_COLORS.length],
                stroke: '#1f2937',
                strokeWidth: 1,
              }}
              activeDot={{
                r: 6,
                fill: RUN_COLORS[index % RUN_COLORS.length],
                stroke: '#fff',
                strokeWidth: 2,
              }}
            />
          ))}
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
