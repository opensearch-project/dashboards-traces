/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SpanDetailsPanel
 *
 * Panel showing selected span details including timing, attributes,
 * and LLM request/response data with formatted message display.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Layers, ChevronRight, ChevronDown, Info, MessageSquare, Bot, PieChart, AlertTriangle } from 'lucide-react';
import { Span, CategorizedSpan } from '@/types';
import { formatDuration, getKeyAttributes } from '@/services/traces/utils';
import { checkOTelCompliance } from '@/services/traces/spanCategorization';
import ContextWindowBar from './ContextWindowBar';
import FormattedMessages from './FormattedMessages';
import { ATTR_GEN_AI_USAGE_INPUT_TOKENS } from '@opentelemetry/semantic-conventions/incubating';

interface SpanDetailsPanelProps {
  span: Span;
  onClose: () => void;
}

const SpanDetailsPanel: React.FC<SpanDetailsPanelProps> = ({ span, onClose }) => {
  const [expandedSections, setExpandedSections] = useState({
    keyInfo: true,
    otelCompliance: true,
    contextWindow: true,
    modelInput: false,
    modelOutput: false,
    attributes: false
  });

  const spanDuration = new Date(span.endTime).getTime() - new Date(span.startTime).getTime();

  // Extract key attributes based on span type
  const keyAttrs = getKeyAttributes(span);

  // Check OTel compliance for categorized spans
  const otelCompliance = useMemo(() => {
    const categorizedSpan = span as CategorizedSpan;
    if (categorizedSpan.category) {
      return checkOTelCompliance(categorizedSpan);
    }
    return null;
  }, [span]);

  // Extract LLM events for prominent display
  const llmRequestEvent = span.events?.find(e => e.name === 'llm.request');
  const llmResponseEvent = span.events?.find(e => e.name === 'llm.response');

  // Get all attributes for the table
  const allAttributes = Object.entries(span.attributes || {});

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="h-full border-t flex flex-col overflow-hidden bg-muted/30" data-testid="span-details-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <h3 className="text-sm font-semibold truncate" data-testid="span-details-name">
            {span.name}
          </h3>
          <span className="text-[10px] font-mono text-muted-foreground truncate hidden sm:inline">
            {span.spanId}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose} data-testid="span-details-close">
          <X size={14} />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* KEY INFO SECTION */}
          <div className="space-y-2">
            <button
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-500 hover:text-indigo-400 w-full"
              onClick={() => toggleSection('keyInfo')}
            >
              {expandedSections.keyInfo ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Info size={10} /> Key Info
            </button>
            {expandedSections.keyInfo && (
              <div className="grid grid-cols-2 gap-2 text-xs bg-indigo-950/30 rounded-md p-3">
                {Object.entries(keyAttrs).filter(([_, v]) => v != null).map(([key, value]) => (
                  <div key={key}>
                    <div className="text-muted-foreground text-[10px]">{key}</div>
                    <div className="font-mono font-medium truncate" title={String(value)}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* OTEL COMPLIANCE SECTION - show warnings for missing attributes */}
          {otelCompliance && !otelCompliance.isCompliant && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-500 hover:text-amber-400 w-full"
                onClick={() => toggleSection('otelCompliance')}
              >
                {expandedSections.otelCompliance ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <AlertTriangle size={10} /> OTel Compliance
                <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 text-amber-400 border-amber-500/50">
                  {otelCompliance.missingAttributes.length} missing
                </Badge>
              </button>
              {expandedSections.otelCompliance && (
                <div className="bg-amber-950/30 rounded-md p-3 space-y-2">
                  <div className="text-[10px] text-amber-400/80">
                    Missing required OTel GenAI attributes:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {otelCompliance.missingAttributes.map((attr) => (
                      <Badge
                        key={attr}
                        variant="outline"
                        className="text-[9px] font-mono text-amber-400 border-amber-500/50 bg-amber-500/10"
                      >
                        {attr}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-[9px] text-muted-foreground mt-2">
                    <a
                      href="https://opentelemetry.io/docs/specs/semconv/gen-ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      View OTel GenAI Semantic Conventions →
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Timing section */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground text-[10px]">Duration</div>
              <div className="font-mono font-medium text-sm">{formatDuration(spanDuration)}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">Status</div>
              <Badge
                variant={span.status === 'ERROR' ? 'destructive' : span.status === 'OK' ? 'default' : 'secondary'}
                className="text-[10px]"
              >
                {span.status || 'UNSET'}
              </Badge>
            </div>
          </div>

          {/* CONTEXT WINDOW section - for LLM spans */}
          {llmRequestEvent && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-cyan-500 hover:text-cyan-400 w-full"
                onClick={() => toggleSection('contextWindow')}
              >
                {expandedSections.contextWindow ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <PieChart size={10} /> Context Window
              </button>
              {expandedSections.contextWindow && (
                <ContextWindowBar
                  systemPrompt={llmRequestEvent.attributes?.['llm.system_prompt'] || ''}
                  messages={llmRequestEvent.attributes?.['llm.prompt'] || ''}
                  toolCount={llmRequestEvent.attributes?.['bedrock.tool_count'] || 0}
                  actualInputTokens={span.attributes?.[ATTR_GEN_AI_USAGE_INPUT_TOKENS]}
                />
              )}
            </div>
          )}

          {/* MODEL INPUT section - for bedrock spans */}
          {llmRequestEvent && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-purple-500 hover:text-purple-400 w-full"
                onClick={() => toggleSection('modelInput')}
              >
                {expandedSections.modelInput ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <MessageSquare size={10} /> Model Input
              </button>
              {expandedSections.modelInput && (
                <div className="space-y-2">
                  {/* System Prompt */}
                  {llmRequestEvent.attributes?.['llm.system_prompt'] && (
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1">System Prompt</div>
                      <pre className="max-h-64 overflow-auto rounded-md border bg-slate-900 p-2 text-[10px] font-mono text-opensearch-blue whitespace-pre-wrap break-words">
                        {llmRequestEvent.attributes['llm.system_prompt']}
                      </pre>
                    </div>
                  )}
                  {/* User Prompt / Messages */}
                  {llmRequestEvent.attributes?.['llm.prompt'] && (
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1">Prompt / Messages</div>
                      <FormattedMessages messages={llmRequestEvent.attributes['llm.prompt']} />
                    </div>
                  )}
                  {/* Tool Count */}
                  {llmRequestEvent.attributes?.['bedrock.tool_count'] != null && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Tools Available:</span>{' '}
                      <span className="font-mono">{llmRequestEvent.attributes['bedrock.tool_count']}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MODEL OUTPUT section */}
          {llmResponseEvent && (
            <div className="space-y-2">
              <button
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-500 hover:text-blue-400 w-full"
                onClick={() => toggleSection('modelOutput')}
              >
                {expandedSections.modelOutput ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                <Bot size={10} /> Model Output
              </button>
              {expandedSections.modelOutput && (
                <div className="space-y-2">
                  {/* Completion */}
                  {llmResponseEvent.attributes?.['llm.completion'] && (
                    <div>
                      <div className="text-[9px] uppercase text-muted-foreground mb-1">Completion</div>
                      <FormattedMessages messages={llmResponseEvent.attributes['llm.completion']} />
                    </div>
                  )}
                  {/* Stop Reason */}
                  {llmResponseEvent.attributes?.['llm.stop_reason'] && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Stop Reason:</span>{' '}
                      <Badge variant="outline" className="text-[10px]">
                        {llmResponseEvent.attributes['llm.stop_reason']}
                      </Badge>
                    </div>
                  )}
                  {/* Tool Calls */}
                  {llmResponseEvent.attributes?.['bedrock.tool_calls_count'] != null && (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Tool Calls:</span>{' '}
                      <span className="font-mono">{llmResponseEvent.attributes['bedrock.tool_calls_count']}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ALL ATTRIBUTES */}
          <div className="space-y-2">
            <button
              className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground hover:text-foreground w-full"
              onClick={() => toggleSection('attributes')}
            >
              {expandedSections.attributes ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Layers size={10} /> All Attributes ({allAttributes.length})
            </button>
            {expandedSections.attributes && allAttributes.length > 0 && (
              <div className="max-h-[300px] overflow-auto rounded-md border">
                <table className="w-full text-[10px]">
                  <tbody>
                    {allAttributes.map(([key, value]) => (
                      <tr key={key} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground font-medium bg-muted/50 border-r max-w-[150px] truncate align-top" title={key}>
                          {key}
                        </td>
                        <td className="p-2 font-mono break-all">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default SpanDetailsPanel;
