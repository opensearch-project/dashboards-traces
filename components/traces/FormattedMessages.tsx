/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * FormattedMessages
 *
 * Displays LLM messages with role-based styling.
 * Supports toggle between formatted and raw JSON views.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Code, AlignLeft } from 'lucide-react';
import { safeParseJSON } from '@/services/traces/utils';

interface FormattedMessagesProps {
  messages: string | object;
}

interface Message {
  role?: string;
  content?: string | ContentBlock[];
}

interface ContentBlock {
  type?: string;
  text?: string;
  toolUse?: {
    toolUseId?: string;
    name?: string;
    input?: object;
  };
  toolResult?: {
    toolUseId?: string;
    content?: string | ContentBlock[];
    status?: string;
  };
}

const FormattedMessages: React.FC<FormattedMessagesProps> = ({ messages }) => {
  const [showRaw, setShowRaw] = useState(false);

  // Parse messages if string
  const parsedMessages = useMemo(() => {
    if (!messages) return [];
    if (typeof messages === 'string') {
      const parsed = safeParseJSON(messages);
      if (Array.isArray(parsed)) return parsed;
      return [{ content: messages }];
    }
    if (Array.isArray(messages)) return messages;
    return [messages];
  }, [messages]);

  const rawJson = useMemo(() => {
    try {
      return JSON.stringify(
        typeof messages === 'string' ? safeParseJSON(messages) : messages,
        null,
        2
      );
    } catch {
      return String(messages);
    }
  }, [messages]);

  const getRoleColor = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'user':
        return 'text-blue-400 bg-blue-950/30';
      case 'assistant':
        return 'text-blue-400 bg-blue-950/30';
      case 'system':
        return 'text-purple-400 bg-purple-950/30';
      default:
        return 'text-muted-foreground bg-muted/30';
    }
  };

  const renderContent = (content: string | ContentBlock[] | undefined) => {
    if (!content) return null;

    if (typeof content === 'string') {
      return <span className="whitespace-pre-wrap">{content}</span>;
    }

    return content.map((block, idx) => {
      if (block.type === 'text' || block.text) {
        return (
          <span key={idx} className="whitespace-pre-wrap">
            {block.text}
          </span>
        );
      }

      if (block.type === 'toolUse' || block.toolUse) {
        const tool = block.toolUse || block;
        return (
          <div key={idx} className="my-1 p-2 rounded bg-amber-950/30 border border-amber-800/50">
            <div className="text-[10px] text-amber-400 font-semibold mb-1">
              Tool: {(tool as any).name || 'unknown'}
            </div>
            <pre className="text-[9px] text-amber-200/80 overflow-auto max-h-32">
              {JSON.stringify((tool as any).input, null, 2)}
            </pre>
          </div>
        );
      }

      if (block.type === 'toolResult' || block.toolResult) {
        const result = block.toolResult || block;
        return (
          <div key={idx} className="my-1 p-2 rounded bg-cyan-950/30 border border-cyan-800/50">
            <div className="text-[10px] text-cyan-400 font-semibold mb-1">
              Tool Result
            </div>
            <pre className="text-[9px] text-cyan-200/80 overflow-auto max-h-32">
              {typeof (result as any).content === 'string'
                ? (result as any).content
                : JSON.stringify((result as any).content, null, 2)}
            </pre>
          </div>
        );
      }

      return (
        <pre key={idx} className="text-[9px] overflow-auto">
          {JSON.stringify(block, null, 2)}
        </pre>
      );
    });
  };

  return (
    <div className="space-y-2">
      {/* Toggle button */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px]"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? (
            <>
              <AlignLeft size={12} className="mr-1" /> Formatted
            </>
          ) : (
            <>
              <Code size={12} className="mr-1" /> Raw JSON
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      {showRaw ? (
        <pre className="max-h-96 overflow-auto rounded-md border bg-slate-900 p-2 text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-words">
          {rawJson}
        </pre>
      ) : (
        <div className="space-y-2 max-h-96 overflow-auto">
          {parsedMessages.map((msg: Message, idx: number) => (
            <div
              key={idx}
              className={`p-2 rounded-md border text-xs ${getRoleColor(msg.role)}`}
            >
              {msg.role && (
                <div className="text-[9px] font-bold uppercase mb-1 opacity-70">
                  {msg.role}
                </div>
              )}
              <div className="font-mono text-[11px] leading-relaxed">
                {renderContent(msg.content)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FormattedMessages;
