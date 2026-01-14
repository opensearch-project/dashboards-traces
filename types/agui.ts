/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AG UI Protocol Event Types
 *
 * Most types are imported directly from @ag-ui/core.
 * This file provides:
 * - AGUIEvent union type for type-safe event handling
 * - AGUIEventType alias for the EventType enum
 */

import { EventType } from '@ag-ui/core';
import type {
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  ThinkingStartEvent,
  ThinkingEndEvent,
  ThinkingTextMessageStartEvent,
  ThinkingTextMessageContentEvent,
  ThinkingTextMessageEndEvent,
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  StateSnapshotEvent,
  StateDeltaEvent,
  ActivitySnapshotEvent,
  ActivityDeltaEvent,
  MessagesSnapshotEvent,
} from '@ag-ui/core';

// Alias for EventType enum - used throughout the codebase
export const AGUIEventType = EventType;

// Union type for all AG UI events - used for type-safe event handling
export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ThinkingStartEvent
  | ThinkingEndEvent
  | ThinkingTextMessageStartEvent
  | ThinkingTextMessageContentEvent
  | ThinkingTextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | ActivitySnapshotEvent
  | ActivityDeltaEvent
  | MessagesSnapshotEvent;
