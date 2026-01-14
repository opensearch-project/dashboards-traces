/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EvaluationReport } from '@/types';
import { RunDetailsContent } from './RunDetailsContent';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface RunDetailsPanelProps {
  report: EvaluationReport;
  onClose: () => void;
}

export const RunDetailsPanel: React.FC<RunDetailsPanelProps> = ({ report, onClose }) => {
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0 gap-0">
        <RunDetailsContent report={report} />
      </DialogContent>
    </Dialog>
  );
};
