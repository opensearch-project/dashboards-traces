/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RunAggregateMetrics } from '@/types';

interface MetricsTimeSeriesChartProps {
  runs: RunAggregateMetrics[];
  height?: number;
}

interface MetricConfig {
  key: keyof RunAggregateMetrics;
  label: string;
  unit: string;
  color: string;
  isPercentage: boolean;
  isTraceMetric?: boolean;
  formatter: (value: number) => string;
}

// Metrics configuration for time series chart
const TIME_SERIES_METRICS: MetricConfig[] = [
  {
    key: 'avgAccuracy',
    label: 'Accuracy',
    unit: '%',
    color: '#3b82f6', // blue-500
    isPercentage: true,
    formatter: (v) => `${v}%`,
  },
  {
    key: 'passRatePercent',
    label: 'Pass Rate',
    unit: '%',
    color: '#015aa3', // opensearch-blue
    isPercentage: true,
    formatter: (v) => `${v}%`,
  },
  {
    key: 'totalTokens',
    label: 'Total Tokens',
    unit: '',
    color: '#f59e0b', // amber-500
    isPercentage: false,
    isTraceMetric: true,
    formatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v.toString()),
  },
  {
    key: 'totalCostUsd',
    label: 'Cost',
    unit: '$',
    color: '#ef4444', // red-500
    isPercentage: false,
    isTraceMetric: true,
    formatter: (v) => `$${v.toFixed(2)}`,
  },
  {
    key: 'avgDurationMs',
    label: 'Avg Duration',
    unit: 'ms',
    color: '#8b5cf6', // purple-500
    isPercentage: false,
    isTraceMetric: true,
    formatter: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`),
  },
  {
    key: 'totalLlmCalls',
    label: 'LLM Calls',
    unit: '',
    color: '#06b6d4', // cyan-500
    isPercentage: false,
    isTraceMetric: true,
    formatter: (v) => v.toString(),
  },
  {
    key: 'totalToolCalls',
    label: 'Tool Calls',
    unit: '',
    color: '#ec4899', // pink-500
    isPercentage: false,
    isTraceMetric: true,
    formatter: (v) => v.toString(),
  },
];

// Format date for X-axis
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MetricsTimeSeriesChart: React.FC<MetricsTimeSeriesChartProps> = ({
  runs,
  height = 400,
}) => {
  // Track which metrics are visible
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(
    new Set(['avgAccuracy', 'passRatePercent'])
  );

  // Check if any run has trace metrics
  const hasTraceMetrics = useMemo(
    () => runs.some((run) => run.totalTokens !== undefined && run.totalTokens > 0),
    [runs]
  );

  // Filter metrics based on available data
  const activeMetrics = useMemo(() => {
    return TIME_SERIES_METRICS.filter((metric) => {
      if (metric.isTraceMetric && !hasTraceMetrics) return false;
      return true;
    });
  }, [hasTraceMetrics]);

  // Sort runs chronologically and transform for chart
  const chartData = useMemo(() => {
    const sorted = [...runs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    return sorted.map((run) => ({
      name: run.runName,
      date: formatDate(run.createdAt),
      rawDate: run.createdAt,
      avgAccuracy: run.avgAccuracy ?? 0,
      passRatePercent: run.passRatePercent ?? 0,
      totalTokens: run.totalTokens ?? 0,
      totalCostUsd: run.totalCostUsd ?? 0,
      avgDurationMs: run.avgDurationMs ?? 0,
      totalLlmCalls: run.totalLlmCalls ?? 0,
      totalToolCalls: run.totalToolCalls ?? 0,
    }));
  }, [runs]);

  // Toggle metric visibility
  const toggleMetric = (key: string) => {
    setVisibleMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        // Don't allow hiding all metrics
        if (next.size > 1) {
          next.delete(key);
        }
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const dataPoint = chartData.find((d) => d.name === label);

    return (
      <div className="bg-card border border-border rounded-md p-3 shadow-lg max-w-xs">
        <p className="text-sm font-medium mb-1">{label}</p>
        {dataPoint && (
          <p className="text-xs text-muted-foreground mb-2">{dataPoint.date}</p>
        )}
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => {
            const metric = activeMetrics.find((m) => m.key === entry.dataKey);
            return (
              <div key={index} className="flex items-center gap-2 text-xs">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: entry.stroke }}
                />
                <span className="text-muted-foreground">{entry.name}:</span>
                <span className="font-medium">
                  {metric ? metric.formatter(entry.value) : entry.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Custom legend with toggle functionality
  const renderLegend = () => {
    return (
      <div className="flex flex-wrap gap-2 justify-center mt-4">
        {activeMetrics.map((metric) => {
          const isVisible = visibleMetrics.has(metric.key);
          return (
            <button
              key={metric.key}
              onClick={() => toggleMetric(metric.key)}
              className={`
                flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all
                ${
                  isVisible
                    ? 'bg-card border border-border'
                    : 'bg-muted/30 border border-transparent opacity-50'
                }
                hover:opacity-100
              `}
            >
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: isVisible ? metric.color : '#6b7280' }}
              />
              <span className={isVisible ? 'text-foreground' : 'text-muted-foreground'}>
                {metric.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

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

  if (runs.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        Need at least 2 runs to show trends over time
      </div>
    );
  }

  // Separate percentage and count metrics for dual axis
  const visiblePercentageMetrics = activeMetrics.filter(
    (m) => m.isPercentage && visibleMetrics.has(m.key)
  );
  const visibleCountMetrics = activeMetrics.filter(
    (m) => !m.isPercentage && visibleMetrics.has(m.key)
  );

  const showRightAxis = visibleCountMetrics.length > 0;

  return (
    <div>
      <h4 className="text-sm font-medium text-muted-foreground mb-2">
        Metrics Over Time
      </h4>
      <p className="text-xs text-muted-foreground mb-4">
        Track how metrics change across runs. Click legend items to show/hide metrics.
      </p>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: showRightAxis ? 60 : 20, bottom: 5, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={{ stroke: '#4b5563' }}
            axisLine={{ stroke: '#4b5563' }}
          />
          {/* Left Y-axis for percentage metrics */}
          <YAxis
            yAxisId="left"
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            tickLine={{ stroke: '#4b5563' }}
            axisLine={{ stroke: '#4b5563' }}
            tickFormatter={(v) => `${v}%`}
            width={45}
          />
          {/* Right Y-axis for count metrics (if any visible) */}
          {showRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={{ stroke: '#4b5563' }}
              axisLine={{ stroke: '#4b5563' }}
              width={55}
            />
          )}
          <Tooltip content={<CustomTooltip />} />

          {/* Render lines for visible metrics */}
          {activeMetrics.map((metric) => {
            if (!visibleMetrics.has(metric.key)) return null;
            return (
              <Line
                key={metric.key}
                yAxisId={metric.isPercentage ? 'left' : 'right'}
                type="monotone"
                dataKey={metric.key}
                name={metric.label}
                stroke={metric.color}
                strokeWidth={2}
                dot={{ r: 4, fill: metric.color, stroke: '#1f2937', strokeWidth: 1 }}
                activeDot={{ r: 6, fill: metric.color, stroke: '#fff', strokeWidth: 2 }}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {renderLegend()}

      <p className="text-xs text-muted-foreground text-center mt-3">
        Left axis: Percentage metrics (0-100%) | Right axis: Count metrics
      </p>
    </div>
  );
};
