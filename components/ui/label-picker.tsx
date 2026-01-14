/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn, getLabelColor } from '@/lib/utils';

interface LabelPickerProps {
  value: string[];
  onChange: (labels: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export const LabelPicker: React.FC<LabelPickerProps> = ({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Add labels...',
  disabled = false,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input and already selected values
  const filteredSuggestions = useMemo(() => {
    const searchTerm = inputValue.toLowerCase();

    // Filter out already selected labels
    let available = suggestions.filter(s => !value.includes(s));

    // Filter by search term
    if (searchTerm) {
      available = available.filter(s => s.toLowerCase().includes(searchTerm));
    }

    return available;
  }, [suggestions, value, inputValue]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addLabel = (label: string) => {
    if (label && !value.includes(label)) {
      onChange([...value, label]);
    }
    setInputValue('');
  };

  const removeLabel = (label: string) => {
    onChange(value.filter((l) => l !== label));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addLabel(inputValue.trim());
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last label on backspace when input is empty
      removeLabel(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  // Check if current input could create a new label
  const canCreateNew = inputValue.trim() && !suggestions.includes(inputValue.trim()) && !value.includes(inputValue.trim());

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Selected labels and input */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-1 p-2 border rounded-md bg-background min-h-[40px]',
          'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((label) => (
          <Badge
            key={label}
            variant="outline"
            className={cn('flex items-center gap-1 pr-1', getLabelColor(label))}
          >
            <span>{label}</span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLabel(label);
                }}
                className="ml-1 hover:bg-background/20 rounded-full p-0.5"
              >
                <X size={12} />
              </button>
            )}
          </Badge>
        ))}
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={handleInputFocus}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[120px] border-0 p-0 h-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Dropdown suggestions - flat list */}
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-auto">
          {filteredSuggestions.length > 0 ? (
            <div className="p-1">
              {filteredSuggestions.slice(0, 20).map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => addLabel(label)}
                  className="flex items-center w-full px-2 py-1.5 text-sm text-left hover:bg-accent rounded"
                >
                  <Badge
                    variant="outline"
                    className={cn('text-xs', getLabelColor(label))}
                  >
                    {label}
                  </Badge>
                </button>
              ))}
              {filteredSuggestions.length > 20 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  +{filteredSuggestions.length - 20} more...
                </div>
              )}
            </div>
          ) : null}

          {/* Create new option */}
          {canCreateNew && (
            <div className={cn('p-1', filteredSuggestions.length > 0 && 'border-t')}>
              <button
                type="button"
                onClick={() => addLabel(inputValue.trim())}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm text-left hover:bg-accent rounded"
              >
                <Plus size={14} />
                <span>Create "{inputValue.trim()}"</span>
              </button>
            </div>
          )}

          {/* Empty state */}
          {filteredSuggestions.length === 0 && !canCreateNew && (
            <div className="p-3 text-sm text-muted-foreground text-center">
              Type to search or create labels
            </div>
          )}
        </div>
      )}
    </div>
  );
};
