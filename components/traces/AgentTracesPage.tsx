/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AgentTracesPage - Agent Traces Table View
 *
 * Table-based view showing agent traces from OTEL data with:
 * - Table format with trace summaries
 * - Latency histogram distribution
 * - Flyout panel for detailed trace view
 * - Input/output display for spans following OTEL conventions
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  BarChart3,
  Filter,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Span, TraceSummary, TimeRange } from '@/types';
import { DEFAULT_CONFIG } from '@/lib/constants';
import {
  fetchRecentTraces,
  processSpansIntoTree,
  calculateTimeRange,
  groupSpansByTrace,
} from '@/services/traces';
import { formatDuration } from '@/services/traces/utils';
import TraceVisualization from './TraceVisualization';
import ViewToggle, { ViewMode } from './ViewToggle';
import { TraceFlyoutContent } from './TraceFlyoutContent';
import { LatencyHistogram } from './LatencyHistogram';

// ==================== Types ====================

interface TraceTableRow {
  traceId: string;
  rootSpanName: string;
  serviceName: string;
  startTime: Date;
  duration: number;
  spanCount: number;
  hasErrors: boolean;
  spans: Span[];
}

// ==================== Sub-Components ====================

interface TraceRowProps {
  trace: TraceTableRow;
  onSelect: () => void;
  isSelected: boolean;
}

const TraceRow: React.FC<TraceRowProps> = ({ trace, onSelect, isSelected }) => {
  return (
    <TableRow
      className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-muted/70' : ''}`}
      onClick={onSelect}
    >
      <TableCell className="font-mono text-xs">
        <div className="flex items-center gap-2">
          {trace.hasErrors ? (
            <XCircle size={14} className="text-red-400" />
          ) : (
            <CheckCircle2 size={14} className="text-green-400" />
          )}
          <span className="truncate max-w-[200px]" title={trace.traceId}>
            {trace.traceId.slice(0, 16)}...
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="truncate block max-w-[250px]" title={trace.rootSpanName}>
          {trace.rootSpanName}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-xs">
          {trace.serviceName || 'unknown'}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {trace.startTime.toLocaleString()}
      </TableCell>
      <TableCell>
        <span className={`font-mono text-xs ${trace.duration > 5000 ? 'text-amber-400' : 'text-muted-foreground'}`}>
          {formatDuration(trace.duration)}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary" className="text-xs">
          {trace.spanCount}
        </Badge>
      </TableCell>
      <TableCell>
        <ChevronRight size={16} className="text-muted-foreground" />
      </TableCell>
    </TableRow>
  );
};

// ==================== Main Component ====================

export const AgentTracesPage: React.FC = () => {
  // Filter state
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [textSearch, setTextSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [timeRange, setTimeRange] = useState<string>('1440'); // Default to 1 day

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Trace data
  const [spans, setSpans] = useState<Span[]>([]);
  const [traces, setTraces] = useState<TraceTableRow[]>([]);

  // Flyout state
  const [selectedTrace, setSelectedTrace] = useState<TraceTableRow | null>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [traceViewMode, setTraceViewMode] = useState<ViewMode>('timeline');

  // Get unique service names from agents config (no memo — recomputes when
  // parent App re-renders after refreshConfig(), keeping custom agents visible)
  const agentOptions = (() => {
    const agents = DEFAULT_CONFIG.agents
      .filter(a => a.enabled !== false)
      .map(a => ({ value: a.name, label: a.name }));
    return [{ value: 'all', label: 'All Agents' }, ...agents];
  })();

  // Time range options
  const timeRangeOptions = [
    { value: '15', label: 'Last 15 minutes' },
    { value: '60', label: 'Last hour' },
    { value: '180', label: 'Last 3 hours' },
    { value: '360', label: 'Last 6 hours' },
    { value: '720', label: 'Last 12 hours' },
    { value: '1440', label: 'Last 24 hours' },
    { value: '4320', label: 'Last 3 days' },
    { value: '10080', label: 'Last 7 days' },
  ];

  // Debounce text search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(textSearch);
    }, 500);
    return () => clearTimeout(timer);
  }, [textSearch]);

  // Convert spans to trace table rows
  const processSpansToTraces = useCallback((allSpans: Span[]): TraceTableRow[] => {
    const traceGroups = groupSpansByTrace(allSpans);

    return traceGroups.map(group => {
      const rootSpan = group.spans.find(s => !s.parentSpanId) || group.spans[0];
      const hasErrors = group.spans.some(s => s.status === 'ERROR');

      // Calculate duration from time range
      const times = group.spans.map(s => ({
        start: new Date(s.startTime).getTime(),
        end: new Date(s.endTime).getTime(),
      }));
      const minStart = Math.min(...times.map(t => t.start));
      const maxEnd = Math.max(...times.map(t => t.end));

      return {
        traceId: group.traceId,
        rootSpanName: rootSpan.name,
        serviceName: rootSpan.attributes?.['service.name'] || 'unknown',
        startTime: new Date(minStart),
        duration: maxEnd - minStart,
        spanCount: group.spans.length,
        hasErrors,
        spans: group.spans,
      };
    }).sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }, []);

  // Fetch traces
  const fetchTraces = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchRecentTraces({
        minutesAgo: parseInt(timeRange),
        serviceName: selectedAgent !== 'all' ? selectedAgent : undefined,
        textSearch: debouncedSearch || undefined,
        size: 1000,
      });

      setSpans(result.spans);
      setTraces(processSpansToTraces(result.spans));
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch traces');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAgent, debouncedSearch, timeRange, processSpansToTraces]);

  // Initial fetch and refetch on filter change
  useEffect(() => {
    fetchTraces();
  }, [fetchTraces]);

  // Handle trace selection
  const handleSelectTrace = (trace: TraceTableRow) => {
    setSelectedTrace(trace);
    setFlyoutOpen(true);
  };

  // Close flyout
  const handleCloseFlyout = () => {
    setFlyoutOpen(false);
    setSelectedTrace(null);
  };

  // Calculate latency distribution for histogram
  const latencyDistribution = useMemo(() => {
    if (traces.length === 0) return [];

    // Create buckets for histogram
    const buckets = [
      { label: '<100ms', min: 0, max: 100, count: 0 },
      { label: '100-500ms', min: 100, max: 500, count: 0 },
      { label: '500ms-1s', min: 500, max: 1000, count: 0 },
      { label: '1-5s', min: 1000, max: 5000, count: 0 },
      { label: '5-10s', min: 5000, max: 10000, count: 0 },
      { label: '>10s', min: 10000, max: Infinity, count: 0 },
    ];

    traces.forEach(trace => {
      const bucket = buckets.find(b => trace.duration >= b.min && trace.duration < b.max);
      if (bucket) bucket.count++;
    });

    return buckets;
  }, [traces]);

  // Calculate stats
  const stats = useMemo(() => {
    if (traces.length === 0) return { total: 0, errors: 0, avgDuration: 0 };

    const errors = traces.filter(t => t.hasErrors).length;
    const avgDuration = traces.reduce((sum, t) => sum + t.duration, 0) / traces.length;

    return {
      total: traces.length,
      errors,
      avgDuration,
    };
  }, [traces]);

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Agent Traces</h2>
          <p className="text-xs text-muted-foreground mt-1">
            View and analyze agent execution traces from OTEL instrumentation
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTraces}
            disabled={isLoading}
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Traces</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Activity className="text-opensearch-blue" size={24} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Error Rate</p>
                <p className="text-2xl font-bold text-red-400">
                  {stats.total > 0 ? ((stats.errors / stats.total) * 100).toFixed(1) : 0}%
                </p>
              </div>
              <AlertCircle className="text-red-400" size={24} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Duration</p>
                <p className="text-2xl font-bold text-amber-400">
                  {formatDuration(stats.avgDuration)}
                </p>
              </div>
              <Clock className="text-amber-400" size={24} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Spans</p>
                <p className="text-2xl font-bold text-purple-400">{spans.length}</p>
              </div>
              <BarChart3 className="text-purple-400" size={24} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex gap-4 items-end">
            {/* Time Range */}
            <div className="w-48 space-y-1.5">
              <label className="text-xs text-muted-foreground">Time Range</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent Filter */}
            <div className="w-48 space-y-1.5">
              <label className="text-xs text-muted-foreground">Agent</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {agentOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Text Search */}
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search trace IDs, span names, attributes..."
                  value={textSearch}
                  onChange={(e) => setTextSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Latency Histogram */}
      {traces.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 size={14} />
              Latency Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <LatencyHistogram data={latencyDistribution} />
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Card className="mb-4 bg-red-500/10 border-red-500/30">
          <CardContent className="p-4 text-sm text-red-400">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Traces Table */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-2 px-4 border-b">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity size={14} />
            Traces
            <Badge variant="secondary" className="ml-2">{traces.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-auto">
          {traces.length === 0 && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-12">
              <Activity size={48} className="mb-4 opacity-20" />
              <p>No traces found</p>
              <p className="text-sm mt-1">
                {selectedAgent !== 'all' || textSearch
                  ? 'Try adjusting your filters'
                  : 'Traces will appear here as agents execute'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Trace ID</TableHead>
                  <TableHead>Root Span</TableHead>
                  <TableHead className="w-[120px]">Service</TableHead>
                  <TableHead className="w-[180px]">Start Time</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[80px] text-center">Spans</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traces.map(trace => (
                  <TraceRow
                    key={trace.traceId}
                    trace={trace}
                    onSelect={() => handleSelectTrace(trace)}
                    isSelected={selectedTrace?.traceId === trace.traceId}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Trace Detail Flyout */}
      <Sheet open={flyoutOpen} onOpenChange={setFlyoutOpen}>
        <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0 overflow-hidden">
          {selectedTrace && (
            <TraceFlyoutContent
              trace={selectedTrace}
              onClose={handleCloseFlyout}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AgentTracesPage;
