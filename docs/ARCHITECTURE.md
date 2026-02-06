# Architecture Guide

This document describes the core architecture patterns in Agent Health. It serves as a reference to ensure architectural consistency across the codebase.

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Agent Health                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐     HTTP API      ┌──────────────┐    ┌────────────┐ │
│  │   CLI    │ ─────────────────▶│    Server    │───▶│ OpenSearch │ │
│  └──────────┘                   │  (port 4001) │    │  Storage   │ │
│                                 └──────────────┘    └────────────┘ │
│                                        ▲                           │
│                                        │                           │
│  ┌──────────┐     HTTP API             │                           │
│  │ Browser  │ ─────────────────────────┘                           │
│  │   (UI)   │                                                      │
│  └──────────┘                                                      │
│                                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Principle: Server-Mediated Access

**All clients (CLI, UI) access OpenSearch through the server HTTP API.**

This pattern ensures:
1. **Single source of truth** - All business logic lives in server routes
2. **Consistent behavior** - CLI and UI always produce identical results
3. **Maintainability** - Add features once, both consumers get them
4. **Security** - Credentials never exposed to CLI or browser

**Never do this:**
```
CLI ──────────────────▶ OpenSearch   (WRONG: bypasses server)
```

**Always do this:**
```
CLI ────── HTTP ──────▶ Server ──────▶ OpenSearch   (CORRECT)
```

## Server Lifecycle (Playwright Pattern)

The CLI manages server lifecycle using a Playwright-inspired config pattern.

### Default Behavior (No Config File)

| Environment | Server Running? | Behavior |
|-------------|-----------------|----------|
| Development | Yes | Reuse existing server |
| Development | No | Start server, keep running after CLI exits |
| CI (`CI=true`) | Yes | Error (explicit failure) |
| CI (`CI=true`) | No | Start server, stop after CLI exits |

### Optional Config File

Create `agent-health.config.ts` only if you need to customize defaults:

```typescript
import { defineConfig } from '@opensearch-project/agent-health';

export default defineConfig({
  server: {
    port: 4001,                    // Default: 4001
    reuseExistingServer: true,     // Default: !process.env.CI
    startTimeout: 30000,           // Default: 30000 (30s)
  },

  // Other config sections...
  agents: [/* ... */],
  models: [/* ... */],
});
```

### Implementation Details

The server lifecycle is implemented in `cli/utils/serverLifecycle.ts`:

- `isServerRunning(port)` - Check if server is listening on port
- `startServer(port, timeout)` - Spawn server process and wait for ready
- `stopServer(process)` - Gracefully terminate server
- `ensureServer(config)` - Main entry point, handles all scenarios
- `createServerCleanup(result, isCI)` - Returns cleanup function for CI mode

## API Client Pattern

The CLI uses `cli/utils/apiClient.ts` to communicate with the server:

```typescript
const api = new ApiClient('http://localhost:4001');

// Find benchmark by name or ID
const benchmark = await api.findBenchmark('My Benchmark');

// Execute benchmark with progress streaming
const run = await api.executeBenchmark(benchmark.id, runConfig, (event) => {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.currentTestCaseIndex}/${event.totalTestCases}`);
  }
});

// Get detailed reports
const reports = await api.getRunReports(benchmark.id, run.id);
```

### SSE Streaming

Long-running operations (benchmark execution) use Server-Sent Events:

```typescript
// Server side (Express route)
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders();

res.write(`data: ${JSON.stringify({ type: 'progress', ... })}\n\n`);

// Client side (API client)
const reader = res.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // Parse SSE events from buffer
}
```

## Directory Structure

```
.
├── cli/
│   ├── commands/           # CLI commands (benchmark, serve, etc.)
│   ├── utils/
│   │   ├── apiClient.ts    # HTTP client for server API
│   │   └── serverLifecycle.ts  # Server start/stop utilities
│   └── demo/               # Sample data generators
├── server/
│   ├── routes/             # Express route handlers
│   │   └── storage/        # Storage API routes
│   ├── services/           # Backend-only services
│   └── middleware/         # Express middleware
├── lib/
│   └── config/             # Configuration loading
│       ├── types.ts        # ServerConfig, UserConfig, etc.
│       ├── loader.ts       # Config file loading
│       └── defineConfig.ts # Type-safe config helper
└── services/               # Shared services (used by server)
```

## Adding New CLI Commands

When adding a new CLI command that needs server functionality:

1. **Use the API client** - Never import server internals or OpenSearch client directly
2. **Handle server lifecycle** - Call `ensureServer()` at the start
3. **Clean up in CI** - Call the cleanup function in a finally block

```typescript
import { ensureServer, createServerCleanup } from '@/cli/utils/serverLifecycle.js';
import { ApiClient } from '@/cli/utils/apiClient.js';
import { loadConfig, DEFAULT_SERVER_CONFIG } from '@/lib/config/index.js';

export async function myCommand() {
  const config = await loadConfig();
  const serverConfig = { ...DEFAULT_SERVER_CONFIG, ...config.server };
  const isCI = !!process.env.CI;

  const serverResult = await ensureServer(serverConfig);
  const cleanup = createServerCleanup(serverResult, isCI);

  try {
    const api = new ApiClient(serverResult.baseUrl);
    // Use api.* methods to interact with server
  } finally {
    cleanup();
  }
}
```

## Server API Endpoints

Key endpoints used by CLI:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/storage/benchmarks` | GET | List benchmarks |
| `/api/storage/benchmarks/:id` | GET | Get benchmark by ID |
| `/api/storage/benchmarks/:id/execute` | POST | Execute benchmark (SSE) |
| `/api/storage/benchmarks/:id/cancel` | POST | Cancel running benchmark |
| `/api/storage/runs/by-benchmark-run/:benchmarkId/:runId` | GET | Get reports for a run |

## Why This Architecture?

### Before (Direct OpenSearch Access)

```typescript
// CLI command
import { getOpenSearchClient } from '@/server/services/opensearchClient';

const client = getOpenSearchClient();
const result = await client.search({ index: 'benchmarks', ... });
// Duplicate logic from server routes
```

**Problems:**
- Duplicated business logic between CLI and server routes
- CLI needs OpenSearch credentials
- Inconsistent behavior possible
- Hard to maintain two code paths

### After (Server-Mediated)

```typescript
// CLI command
import { ApiClient } from '@/cli/utils/apiClient';

const api = new ApiClient('http://localhost:4001');
const benchmarks = await api.listBenchmarks();
// Server handles all logic
```

**Benefits:**
- Single source of truth (server routes)
- CLI is a thin HTTP wrapper (~200 lines vs ~550 lines)
- No credential exposure
- Guaranteed consistent behavior
- Easier testing and maintenance
