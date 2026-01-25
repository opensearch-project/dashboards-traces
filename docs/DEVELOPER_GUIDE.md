<!--
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
-->

# Developer Guide

This guide provides in-depth information for developers working on AgentEval. It covers architecture, data flow, development workflows, and best practices.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Concepts](#core-concepts)
3. [Data Model](#data-model)
4. [Service Layer](#service-layer)
5. [API Reference](#api-reference)
6. [Development Workflows](#development-workflows)
7. [Extending AgentEval](#extending-agenteval)
8. [Testing Guide](#testing-guide)
9. [Debugging](#debugging)
10. [Performance Considerations](#performance-considerations)

---

## Architecture Overview

AgentEval follows a layered architecture with clear separation between frontend, backend, and external services.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser (React UI)                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Dashboard  │  │ Test Cases  │  │ Benchmarks  │  │   Trace Viewer      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                │                │                     │           │
│  ┌──────┴────────────────┴────────────────┴─────────────────────┴─────────┐ │
│  │                    React Hooks & Client Services                        │ │
│  │          (services/client/, hooks/, services/evaluation/)               │ │
│  └─────────────────────────────────┬───────────────────────────────────────┘ │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │ HTTP / SSE
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Express Backend (Port 4001)                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                           API Routes Layer                               │ │
│  │   /api/agent   /api/judge   /api/storage/*   /api/traces   /api/logs    │ │
│  └──────┬───────────────┬─────────────┬───────────────┬─────────────┬──────┘ │
│         │               │             │               │             │        │
│  ┌──────┴───────────────┴─────────────┴───────────────┴─────────────┴──────┐ │
│  │                        Backend Services Layer                            │ │
│  │  agentService   bedrockService   storageService   tracesService          │ │
│  └──────┬───────────────┬─────────────┬───────────────┬─────────────────────┘ │
└─────────┼───────────────┼─────────────┼───────────────┼─────────────────────┘
          │               │             │               │
          ▼               ▼             ▼               ▼
    ┌───────────┐   ┌───────────┐ ┌───────────┐  ┌───────────┐
    │   Agent   │   │   AWS     │ │ OpenSearch│  │ OpenSearch│
    │ Endpoints │   │  Bedrock  │ │  Storage  │  │   Traces  │
    │(LangGraph,│   │   (LLM    │ │  Cluster  │  │  Cluster  │
    │ML-Commons,│   │   Judge)  │ │           │  │           │
    │ HolmesGPT)│   └───────────┘ └───────────┘  └───────────┘
    └───────────┘
```

### Request Flow

#### Evaluation Execution Flow

```
User clicks "Run Evaluation"
         │
         ▼
┌─────────────────────────────┐
│  Frontend: RunDetailsPage   │
│  Calls runEvaluation()      │
└──────────────┬──────────────┘
               │ POST /api/agent/stream
               ▼
┌─────────────────────────────┐
│  Backend: agent.ts route    │
│  Proxies request to agent   │
└──────────────┬──────────────┘
               │ SSE Stream
               ▼
┌─────────────────────────────┐
│  Agent Endpoint (e.g.,      │
│  ML-Commons, LangGraph)     │
│  Executes reasoning loop    │
└──────────────┬──────────────┘
               │ AG-UI Events
               ▼
┌─────────────────────────────┐
│  Backend: Relays SSE events │
│  to frontend                │
└──────────────┬──────────────┘
               │ AG-UI Events
               ▼
┌─────────────────────────────┐
│  Frontend: AGUIConverter    │
│  Converts to TrajectoryStep │
└──────────────┬──────────────┘
               │ Trajectory complete
               ▼
┌─────────────────────────────┐
│  Frontend: Calls judge      │
│  POST /api/judge            │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Backend: bedrockService    │
│  Calls AWS Bedrock LLM      │
└──────────────┬──────────────┘
               │ Judge result
               ▼
┌─────────────────────────────┐
│  Frontend: Displays result  │
│  Saves to storage           │
└─────────────────────────────┘
```

### Port Configuration

| Mode | Frontend | Backend | Notes |
|------|----------|---------|-------|
| Development | 4000 (Vite) | 4001 (Express) | Vite proxies `/api` to 4001 |
| Production | N/A | 4001 | Express serves static + API |

---

## Core Concepts

### Test Case (Use Case)

A **Test Case** represents a single evaluation scenario. In the UI, these are called "Use Cases."

```typescript
interface TestCase {
  id: string;              // System-generated: tc-{timestamp}-{random}
  name: string;            // Human-readable name
  description: string;     // Detailed description
  labels: string[];        // Tags: ["category:RCA", "difficulty:Medium"]
  currentVersion: number;  // Latest version number
  versions: TestCaseVersion[];  // Immutable version history
  isPromoted: boolean;     // Available for benchmarks
  initialPrompt: string;   // Question asked to agent
  context: AgentContextItem[];  // Supporting data
  expectedOutcomes: string[];   // What agent should discover
  tools?: AgentToolDefinition[];
  createdAt: string;
  updatedAt: string;
}
```

**Key behaviors:**
- Versions are immutable - each edit creates a new version
- `currentVersion` always points to the latest version
- `isPromoted` controls visibility in benchmark test case selection

### Benchmark (Experiment)

A **Benchmark** is a collection of test cases for batch evaluation. In the UI, these are called "Experiments."

```typescript
interface Benchmark {
  id: string;              // System-generated: bench-{timestamp}-{random}
  name: string;            // Human-readable name
  description: string;     // Purpose of the benchmark
  testCaseIds: string[];   // References to test case IDs
  runs: BenchmarkRun[];    // Embedded run configurations and results
  versions?: BenchmarkVersion[];  // Optional version history
  createdAt: string;
  updatedAt: string;
}
```

### Benchmark Run

A **Run** is a point-in-time snapshot of benchmark execution with specific agent/model configuration.

```typescript
interface BenchmarkRun {
  id: string;              // System-generated: run-{timestamp}-{random}
  name: string;            // e.g., "Baseline", "v2-improved-prompt"
  agentId: string;         // Agent used (e.g., "langgraph")
  modelId: string;         // Model used (e.g., "claude-sonnet-4.5")
  status: RunStatus;       // pending | running | completed | failed | cancelled
  results: Record<string, RunResult>;  // testCaseId -> result
  createdAt: string;
  completedAt?: string;
}

interface RunResult {
  reportId: string;        // References TestCaseRun.id
  status: RunResultStatus; // pending | running | completed | failed
}
```

### TestCaseRun (Evaluation Report)

A **TestCaseRun** contains the full result of evaluating a single test case.

```typescript
interface TestCaseRun {
  id: string;              // System-generated: report-{timestamp}-{random}
  testCaseId: string;      // Which test case was evaluated
  experimentId?: string;   // Which benchmark (if part of batch)
  agentName: string;       // Agent display name
  modelName: string;       // Model display name
  status: 'running' | 'completed' | 'failed';
  passFailStatus?: 'passed' | 'failed';  // Judge verdict
  trajectory: TrajectoryStep[];  // Agent execution steps
  metrics: EvaluationMetrics;    // Performance metrics
  llmJudgeReasoning: string;     // Judge's explanation
  improvementStrategies?: ImprovementStrategy[];
  createdAt: string;
}
```

### Trajectory

A **Trajectory** is the sequence of steps taken by an agent during execution.

```typescript
interface TrajectoryStep {
  id: string;
  timestamp: number;
  type: 'thinking' | 'action' | 'tool_result' | 'assistant' | 'response';
  content: string;
  toolName?: string;       // For 'action' type
  toolArgs?: Record<string, any>;
  status?: 'SUCCESS' | 'FAILURE';  // For 'tool_result' type
}
```

**Step types:**
| Type | Description | Example |
|------|-------------|---------|
| `thinking` | Internal reasoning | "I need to check the error logs..." |
| `action` | Tool invocation | `{ toolName: "search_logs", toolArgs: {...} }` |
| `tool_result` | Tool output | "Found 5 error entries..." |
| `assistant` | Intermediate message | "Let me analyze these results..." |
| `response` | Final conclusion | "The root cause is..." |

---

## Data Model

### Entity Relationships

```
┌─────────────────┐         ┌─────────────────┐
│    Benchmark    │         │    TestCase     │
│  (Experiment)   │────────>│   (Use Case)    │
│                 │  refs   │                 │
│ testCaseIds[]   │         │ id, versions[]  │
│ runs[]          │         └─────────────────┘
└────────┬────────┘                  ▲
         │                           │
         │ embeds                    │ refs
         ▼                           │
┌─────────────────┐         ┌───────┴─────────┐
│  BenchmarkRun   │         │  TestCaseRun    │
│                 │────────>│   (Report)      │
│ results[tcId]   │  refs   │                 │
│   .reportId     │         │ testCaseId      │
└─────────────────┘         │ experimentId    │
                            │ trajectory[]    │
                            └─────────────────┘
```

### OpenSearch Indexes

| Index | Document ID | Entity |
|-------|-------------|--------|
| `evals_test_cases` | `{testCaseId}-v{version}` | TestCase (per version) |
| `evals_benchmarks` | `{benchmarkId}` | Benchmark (with embedded runs) |
| `evals_runs` | `{reportId}` | TestCaseRun |
| `evals_analytics` | `analytics-{runId}` | Aggregate analytics |

### Versioning Strategy

| Entity | Strategy | Storage |
|--------|----------|---------|
| TestCase | New document per version | `{id}-v{n}` |
| Benchmark | Selective (only on testCaseIds change) | Single doc, versions array |
| BenchmarkRun | Not versioned | Embedded in benchmark |

---

## Service Layer

### Frontend Services (`services/`)

#### Agent Services (`services/agent/`)

**sseStream.ts** - SSE connection management
```typescript
// Consume SSE stream from agent
async function* consumeSSEStream(
  url: string,
  body: object,
  signal?: AbortSignal
): AsyncGenerator<AGUIEvent> {
  // Handles connection, buffering, parsing
}
```

**aguiConverter.ts** - AG-UI event conversion
```typescript
class AGUIToTrajectoryConverter {
  // Converts AG-UI protocol events to TrajectoryStep[]
  processEvent(event: AGUIEvent): TrajectoryStep | null;
  getTrajectory(): TrajectoryStep[];
}
```

**payloadBuilder.ts** - Request payload construction
```typescript
function buildAgentPayload(
  testCase: TestCase,
  agentConfig: AgentConfig
): AgentPayload;
```

#### Evaluation Services (`services/evaluation/`)

**index.ts** - Main orchestrator
```typescript
async function runEvaluation(
  testCase: TestCase,
  agentConfig: AgentConfig,
  modelConfig: ModelConfig,
  options?: EvaluationOptions
): Promise<TestCaseRun>;
```

**bedrockJudge.ts** - Judge API client
```typescript
async function callBedrockJudge(
  trajectory: TrajectoryStep[],
  expectedOutcomes: string[],
  options?: JudgeOptions
): Promise<JudgeResult>;
```

#### Storage Services (`services/storage/`)

All storage services follow the async wrapper pattern:

```typescript
class AsyncTestCaseStorage {
  async getAll(): Promise<TestCase[]>;
  async getById(id: string): Promise<TestCase | null>;
  async create(input: TestCaseInput): Promise<TestCase>;
  async update(id: string, updates: Partial<TestCase>): Promise<TestCase>;
  async delete(id: string): Promise<void>;
}
```

### Backend Services (`server/services/`)

**bedrockService.ts** - AWS Bedrock API
```typescript
async function invokeBedrockModel(
  modelId: string,
  prompt: string,
  options?: BedrockOptions
): Promise<BedrockResponse>;
```

**agentService.ts** - Agent proxy
```typescript
async function streamAgentExecution(
  endpoint: string,
  payload: object,
  headers: Record<string, string>
): AsyncGenerator<SSEEvent>;
```

**tracesService.ts** - Trace fetching
```typescript
async function fetchTraces(
  traceIds: string[],
  options?: TraceOptions
): Promise<Trace[]>;
```

---

## API Reference

### Agent API

#### Stream Agent Execution
```http
POST /api/agent/stream
Content-Type: application/json

{
  "agentId": "langgraph",
  "payload": {
    "prompt": "What is causing the latency spike?",
    "context": [...]
  }
}

Response: Server-Sent Events stream
event: message
data: {"type": "TEXT_MESSAGE_START", "messageId": "..."}

event: message
data: {"type": "TEXT_MESSAGE_CONTENT", "delta": "Let me analyze..."}

event: message
data: {"type": "TOOL_CALL_START", "toolName": "search_logs", ...}
```

### Judge API

#### Evaluate Trajectory
```http
POST /api/judge
Content-Type: application/json

{
  "trajectory": [
    {"type": "thinking", "content": "..."},
    {"type": "action", "toolName": "search", ...},
    ...
  ],
  "expectedOutcomes": [
    "Identify the service causing issues",
    "Determine the root cause"
  ],
  "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

Response:
{
  "passFailStatus": "passed",
  "accuracy": 0.85,
  "reasoning": "The agent correctly identified...",
  "improvementStrategies": [
    {
      "priority": "high",
      "category": "tool_usage",
      "suggestion": "Consider using more specific queries..."
    }
  ]
}
```

### Storage API

#### Test Cases
```http
GET    /api/storage/test-cases           # List all
GET    /api/storage/test-cases/:id       # Get by ID
POST   /api/storage/test-cases           # Create
PUT    /api/storage/test-cases/:id       # Update
DELETE /api/storage/test-cases/:id       # Delete
```

#### Benchmarks
```http
GET    /api/storage/benchmarks           # List all
GET    /api/storage/benchmarks/:id       # Get by ID
POST   /api/storage/benchmarks           # Create
PUT    /api/storage/benchmarks/:id       # Update
DELETE /api/storage/benchmarks/:id       # Delete

POST   /api/storage/benchmarks/:id/runs  # Add run to benchmark
PUT    /api/storage/benchmarks/:id/runs/:runId  # Update run
```

#### Runs (TestCaseRuns)
```http
GET    /api/storage/runs                 # List all
GET    /api/storage/runs/:id             # Get by ID
GET    /api/storage/runs/by-test-case/:testCaseId  # By test case
POST   /api/storage/runs                 # Create
```

### Traces API

```http
GET /api/traces?traceId=abc123           # Single trace
GET /api/traces?runIds=run1,run2         # Multiple by run IDs
GET /api/traces/health                   # Health check

Response:
{
  "traces": [
    {
      "traceId": "abc123",
      "spans": [
        {
          "spanId": "span1",
          "operationName": "agent.execute",
          "startTime": 1700000000000,
          "duration": 5000,
          "tags": {...}
        }
      ]
    }
  ]
}
```

### Metrics API

```http
GET /api/metrics?runId=run123

Response:
{
  "tokenUsage": {
    "inputTokens": 1500,
    "outputTokens": 800,
    "totalTokens": 2300
  },
  "cost": {
    "inputCost": 0.015,
    "outputCost": 0.024,
    "totalCost": 0.039
  },
  "latency": {
    "totalMs": 5230,
    "llmMs": 4100,
    "toolMs": 1130
  }
}
```

---

## Development Workflows

### Setting Up Development Environment

```bash
# 1. Clone repository
git clone https://github.com/opensearch-project/dashboards-traces.git
cd dashboards-traces

# 2. Install dependencies
npm install

# 3. Create environment file
cp .env.example .env
# Edit .env with your AWS credentials

# 4. Start development servers (two terminals)
# Terminal 1: Backend
npm run dev:server

# Terminal 2: Frontend
npm run dev

# 5. Open browser
open http://localhost:4000
```

### Adding a New API Route

1. **Create route file** in `server/routes/`:
```typescript
// server/routes/myFeature.ts
import { Router } from 'express';

const router = Router();

router.get('/my-endpoint', async (req, res) => {
  try {
    const result = await myService.getData();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

2. **Register route** in `server/app.ts`:
```typescript
import myFeatureRoutes from './routes/myFeature';

app.use('/api/my-feature', myFeatureRoutes);
```

3. **Create client service** in `services/client/`:
```typescript
// services/client/myFeatureClient.ts
export async function fetchMyData(): Promise<MyData> {
  const response = await fetch('/api/my-feature/my-endpoint');
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}
```

### Adding a New React Component

1. **Create component file**:
```typescript
// components/MyComponent.tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

interface MyComponentProps {
  id: string;
}

export function MyComponent({ id }: MyComponentProps) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData(id)
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>Not found</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{data.name}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Component content */}
      </CardContent>
    </Card>
  );
}
```

2. **Add route** in `App.tsx` if needed:
```typescript
<Route path="/my-feature/:id" element={<MyComponent />} />
```

### Working with SSE Streams

**Backend (Express):**
```typescript
router.post('/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const event of generateEvents()) {
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    res.write(`event: done\ndata: {}\n\n`);
  } catch (error) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
});
```

**Frontend (consumption):**
```typescript
async function* consumeStream(url: string, body: object) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const chunk of lines) {
      if (chunk.startsWith('data: ')) {
        const data = JSON.parse(chunk.slice(6));
        yield data;
      }
    }
  }
}
```

---

## Extending AgentEval

### Adding a New Agent Type

1. **Add agent configuration** in `lib/constants.ts`:
```typescript
export const DEFAULT_CONFIG = {
  agents: [
    // ... existing agents
    {
      key: "my-agent",
      name: "My Custom Agent",
      endpoint: "http://localhost:8000/agent",
      description: "Custom agent for specific use case",
      models: ["claude-sonnet-4.5", "claude-haiku-3.5"],
      headers: {
        "X-Custom-Header": "value"
      }
    }
  ]
};
```

2. **Update agent service** if special handling needed:
```typescript
// server/services/agentService.ts
function buildAgentRequest(agentKey: string, payload: object) {
  if (agentKey === 'my-agent') {
    // Custom payload transformation
    return {
      ...payload,
      customField: "value"
    };
  }
  return payload;
}
```

3. **Add environment variable** (optional):
```bash
# .env.example
MY_AGENT_ENDPOINT=http://localhost:8000/agent
```

### Adding a New Model

1. **Add model configuration** in `lib/constants.ts`:
```typescript
export const DEFAULT_CONFIG = {
  models: {
    // ... existing models
    "my-model": {
      model_id: "provider.model-name-v1",
      display_name: "My Model",
      context_window: 128000,
      max_output_tokens: 4096,
      pricing: {
        input_per_1k: 0.003,
        output_per_1k: 0.015
      }
    }
  }
};
```

2. **Add to agent's model list**:
```typescript
agents: [
  {
    key: "langgraph",
    models: ["claude-sonnet-4.5", "my-model"]  // Add here
  }
]
```

### Adding a New Label Type

Labels use a unified format: `category:value`

1. **Define label constants** in `lib/labels.ts`:
```typescript
export const LABEL_CATEGORIES = {
  category: ['RCA', 'Performance', 'Security', 'MyCategory'],
  difficulty: ['Easy', 'Medium', 'Hard'],
  priority: ['Low', 'Medium', 'High', 'Critical']  // New category
};

export function parseLabel(label: string): { category: string; value: string } {
  const [category, value] = label.split(':');
  return { category, value };
}
```

2. **Update UI components** to display the new label type.

### Custom Judge Prompts

Judge prompts are in `server/prompts/`:

1. **Create custom prompt**:
```typescript
// server/prompts/myJudgePrompt.ts
export const MY_JUDGE_PROMPT = `
You are evaluating an agent's performance on {task_type}.

## Evaluation Criteria
1. Accuracy of findings
2. Completeness of analysis
3. Quality of recommendations

## Trajectory
{trajectory}

## Expected Outcomes
{expected_outcomes}

Provide your evaluation in JSON format:
{
  "passFailStatus": "passed" | "failed",
  "accuracy": 0.0-1.0,
  "reasoning": "detailed explanation"
}
`;
```

2. **Use in judge service**:
```typescript
// server/services/bedrockService.ts
import { MY_JUDGE_PROMPT } from '../prompts/myJudgePrompt';

function getPromptForTestCase(testCase: TestCase) {
  if (testCase.labels.includes('category:MyCategory')) {
    return MY_JUDGE_PROMPT;
  }
  return DEFAULT_JUDGE_PROMPT;
}
```

---

## Testing Guide

### Test Structure

```
tests/
├── unit/                    # Mock all dependencies
│   ├── server/
│   │   ├── routes/          # API route tests
│   │   └── services/        # Backend service tests
│   ├── services/            # Frontend service tests
│   │   ├── agent/
│   │   ├── evaluation/
│   │   └── storage/
│   └── lib/                 # Utility tests
└── integration/             # Real services
    └── services/
        ├── storage/         # OpenSearch integration
        └── traces/          # Trace service integration
```

### Writing Unit Tests

```typescript
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { myFunction } from '@/services/myService';

// Mock dependencies
jest.mock('@/services/storage/opensearchClient', () => ({
  testCaseStorage: {
    getById: jest.fn(),
  },
}));

describe('myFunction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle normal case', async () => {
    // Arrange
    const mockData = { id: '1', name: 'Test' };
    (testCaseStorage.getById as jest.Mock).mockResolvedValue(mockData);

    // Act
    const result = await myFunction('1');

    // Assert
    expect(result).toEqual(mockData);
    expect(testCaseStorage.getById).toHaveBeenCalledWith('1');
  });

  it('should handle error case', async () => {
    // Arrange
    (testCaseStorage.getById as jest.Mock).mockRejectedValue(new Error('Not found'));

    // Act & Assert
    await expect(myFunction('invalid')).rejects.toThrow('Not found');
  });
});
```

### Writing Integration Tests

```typescript
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncTestCaseStorage } from '@/services/storage/asyncTestCaseStorage';

describe('AsyncTestCaseStorage Integration', () => {
  let storage: AsyncTestCaseStorage;

  beforeAll(async () => {
    // Setup real OpenSearch connection
    storage = new AsyncTestCaseStorage(getTestConfig());
    await storage.initialize();
  });

  afterAll(async () => {
    // Cleanup test data
    await storage.cleanup();
  });

  it('should create and retrieve test case', async () => {
    const input = {
      name: 'Integration Test Case',
      description: 'Test description',
      initialPrompt: 'Test prompt',
    };

    const created = await storage.create(input);
    expect(created.id).toBeDefined();

    const retrieved = await storage.getById(created.id);
    expect(retrieved?.name).toBe(input.name);
  });
});
```

### Running Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage
npm test -- --coverage

# Specific file
npm test -- tests/unit/services/evaluation/index.test.ts

# Watch mode
npm test -- --watch

# By pattern
npm test -- --testNamePattern="should handle"
```

### Coverage Requirements

| Metric | Threshold |
|--------|-----------|
| Lines | 90% |
| Statements | 90% |
| Functions | 80% |
| Branches | 80% |

---

## Debugging

### Backend Debugging

1. **Enable debug logging**:
```bash
DEBUG=agenteval:* npm run dev:server
```

2. **VS Code launch configuration**:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Server",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev:server"],
  "env": {
    "DEBUG": "agenteval:*"
  }
}
```

3. **Inspect API requests**:
```bash
# Health check
curl http://localhost:4001/health

# Test storage
curl http://localhost:4001/api/storage/test-cases

# Test agent (with verbose output)
curl -v -X POST http://localhost:4001/api/agent \
  -H "Content-Type: application/json" \
  -d '{"agentId": "demo", "payload": {...}}'
```

### Frontend Debugging

1. **React DevTools** - Install browser extension
2. **Network tab** - Monitor API calls
3. **Console logging**:
```typescript
// Add temporary logging
console.log('[DEBUG]', { state, props, data });
```

### Common Issues

| Issue | Diagnostic | Solution |
|-------|------------|----------|
| CORS errors | Check browser network tab | Verify proxy config in vite.config.ts |
| SSE not streaming | Check response headers | Ensure Content-Type: text/event-stream |
| Storage returns empty | Check OpenSearch connection | Verify OPENSEARCH_STORAGE_* env vars |
| Agent timeout | Check agent logs | Increase timeout or check agent health |

### Logging Best Practices

```typescript
// Backend logging
import { logger } from '@/lib/logger';

logger.info('Processing request', { requestId, userId });
logger.error('Operation failed', { error: err.message, stack: err.stack });
logger.debug('Detailed state', { state }); // Only in dev
```

---

## Performance Considerations

### SSE Stream Optimization

- Buffer chunks before sending to reduce network overhead
- Use connection pooling for agent endpoints
- Implement backpressure handling for slow clients

### OpenSearch Query Optimization

```typescript
// Use scroll for large result sets
async function getAllTestCases(): Promise<TestCase[]> {
  const results: TestCase[] = [];
  let scrollId: string | undefined;

  do {
    const response = await client.search({
      index: 'evals_test_cases',
      scroll: '1m',
      size: 100,
      body: scrollId ? undefined : { query: { match_all: {} } },
      scroll_id: scrollId,
    });

    results.push(...response.hits.hits.map(hit => hit._source));
    scrollId = response._scroll_id;
  } while (response.hits.hits.length > 0);

  return results;
}
```

### Frontend Performance

- Use React.memo for expensive components
- Implement virtualization for long lists
- Lazy load routes and heavy components

```typescript
// Lazy loading
const TracesPage = lazy(() => import('./components/TracesPage'));

// Virtualized list
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={items.length}
  itemSize={50}
>
  {({ index, style }) => (
    <div style={style}>{items[index].name}</div>
  )}
</FixedSizeList>
```

### Caching Strategies

```typescript
// In-memory cache for frequently accessed data
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedData(key: string, fetcher: () => Promise<any>) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetcher();
  cache.set(key, { data, timestamp: Date.now() });
  return data;
}
```

---

## Additional Resources

- [CLAUDE.md](../CLAUDE.md) - Quick reference for coding conventions
- [GETTING_STARTED.md](../GETTING_STARTED.md) - User-focused guide
- [ML-COMMONS-SETUP.md](./ML-COMMONS-SETUP.md) - ML-Commons agent setup
- [AG-UI Protocol](https://docs.ag-ui.com/sdk/js/core/types#runagentinput) - Agent protocol spec
- [OpenSearch Documentation](https://opensearch.org/docs/latest/) - OpenSearch reference
