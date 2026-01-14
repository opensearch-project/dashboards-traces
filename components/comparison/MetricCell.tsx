/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CheckCircle2, XCircle, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestCaseRunResult } from '@/types';

interface MetricCellProps {
  result: TestCaseRunResult;
  isBaseline?: boolean;
  baselineAccuracy?: number;
}

export const MetricCell: React.FC<MetricCellProps> = ({
  result,
  isBaseline = false,
  baselineAccuracy,
}) => {
  if (result.status === 'missing') {
    return (
      <div className="text-center py-2 text-muted-foreground">
        <Minus size={16} className="mx-auto mb-1 opacity-50" />
        <span className="text-xs">Not run</span>
      </div>
    );
  }

  const isPassed = result.passFailStatus === 'passed';
  const accuracy = result.accuracy ?? 0;

  // Calculate delta if not baseline and baseline value exists
  const delta = !isBaseline && baselineAccuracy !== undefined
    ? accuracy - baselineAccuracy
    : undefined;

  return (
    <div className="text-center py-2 px-2 group relative">
      {/* Pass/Fail Status */}
      <div
        className={cn(
          'inline-flex items-center gap-1.5 text-sm font-medium',
          isPassed ? 'text-opensearch-blue' : 'text-red-400'
        )}
      >
        {isPassed ? (
          <CheckCircle2 size={14} />
        ) : (
          <XCircle size={14} />
        )}
        <span>{isPassed ? 'Passed' : 'Failed'}</span>
      </div>

      {/* Accuracy with delta */}
      <div className="text-xs mt-1">
        <span className="text-muted-foreground">Acc: </span>
        <span className="font-medium">{accuracy}%</span>
        {delta !== undefined && delta !== 0 && (
          <span
            className={cn(
              'ml-1',
              delta > 0 ? 'text-opensearch-blue' : 'text-red-400'
            )}
          >
            ({delta > 0 ? '+' : ''}{delta})
          </span>
        )}
      </div>

    </div>
  );
};
