/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import { formatCost, formatTokens, formatDuration } from '@/services/metrics';

interface RunMetrics {
  runId: string;
  runName: string;
  totalTokens: number;
  totalCostUsd: number;
  avgDurationMs: number;
  totalToolCalls: number;
}

interface MetricsBarChartProps {
  runs: RunMetrics[];
  height?: number;
}

// Color palette for runs (up to 6 runs)
const RUN_COLORS = [
  '#3b82f6', // blue-500
  '#015aa3', // opensearch-blue
  '#f59e0b', // amber-500
  '#8b5cf6', // purple-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
];

interface MetricConfig {
  key: keyof RunMetrics;
  label: string;
  formatter: (value: number) => string;
}

const METRICS: MetricConfig[] = [
  { key: 'totalTokens', label: 'Tokens', formatter: (v) => formatTokens(v) },
  { key: 'totalCostUsd', label: 'Cost', formatter: (v) => formatCost(v) },
  { key: 'avgDurationMs', label: 'Duration', formatter: (v) => formatDuration(v) },
  { key: 'totalToolCalls', label: 'Tool Calls', formatter: (v) => v.toString() },
];

export const MetricsBarChart: React.FC<MetricsBarChartProps> = ({
  runs,
  height = 300,
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

  // Transform data for grouped bar chart
  // Each metric becomes a data point with values for each run
  const chartData = METRICS.map((metric) => {
    const dataPoint: Record<string, any> = { name: metric.label };
    runs.forEach((run, index) => {
      dataPoint[run.runName] = run[metric.key] || 0;
    });
    return dataPoint;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        barGap={4}
        barCategoryGap="20%"
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number, name: string, props: any) => {
            const metricIndex = chartData.findIndex((d) => d.name === props.payload.name);
            const metric = METRICS[metricIndex];
            return [metric?.formatter(value) || value, name];
          }}
        />
        <Legend
          wrapperStyle={{ paddingTop: '10px' }}
          formatter={(value) => <span className="text-sm text-muted-foreground">{value}</span>}
        />
        {runs.map((run, index) => (
          <Bar
            key={run.runId}
            dataKey={run.runName}
            fill={RUN_COLORS[index % RUN_COLORS.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

// Single metric comparison bar chart (horizontal)
interface SingleMetricBarChartProps {
  runs: Array<{
    runId: string;
    runName: string;
    value: number;
    isBaseline?: boolean;
  }>;
  metricLabel: string;
  formatter: (value: number) => string;
  color?: string;
  height?: number;
}

export const SingleMetricBarChart: React.FC<SingleMetricBarChartProps> = ({
  runs,
  metricLabel,
  formatter,
  color = '#3b82f6',
  height = 150,
}) => {
  const data = runs.map((run) => ({
    name: run.runName,
    value: run.value,
    isBaseline: run.isBaseline,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={formatter}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickLine={false}
          axisLine={false}
          width={70}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
          formatter={(value: number) => [formatter(value), metricLabel]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isBaseline ? '#3b82f6' : RUN_COLORS[(index + 1) % RUN_COLORS.length]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
