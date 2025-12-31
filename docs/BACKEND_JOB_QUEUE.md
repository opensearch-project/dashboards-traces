# Backend Job Queue for Experiment Runs

## Overview

Move experiment evaluation from browser to backend with a persistent job queue.

**Goal**: Close browser, experiments keep running. Monitor progress anytime.

**Features**:
- Queue experiments to run in background
- Start, stop, pause (between use cases), resume
- Real-time SSE streaming of trajectory steps
- File-based persistence (survives server restarts)

---

## Milestone Breakdown

### Milestone 1: Backend Can Run a Single Evaluation

**Scope**: Prove backend can call agent, convert events, call judge - same as browser does today.

#### Tasks

- [ ] **A1**: Copy `aguiConverter.ts` to `server/services/` (replace debug import with console)
- [ ] **A2**: Copy `payloadBuilder.ts` to `server/services/` (just copy, no changes)
- [ ] **A3**: Create `server/services/nodeSSEClient.ts` (adapt browser SSE client for Node)
- [ ] **A4**: Create `server/services/evaluationService.ts` (port runEvaluation logic)
- [ ] **A6-partial**: Create test endpoint `POST /api/eval/test` in `server/routes/eval.ts`

#### How to Verify

```bash
# 1. Start the server
npm run dev:server

# 2. Call the test endpoint with a test case ID
curl -X POST http://localhost:4001/api/eval/test \
  -H "Content-Type: application/json" \
  -d '{"testCaseId": "YOUR_TEST_CASE_ID", "agentKey": "YOUR_AGENT", "modelId": "YOUR_MODEL"}'

# 3. Check the response has:
#    - trajectory array with steps
#    - metrics with accuracy score
#    - status: "completed" or "failed"
#    - runId captured from agent
```

#### Success Criteria

- [ ] Response contains trajectory steps (action, tool_result, assistant, response)
- [ ] Response contains metrics from judge
- [ ] runId is captured (check server logs: `[EvalService] Agent completed, runId: xxx`)
- [ ] Report is saved to OpenSearch

---

### Milestone 2: File-Based Job Queue (No SSE Yet)

**Scope**: Jobs can be submitted, started, and persist to file. Poll for status.

#### Tasks

- [ ] **C1**: Create `types/jobs.ts` with job types
- [ ] **C2**: Create `server/services/jobStorage.ts` for file persistence
- [ ] **A5**: Create `server/services/jobQueue.ts` (without SSE broadcasting)
- [ ] **A6**: Create `/api/jobs/*` routes in `server/routes/jobs.ts`
- [ ] Mount routes in `server/routes/index.ts`
- [ ] Initialize job queue in `server/index.ts`

#### How to Verify

```bash
# 1. Submit a job
curl -X POST http://localhost:4001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"experimentId": "YOUR_EXP_ID", "runConfig": {"name": "Test Run", "agentKey": "xxx", "modelId": "yyy"}}'
# → Returns job with status: "queued"

# 2. Check file was created
cat server/data/jobs/queue.json
# → Should show job in jobs array

# 3. List jobs via API
curl http://localhost:4001/api/jobs
# → Returns { jobs: [...] }

# 4. Start the job
curl -X POST http://localhost:4001/api/jobs/JOB_ID/start
# → Returns { success: true }

# 5. Poll for status (repeat until completed)
curl http://localhost:4001/api/jobs/JOB_ID
# → Watch status change: queued → running → completed

# 6. Restart server mid-job, check recovery
# Kill server (Ctrl+C), restart, check queue.json - job should be "paused"

# 7. Cancel a running job
curl -X POST http://localhost:4001/api/jobs/JOB_ID/cancel
```

#### Success Criteria

- [ ] Jobs persist in `server/data/jobs/queue.json`
- [ ] Job transitions: queued → running → completed
- [ ] Use cases execute sequentially (check server logs)
- [ ] Reports are saved for each completed use case
- [ ] Server restart marks running job as paused
- [ ] Cancel stops job after current use case

---

### Milestone 3: SSE Streaming for Real-Time Progress

**Scope**: Clients can subscribe to job events, see trajectory steps live.

#### Tasks

- [ ] **C3**: Create `server/services/sseManager.ts`
- [ ] **A5-update**: Add SSE broadcasting to job queue service
- [ ] **A6-update**: Add `/api/jobs/:id/stream` endpoint

#### How to Verify

```bash
# 1. In terminal 1: Subscribe to job stream
curl -N http://localhost:4001/api/jobs/JOB_ID/stream
# → Should see: data: {"type":"connected"}

# 2. In terminal 2: Start the job
curl -X POST http://localhost:4001/api/jobs/JOB_ID/start

# 3. Watch terminal 1 - should see streaming events:
#    data: {"type":"job:status","data":{"status":"running"}}
#    data: {"type":"job:progress","data":{"useCaseId":"xxx","status":"running"}}
#    data: {"type":"job:trajectory","data":{"step":{"type":"action",...}}}
#    data: {"type":"job:trajectory","data":{"step":{"type":"tool_result",...}}}
#    ... more trajectory steps ...
#    data: {"type":"job:progress","data":{"useCaseId":"xxx","status":"completed"}}
#    data: {"type":"job:complete","data":{...}}

# 4. Open multiple terminals with curl -N, verify all receive same events
```

#### Success Criteria

- [ ] SSE connection stays open
- [ ] Trajectory steps stream in real-time (as agent executes)
- [ ] Multiple clients receive same events
- [ ] Keep-alive pings prevent timeout
- [ ] Client disconnect doesn't crash server

---

### Milestone 4: Pause/Resume Works

**Scope**: Pause a running job between use cases, resume later.

#### Tasks

- [ ] **A5-update**: Add pause/resume logic to job queue service

#### How to Verify

```bash
# 1. Start a job with multiple use cases
curl -X POST http://localhost:4001/api/jobs/JOB_ID/start

# 2. Wait for first use case to complete (watch logs or SSE)
# Server log: "[JobQueue] Use case 0 completed"

# 3. Pause the job
curl -X POST http://localhost:4001/api/jobs/JOB_ID/pause

# 4. Check status - should be "paused"
curl http://localhost:4001/api/jobs/JOB_ID
# → status: "paused", currentUseCaseIndex: 1

# 5. Check queue.json - should persist paused state
cat server/data/jobs/queue.json

# 6. Resume the job
curl -X POST http://localhost:4001/api/jobs/JOB_ID/resume

# 7. Watch it continue from where it left off
# Server log: "[JobQueue] Resuming job at index 1"
```

#### Success Criteria

- [ ] Pause takes effect after current use case completes
- [ ] Paused state persists in file
- [ ] Resume continues from next use case (not from beginning)
- [ ] All results preserved (use cases 0-N completed before pause)

---

### Milestone 5: Frontend Integration

**Scope**: UI uses job queue instead of browser-based execution.

#### Tasks

- [ ] **B1**: Create `services/api/jobsApi.ts` client
- [ ] **B2**: Create `hooks/useJobStream.ts` hook
- [ ] **B3**: Create `components/JobProgressPanel.tsx` component
- [ ] **B4**: Update `components/ExperimentRunsPage.tsx` with feature flag

#### How to Verify

1. Open the app in browser, go to an experiment
2. Click "Add Run", configure, click "Start"
3. Verify: Job is submitted (check Network tab: POST /api/jobs)
4. Verify: Progress panel shows live updates
5. Verify: Trajectory steps appear as they stream
6. Close browser tab
7. Reopen browser, go back to experiment
8. Verify: Job is still running (or completed)
9. Verify: Results appear correctly

#### Success Criteria

- [ ] UI submits job instead of running in browser
- [ ] Live progress updates via SSE
- [ ] Can close browser, job continues
- [ ] Pause/Resume buttons work
- [ ] Final results match what old system produced

---

### Milestone 6: Cleanup & Polish

**Scope**: Remove feature flag, clean up old code, handle edge cases.

#### Tasks

- [ ] Remove feature flag, make job queue the default
- [ ] Handle edge cases (network errors, agent timeouts)
- [ ] Add job history cleanup (delete old completed jobs)
- [ ] Update documentation

---

## Implementation Timeline

```
Week 1: Milestone 1 (Backend Eval)
├── Copy aguiConverter to server
├── Copy payloadBuilder to server
├── Create nodeSSEClient
├── Create evaluationService
└── Add test endpoint
    └── VERIFY: curl test works ✓

Week 2: Milestone 2 (Job Queue)
├── Create job types
├── Create jobStorage
├── Create jobQueue
└── Create job routes
    └── VERIFY: Job lifecycle via curl ✓

Week 3: Milestone 3 + 4 (SSE + Pause/Resume)
├── Create sseManager
├── Add broadcasting to queue
├── Add stream endpoint
└── Add pause/resume logic
    └── VERIFY: SSE stream + pause works ✓

Week 4: Milestone 5 (Frontend)
├── Create jobsApi
├── Create useJobStream hook
├── Create JobProgressPanel
└── Update ExperimentRunsPage
    └── VERIFY: Full flow in browser ✓
```

---

## Files to Create

| File | Milestone | Description |
|------|-----------|-------------|
| `types/jobs.ts` | M2 | Job types |
| `server/services/aguiConverter.ts` | M1 | Copy from frontend |
| `server/services/payloadBuilder.ts` | M1 | Copy from frontend |
| `server/services/nodeSSEClient.ts` | M1 | Node SSE consumer |
| `server/services/evaluationService.ts` | M1 | Backend eval logic |
| `server/services/jobStorage.ts` | M2 | File persistence |
| `server/services/jobQueue.ts` | M2 | Queue orchestrator |
| `server/services/sseManager.ts` | M3 | Client broadcasting |
| `server/routes/jobs.ts` | M2 | API endpoints |
| `services/api/jobsApi.ts` | M5 | Frontend API client |
| `hooks/useJobStream.ts` | M5 | SSE subscription |
| `components/JobProgressPanel.tsx` | M5 | Progress UI |

## Files to Modify

| File | Milestone | Change |
|------|-----------|--------|
| `server/routes/index.ts` | M2 | Mount job routes |
| `server/index.ts` | M2 | Initialize job queue on startup |
| `components/ExperimentRunsPage.tsx` | M5 | Add feature flag + job integration |

---

## Backward Compatibility

During Milestone 5, use a feature flag:

```typescript
// In ExperimentRunsPage.tsx
const USE_BACKEND_JOBS = true; // Toggle to test

const handleStartRun = async () => {
  if (USE_BACKEND_JOBS) {
    // New: Submit to backend job queue
    const job = await jobsApi.submit(experimentId, runConfigValues);
    await jobsApi.start(job.id);
    setActiveJobId(job.id);
  } else {
    // Old: Run in browser (existing code, unchanged)
    await runExperiment(experiment, runConfigValues, onProgress);
  }
};
```

This enables:
- **A/B testing**: Run same test case both ways, compare results
- **Quick rollback**: Set flag to false if issues found
- **Gradual rollout**: Enable for some users first

---

## Technical Details

### Job Types (`types/jobs.ts`)

```typescript
export type JobStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface ExperimentJob {
  id: string;
  experimentId: string;
  experimentName: string;
  runConfig: RunConfigInput;
  status: JobStatus;
  useCaseIds: string[];
  currentUseCaseIndex: number;
  currentUseCaseId: string | null;
  results: Record<string, { reportId: string; status: RunResultStatus }>;
  createdAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  completedAt: string | null;
  error: string | null;
  experimentRunId: string | null;
}

export type JobEventType = 'job:status' | 'job:progress' | 'job:trajectory' | 'job:complete' | 'job:error';

export interface JobEvent {
  type: JobEventType;
  jobId: string;
  timestamp: number;
  data: unknown;
}
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/jobs` | Submit new job |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/:id` | Get job details |
| `POST` | `/api/jobs/:id/start` | Start queued job |
| `POST` | `/api/jobs/:id/pause` | Pause running job |
| `POST` | `/api/jobs/:id/resume` | Resume paused job |
| `POST` | `/api/jobs/:id/cancel` | Cancel job |
| `DELETE` | `/api/jobs/:id` | Delete from history |
| `GET` | `/api/jobs/:id/stream` | SSE stream for progress |

### File Storage Structure

```
server/
  data/
    jobs/
      queue.json       # Active jobs
      history/
        {jobId}.json   # Archived completed/failed jobs
```

### Key Implementation Notes

1. **AG UI Converter** (`services/agent/aguiConverter.ts`) is already Node.js compatible - just needs debug import changed

2. **Payload Builder** (`services/agent/payloadBuilder.ts`) is 100% portable - pure functions, no browser APIs

3. **SSE in Node.js** - Use native `fetch` (Node 18+) with `ReadableStream.getReader()` - same as browser

4. **Pause Logic** - Set a flag, checked between use cases. Current use case always completes.

5. **Server Restart Recovery** - On startup, scan queue for `status: 'running'`, mark as `'paused'`
