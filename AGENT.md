# AGENT.md

This file provides guidance to AI agents when working with code in this repository.

## Project Overview

AgentEval is an evaluation framework for Root Cause Analysis (RCA) agents using "Golden Path" trajectory comparison. An LLM Judge (AWS Bedrock Claude) evaluates agent actions against expected trajectories to score performance.

## Build Commands

```bash
# Install dependencies
npm install

# Development - run both servers simultaneously
npm run dev           # Frontend at http://localhost:4000
npm run dev:server    # Backend at http://localhost:4001

# Build and test
npm run build         # TypeScript check + Vite build
npm test              # Run Jest tests
npm test -- --watch   # Watch mode
npm test -- path/to/file.test.ts  # Single test file
```

## Environment Setup

Copy `.env.example` to `.env`. Key variables:

- `VITE_BACKEND_PORT` - Backend port (default: 3002)
- `MLCOMMONS_ENDPOINT` - ML-Commons agent streaming endpoint
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` - Bedrock credentials
- `OPENSEARCH_LOGS_*` - OpenSearch cluster for logs/traces

## Architecture

### Two-Server Architecture

- **Frontend (Vite + React)**: Port 3001 - UI for running evaluations
- **Backend (Express)**: Port 3002 - Proxy for Bedrock API calls (browser cannot call Bedrock directly)

### Core Data Flow

```
User selects agent + test case
    → Agent streams AG-UI events via SSE
    → AGUIToTrajectoryConverter builds TrajectoryStep[]
    → Backend calls Bedrock Judge for evaluation
    → Report stored (localStorage or OpenSearch)
```

### Services Layer (`services/`)

| Directory     | Purpose                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `agent/`      | AG-UI protocol handling: SSE streaming (`sseStream.ts`), event conversion (`aguiConverter.ts`), payload building (`payloadBuilder.ts`) |
| `evaluation/` | Orchestrates evaluation runs (`index.ts`), Bedrock judge client with retry (`bedrockJudge.ts`)                                         |
| `storage/`    | Async storage with OpenSearch backend (`asyncRunStorage.ts`, `asyncTestCaseStorage.ts`, `asyncExperimentStorage.ts`)                   |
| `traces/`     | Trace transformations: Flow view, Timeline view, comparison alignment, tool similarity grouping                                        |
| `opensearch/` | Log fetching from OpenSearch clusters                                                                                                  |

### Key Types (`types/index.ts`)

- `TestCase` - Use case definition with versioned content and expected trajectory
- `TestCaseRun` (alias: `EvaluationReport`) - Result of running a test case
- `TrajectoryStep` - Single step in agent execution (tool_result, assistant, thinking, etc.)
- `Experiment` / `ExperimentRun` - Batch evaluation configurations
- `AgentConfig` - Agent endpoint and authentication configuration

### AG-UI Event Processing

The `AGUIToTrajectoryConverter` class accumulates streaming events into trajectory steps:

```
TOOL_CALL_START → TOOL_CALL_ARGS (deltas) → TOOL_CALL_END → TOOL_CALL_RESULT
```

Events are converted to `TrajectoryStep` objects with types: `tool_result`, `assistant`, `action`, `response`, `thinking`.

### Path Aliases

Use `@/` prefix for imports (configured in tsconfig.json and vite.config.ts):

```typescript
import { EvaluationReport } from "@/types";
import { runEvaluation } from "@/services/evaluation";
```

### Environment Variables in Frontend

Environment variables are exposed via `vite.config.ts` using `loadEnv()`. Access via `import.meta.env.VARIABLE_NAME`. The `lib/config.ts` file provides typed access through `ENV_CONFIG`.

## Agent Types

### ML-Commons Agent (AG-UI Protocol)

- Uses SSE streaming via OpenSearch ML plugin
- Requires MCP Server running on port 3030
- Headers configured via `MLCOMMONS_HEADER_*` env vars

### Langgraph Agent

- Simpler local agent without ML-Commons dependencies
- Endpoint configured via `LANGGRAPH_ENDPOINT`

## Testing

Tests use Jest with ts-jest. Test files are in `__tests__/` directories or named `*.test.ts`.

```bash
npm test                                    # All tests
npm test -- services/storage/__tests__/     # Directory
npm test -- --testNamePattern="pattern"     # By name
```

## UI Components

- Uses shadcn/ui components in `components/ui/`
- TailwindCSS for styling with dark theme
- React Router with HashRouter for navigation
- Recharts and ECharts for visualizations
- React Flow for DAG-based trace visualization

### Trace Visualization Views

| View | Component | Description |
|------|-----------|-------------|
| Timeline | `TraceTimelineChart.tsx` | Hierarchical span tree with duration bars |
| Flow | `TraceFlowView.tsx` | DAG-based visualization using React Flow |

### Key Components

- `TracesPage.tsx` - Live trace monitoring with auto-refresh
- `TraceVisualization.tsx` - Unified wrapper for all trace views
- `TraceFullScreenView.tsx` - Full-screen mode for detailed analysis
- `TraceFlowComparison.tsx` - Side-by-side trace comparison
