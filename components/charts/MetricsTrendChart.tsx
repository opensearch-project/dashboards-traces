/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCost, formatTokens, formatDuration } from '@/services/metrics';

export interface TrendDataPoint {
  name: string;
  tokens: number;
  cost: number;
  duration: number;
}

interface MetricsTrendChartProps {
  data: TrendDataPoint[];
  metric: 'tokens' | 'cost' | 'duration';
  height?: number;
}

const METRIC_CONFIG = {
  tokens: {
    color: '#3b82f6', // blue-500
    formatter: (value: number) => formatTokens(value),
    label: 'Tokens',
  },
  cost: {
    color: '#f59e0b', // amber-500
    formatter: (value: number) => formatCost(value),
    label: 'Cost',
  },
  duration: {
    color: '#8b5cf6', // purple-500
    formatter: (value: number) => formatDuration(value),
    label: 'Duration',
  },
};

export const MetricsTrendChart: React.FC<MetricsTrendChartProps> = ({
  data,
  metric,
  height = 200,
}) => {
  const config = METRIC_CONFIG[metric];

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
          tickFormatter={config.formatter}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number) => [config.formatter(value), config.label]}
        />
        <Line
          type="monotone"
          dataKey={metric}
          stroke={config.color}
          strokeWidth={2}
          dot={{ fill: config.color, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
