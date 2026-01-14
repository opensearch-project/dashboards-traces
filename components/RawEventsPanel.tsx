/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { AGUIEvent, AGUIEventType } from '@/types/agui';

interface RawEventsPanelProps {
  events: AGUIEvent[];
}

/**
 * Generate a human-readable summary for an AG-UI event
 */
function getEventSummary(event: AGUIEvent): string {
  switch (event.type) {
    case AGUIEventType.RUN_STARTED:
      return `Run Started (runId: ${(event as any).runId?.substring(0, 8)}...)`;

    case AGUIEventType.RUN_FINISHED: {
      const result = (event as any).result;
      if (result?.tokenUsage) {
        return `Run Finished (tokens: ${result.tokenUsage.input}/${result.tokenUsage.output})`;
      }
      return 'Run Finished';
    }

    case AGUIEventType.RUN_ERROR:
      return `Error: ${(event as any).message || 'Unknown error'}`;

    case AGUIEventType.TEXT_MESSAGE_START:
      return `Message Started (role: ${(event as any).role || 'assistant'})`;

    case AGUIEventType.TEXT_MESSAGE_CONTENT: {
      const delta = (event as any).delta || '';
      const preview = delta.length > 50 ? delta.substring(0, 50) + '...' : delta;
      return `Text: "${preview}"`;
    }

    case AGUIEventType.TEXT_MESSAGE_END:
      return 'Message Ended';

    case AGUIEventType.TOOL_CALL_START:
      return `Tool Call: ${(event as any).toolCallName || 'unknown'}`;

    case AGUIEventType.TOOL_CALL_ARGS: {
      const args = (event as any).delta || '';
      const preview = args.length > 80 ? args.substring(0, 80) + '...' : args;
      return `Tool Args: ${preview}`;
    }

    case AGUIEventType.TOOL_CALL_RESULT: {
      const content = (event as any).content || '';
      const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
      return `Tool Result: ${preview}`;
    }

    case AGUIEventType.ACTIVITY_SNAPSHOT: {
      const title = (event as any).content?.title || 'Activity';
      return `Activity: ${title}`;
    }

    case AGUIEventType.ACTIVITY_DELTA: {
      const patch = (event as any).patch;
      if (Array.isArray(patch) && patch.length > 0) {
        const firstOp = patch[0];
        return `Activity Update: ${firstOp.op} ${firstOp.path}`;
      }
      return 'Activity Update';
    }

    default:
      return event.type;
  }
}

/**
 * Get color classes for event type badge
 */
function getEventTypeColor(type: string | undefined): string {
  if (!type) return 'text-gray-400 bg-gray-800';
  if (type.includes('ERROR')) return 'text-red-400 bg-red-900/30';
  if (type.includes('TOOL')) return 'text-blue-400 bg-blue-900/30';
  if (type.includes('TEXT')) return 'text-opensearch-blue bg-blue-900/30';
  if (type.includes('RUN')) return 'text-purple-400 bg-purple-900/30';
  if (type.includes('ACTIVITY')) return 'text-amber-400 bg-amber-900/30';
  return 'text-gray-400 bg-gray-800';
}

export const RawEventsPanel: React.FC<RawEventsPanelProps> = ({ events }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  // Filter events based on search term
  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return events;
    const term = searchTerm.toLowerCase();
    return events.filter((event, index) => {
      const summary = getEventSummary(event).toLowerCase();
      const json = JSON.stringify(event).toLowerCase();
      return summary.includes(term) || json.includes(term);
    });
  }, [events, searchTerm]);

  const toggleExpand = (index: number) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedEvents(new Set(filteredEvents.map((_, i) => i)));
  };

  const collapseAll = () => {
    setExpandedEvents(new Set());
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-3">
      <details className="group" open>
        <summary className="flex items-center justify-between cursor-pointer list-none">
          <div className="flex items-center text-[10px] font-bold text-gray-300 uppercase">
            <Terminal className="mr-1" size={10} />
            Raw AG UI Events
            <span className="ml-1.5 text-[10px] font-normal text-gray-500">
              ({filteredEvents.length}{searchTerm ? ` of ${events.length}` : ''} events)
            </span>
          </div>
          <span className="text-gray-500 group-open:rotate-180 transition-transform text-xs">▼</span>
        </summary>

        <div className="mt-3">
          {/* Search Input */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700 rounded pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:border-opensearch-blue focus:outline-none"
              />
            </div>
            <button
              onClick={expandAll}
              className="px-2 py-1.5 text-[10px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-2 py-1.5 text-[10px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
            >
              Collapse All
            </button>
          </div>

          {/* Events List */}
          <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
            {filteredEvents.map((event, index) => {
              const originalIndex = events.indexOf(event);
              const isExpanded = expandedEvents.has(index);
              const summary = getEventSummary(event);

              return (
                <div key={index} className="bg-gray-950 rounded border border-gray-800">
                  {/* Event Header */}
                  <button
                    onClick={() => toggleExpand(index)}
                    className="w-full flex items-start gap-2 p-2 text-left hover:bg-gray-900/50 transition-colors"
                  >
                    <span className="text-gray-500 text-[9px] font-mono w-6 flex-shrink-0">
                      #{originalIndex + 1}
                    </span>
                    {isExpanded ? (
                      <ChevronDown size={12} className="text-gray-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-gray-500 mt-0.5 flex-shrink-0" />
                    )}
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${getEventTypeColor(event.type)}`}>
                      {event.type || 'UNKNOWN'}
                    </span>
                    <span className="text-[10px] text-gray-300 flex-1 truncate">
                      {summary}
                    </span>
                  </button>

                  {/* Expanded JSON View */}
                  {isExpanded && (
                    <div className="border-t border-gray-800 p-2">
                      <pre className="text-[9px] text-gray-400 overflow-x-auto whitespace-pre-wrap font-mono bg-gray-900/50 p-2 rounded">
                        {JSON.stringify(event, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredEvents.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-xs">
                {searchTerm ? 'No events match your search' : 'No events captured'}
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
};
