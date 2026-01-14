# Agent Health: NPX CLI Tool

## Overview

Package the AgentEval application as an NPX-runnable CLI tool with:
- **Demo mode** (default): Sample data + mock agent/judge, zero config
- **Configure mode**: Connect to real OpenSearch, agent, and Bedrock

**Package name**: `@opensearch-project/agent-health`

---

## Key Concept: Sample Data Always Visible

Sample data (`demo-*` prefixed items) is **always included** in API responses:

- **5 sample test cases** - RCA scenarios for e-commerce
- **1 sample experiment** - With completed runs
- **5 sample runs** - With realistic trajectories and judge evaluations
- **Sample traces** - OTel spans linked to runs

When OpenSearch is configured, real data is merged with sample data. Sample data is **read-only** - write operations to `demo-*` IDs are rejected.

---

## Quick Start

### Demo Mode (Default)
```bash
npx @opensearch-project/agent-health
# or explicitly:
npx @opensearch-project/agent-health --demo
```
Uses mock agent, mock judge, sample data only. No external dependencies.

### Configure Mode
```bash
npx @opensearch-project/agent-health --configure
```
Interactive wizard to connect to your infrastructure:
- OpenSearch storage (optional - for persisting your own data)
- Agent endpoint (ML-Commons or Langgraph)
- LLM Judge (AWS Bedrock)
- Traces endpoint (for OTel trace visualization)

---

## Architecture

```
@opensearch-project/agent-health
├── bin/
│   └── cli.js                    # Entry point (#!/usr/bin/env node)
├── cli/
│   ├── index.ts                  # Main CLI orchestration
│   ├── commands/
│   │   ├── demo.ts               # Default mode handler
│   │   └── configure.ts          # --configure handler
│   ├── demo/
│   │   ├── sampleTestCases.ts    # 5 embedded test cases (always visible)
│   │   ├── sampleExperiments.ts  # 1 sample experiment (always visible)
│   │   ├── sampleRuns.ts         # 5 runs with trajectories (always visible)
│   │   └── sampleTraces.ts       # OTel spans for sample runs (always visible)
│   ├── utils/
│   │   └── startServer.ts        # Server startup utility
│   └── types.ts                  # CLI type definitions
├── server/                        # Backend (Express)
│   ├── services/
│   │   └── opensearchClient.ts   # Returns null if not configured
│   └── routes/
│       └── storage/              # All routes merge sample + real data
├── dist/                          # Built frontend
└── package.json
```

---

## Storage Behavior

| OpenSearch | Sample Data | Real Data | Writes |
|-----------|-------------|-----------|--------|
| Not configured | Yes | No | Rejected |
| Configured | Yes | Yes | Allowed |

**Key behavior:**
- Sample data (`demo-*`) is **always** returned by APIs
- OpenSearch is **optional** - APIs work without it
- Write operations require OpenSearch to be configured
- Write operations to `demo-*` IDs always rejected (read-only)

---

## Sample Test Cases

5 pre-configured RCA scenarios based on e-commerce observability:

| ID | Name | Difficulty |
|----|------|------------|
| demo-otel-001 | Payment Service Latency Spike | Medium |
| demo-otel-002 | Cart Service Error Rate Spike | Medium |
| demo-otel-003 | Database Connection Pool Exhaustion | Hard |
| demo-otel-004 | Recommendation Service Cold Start | Medium |
| demo-otel-005 | Cascading Failure Investigation | Hard |

Each includes prompt, context, and expected outcomes.

---

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --demo` | Demo mode (sample data + mock) | Default |
| `-c, --configure` | Interactive configuration wizard | - |
| `-p, --port <num>` | Server port | 4001 |
| `--no-browser` | Don't open browser automatically | false |

**Examples:**
```bash
# Start demo on custom port
npx @opensearch-project/agent-health --port 3000

# Configure without opening browser
npx @opensearch-project/agent-health --configure --no-browser
```

---

## Configuration File

Saved by `--configure` mode to `~/.agent-health/config.json`:

```json
{
  "mode": "configure",
  "port": 4001,
  "noBrowser": false,
  "storage": {
    "endpoint": "http://localhost:9200",
    "username": "admin",
    "password": "admin"
  },
  "agent": {
    "type": "mlcommons",
    "endpoint": "http://localhost:9200/_plugins/_ml/agents/{id}/_execute/stream"
  },
  "judge": {
    "type": "bedrock",
    "region": "us-west-2",
    "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0"
  },
  "traces": {
    "endpoint": "http://localhost:9200",
    "index": "otel-v1-apm-span-*"
  }
}
```

**Note:** `storage` is optional. When omitted, only sample data is available.

---

## What Gets Packaged

### NPM Package Contents
```json
{
  "files": [
    "bin/",
    "cli/dist/",
    "server/dist/",
    "dist/"
  ]
}
```

### Size Estimate
- Frontend build: ~2MB
- Server build: ~500KB
- CLI + sample data: ~300KB
- **Total: ~3MB**

---

## Development

### Building
```bash
npm run build:cli      # Build CLI only
npm run build:all      # Build everything (UI + server + CLI)
```

### Testing Locally
```bash
npm link
agent-health --demo
```

### Publishing
```bash
npm run prepublishOnly
npm publish --access public
```

---

## Security

1. **Config file permissions** - 600 on ~/.agent-health/config.json
2. **AWS credentials** - Uses default credential chain, never stored in config
3. **OpenSearch auth optional** - For localhost dev without security
4. **Sample data is synthetic** - No sensitive information
