/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RunAggregateMetrics } from '@/types';
import { cn } from '@/lib/utils';
import { formatDelta, getDeltaColorClass } from '@/services/comparisonService';

interface AggregateMetricsTableProps {
  runs: RunAggregateMetrics[];
}

type MetricKey = 'avgAccuracy' | 'passRatePercent';

interface MetricRow {
  label: string;
  key: MetricKey;
  higherIsBetter: boolean;
}

const METRIC_ROWS: MetricRow[] = [
  { label: 'Avg Accuracy', key: 'avgAccuracy', higherIsBetter: true },
  { label: 'Pass Rate', key: 'passRatePercent', higherIsBetter: true },
];

export const AggregateMetricsTable: React.FC<AggregateMetricsTableProps> = ({
  runs,
}) => {
  if (runs.length === 0) return null;

  const baselineRun = runs[0];

  // Find best run for each metric
  const findBestRunId = (key: MetricKey, higherIsBetter: boolean): string => {
    let bestRunId = runs[0].runId;
    let bestValue = runs[0][key];

    for (const run of runs) {
      const value = run[key];
      if (higherIsBetter ? value > bestValue : value < bestValue) {
        bestValue = value;
        bestRunId = run.runId;
      }
    }
    return bestRunId;
  };

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-48">Metric</TableHead>
            {runs.map((run, index) => (
              <TableHead key={run.runId} className="text-center min-w-28">
                <div className="truncate">{run.runName}</div>
                {index === 0 && (
                  <div className="text-xs text-muted-foreground font-normal">(baseline)</div>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {METRIC_ROWS.map(({ label, key, higherIsBetter }) => {
            const bestRunId = findBestRunId(key, higherIsBetter);

            return (
              <TableRow key={key}>
                <TableCell className="font-medium">{label}</TableCell>
                {runs.map((run, index) => {
                  const value = run[key];
                  const isBest = run.runId === bestRunId && runs.length > 1;
                  const isBaseline = index === 0;
                  const delta = !isBaseline ? value - baselineRun[key] : 0;

                  return (
                    <TableCell
                      key={run.runId}
                      className={cn(
                        'text-center',
                        isBest && 'bg-opensearch-blue/5'
                      )}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn(
                          'font-medium',
                          isBest && 'text-opensearch-blue'
                        )}>
                          {value}%
                        </span>
                        {!isBaseline && delta !== 0 && (
                          <span className={cn('text-xs', getDeltaColorClass(delta))}>
                            {formatDelta(delta)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
