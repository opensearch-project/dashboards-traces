/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TraceTimelineChart
 *
 * ECharts-based Gantt timeline for trace visualization.
 * Renders spans as horizontal bars with expand/collapse tree hierarchy.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import { Span, TimeRange } from '@/types';
import { getSpanColor, flattenVisibleSpans } from '@/services/traces';
import { formatDuration } from '@/services/traces/utils';
import { truncate } from '@/lib/utils';

const ROW_HEIGHT = 20;

interface TraceTimelineChartProps {
  spanTree: Span[];
  timeRange: TimeRange;
  selectedSpan: Span | null;
  onSelect: (span: Span) => void;
  expandedSpans: Set<string>;
  onToggleExpand: (spanId: string) => void;
}

const TraceTimelineChart: React.FC<TraceTimelineChartProps> = ({
  spanTree,
  timeRange,
  selectedSpan,
  onSelect,
  expandedSpans,
  onToggleExpand
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // Flatten tree respecting expanded state
  const visibleSpans = useMemo(
    () => flattenVisibleSpans(spanTree, expandedSpans),
    [spanTree, expandedSpans]
  );

  // Create span map for quick lookup
  const spanMap = useMemo(() => {
    const map: Record<number, Span> = {};
    visibleSpans.forEach((span, idx) => {
      map[idx] = span;
    });
    return map;
  }, [visibleSpans]);

  // Dynamic chart height based on visible spans
  const chartHeight = Math.max(100, visibleSpans.length * ROW_HEIGHT + 40);

  useEffect(() => {
    if (!chartRef.current || visibleSpans.length === 0) return;

    // Initialize or get existing chart
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    // Prepare data for custom series
    const data = visibleSpans.map((span, idx) => {
      const startTime = new Date(span.startTime).getTime();
      const endTime = new Date(span.endTime).getTime();
      return {
        value: [startTime, endTime, idx],
        itemStyle: {
          color: getSpanColor(span),
          borderColor: selectedSpan?.spanId === span.spanId ? '#ffffff' : undefined,
          borderWidth: selectedSpan?.spanId === span.spanId ? 2 : 0,
        },
        span
      };
    });

    // Custom renderItem for Gantt bars
    const renderGanttBar: echarts.CustomSeriesOption['renderItem'] = (params, api) => {
      const startTime = api.value(0) as number;
      const endTime = api.value(1) as number;
      const idx = api.value(2) as number;

      const start = api.coord([startTime, idx]);
      const end = api.coord([endTime, idx]);

      const barHeight = ROW_HEIGHT * 0.7;
      const y = start[1] - barHeight / 2;

      return {
        type: 'rect',
        shape: {
          x: start[0],
          y: y,
          width: Math.max(end[0] - start[0], 4),
          height: barHeight,
          r: 2
        },
        style: api.style()
      } as echarts.CustomSeriesRenderItemReturn;
    };

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const span = params.data.span as Span;
          const duration = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();
          return `<div style="font-size:11px">
            <div style="font-weight:600;margin-bottom:4px">${span.name}</div>
            <div>Duration: ${formatDuration(duration)}</div>
            <div>Status: ${span.status || 'UNSET'}</div>
          </div>`;
        },
        backgroundColor: 'rgba(30, 41, 59, 0.95)',
        borderColor: 'rgba(51, 65, 85, 0.5)',
        textStyle: { color: '#e2e8f0' }
      },
      grid: {
        left: 220,
        right: 20,
        top: 10,
        bottom: 30,
        containLabel: false
      },
      xAxis: {
        type: 'time',
        min: timeRange.startTime,
        max: timeRange.endTime,
        axisLabel: {
          formatter: (val: number) => formatDuration(val - timeRange.startTime),
          fontSize: 10,
          color: '#94a3b8'
        },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } }
      },
      yAxis: {
        type: 'category',
        data: visibleSpans.map((_, idx) => idx),
        inverse: true,
        position: 'left',
        axisLabel: {
          inside: false,
          formatter: (value: string | number) => {
            const idx = typeof value === 'string' ? parseInt(value, 10) : value;
            const span = spanMap[idx];
            if (!span) return '';
            const indent = '  '.repeat(span.depth || 0);
            const icon = span.hasChildren ? (expandedSpans.has(span.spanId) ? '▼' : '▶') : '  ';
            const label = span.name?.split('.').pop() || 'span';
            const truncatedLabel = truncate(label, 25);
            return `${indent}${icon} ${truncatedLabel}`;
          },
          fontSize: 11,
          color: '#94a3b8',
          margin: 12
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      series: [{
        type: 'custom',
        renderItem: renderGanttBar,
        encode: {
          x: [0, 1],
          y: 2
        },
        data: data
      }]
    };

    chart.setOption(option, true);

    // Handle click events
    chart.off('click');
    chart.on('click', (params: any) => {
      if (params.componentType === 'series' && params.data?.span) {
        onSelect(params.data.span);
      } else if (params.componentType === 'yAxis') {
        // Click on y-axis label to toggle expand
        const span = spanMap[params.value];
        if (span?.hasChildren) {
          onToggleExpand(span.spanId);
        }
      }
    });

    // Handle resize
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [visibleSpans, timeRange, selectedSpan, expandedSpans, spanMap, onSelect, onToggleExpand]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  // Resize chart when height changes
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.resize();
    }
  }, [chartHeight]);

  return (
    <div
      ref={chartRef}
      style={{ height: chartHeight, width: '100%', minWidth: '600px' }}
      className="bg-background"
      data-testid="trace-timeline-chart"
    />
  );
};

export default TraceTimelineChart;
