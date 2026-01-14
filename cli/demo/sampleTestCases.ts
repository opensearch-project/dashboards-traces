/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sample Test Cases for Demo Mode
 *
 * Pre-configured RCA scenarios based on realistic e-commerce microservices.
 * These test cases demonstrate the evaluation framework's capabilities
 * without requiring external dependencies.
 */

export interface SampleTestCase {
  id: string;
  name: string;
  description?: string;
  initialPrompt: string;
  context: Array<{ type: string; content: string }>;
  expectedOutcomes: string[];
  labels: string[];
  tags?: string[];
}

export const SAMPLE_TEST_CASES: SampleTestCase[] = [
  {
    id: 'demo-otel-001',
    name: 'Payment Service Latency Spike',
    description: 'Investigate a 5x latency increase in the payment service',
    initialPrompt: `The payment service in our e-commerce app is showing 5x increased latency.
P99 went from 200ms to 1000ms in the last hour.
Investigate the root cause using available traces and logs.`,
    context: [
      {
        type: 'system_architecture',
        content: `E-commerce microservices architecture:
- frontend → cart-service → checkout-service → payment-service → fraud-detection
- Payment service calls external Stripe payment gateway
- All services instrumented with OpenTelemetry
- Traces available in OpenSearch (otel-v1-apm-span-* index)`
      },
      {
        type: 'recent_changes',
        content: `Recent deployments:
- payment-service: v2.3.1 deployed 3 hours ago (connection pool config change)
- fraud-detection: v1.8.0 deployed 6 hours ago (new ML model)`
      }
    ],
    expectedOutcomes: [
      'Identify the specific service or dependency causing latency',
      'Analyze trace spans to find the bottleneck (likely external payment gateway or fraud-detection)',
      'Correlate latency spike timing with recent deployments',
      'Recommend mitigation steps (rollback, timeout adjustment, circuit breaker)'
    ],
    labels: ['category:RCA', 'difficulty:Medium', 'domain:E-commerce', 'type:Latency'],
    tags: ['promoted']
  },
  {
    id: 'demo-otel-002',
    name: 'Cart Service Error Rate Spike',
    description: 'Debug a sudden increase in checkout failures',
    initialPrompt: `Users are reporting failed checkouts. The cart service error rate jumped from 0.1% to 15% in the last 30 minutes.
Find the root cause and recommend a fix.`,
    context: [
      {
        type: 'system_architecture',
        content: `Cart service dependencies:
- inventory-service: Check stock availability
- pricing-service: Get current prices and discounts
- redis-cache: Session and cart data caching
- PostgreSQL: Persistent cart storage`
      },
      {
        type: 'recent_changes',
        content: `Recent changes:
- inventory-service: v3.1.0 deployed 2 hours ago (new inventory API)
- redis-cache: Maintenance window completed 1 hour ago
- No changes to cart-service itself`
      },
      {
        type: 'error_samples',
        content: `Sample errors from logs:
- "Connection refused: inventory-service:8080"
- "Timeout waiting for inventory response"
- HTTP 503 from inventory-service`
      }
    ],
    expectedOutcomes: [
      'Identify the failing dependency (inventory-service)',
      'Find error patterns in traces showing 503 responses',
      'Correlate errors with inventory-service deployment',
      'Recommend rollback or fix for inventory-service'
    ],
    labels: ['category:RCA', 'difficulty:Medium', 'domain:E-commerce', 'type:Errors'],
    tags: ['promoted']
  },
  {
    id: 'demo-otel-003',
    name: 'Database Connection Pool Exhaustion',
    description: 'Investigate intermittent database connection timeouts',
    initialPrompt: `The order-service is experiencing intermittent failures with connection timeout errors to the database.
This started during our flash sale event. Investigate the root cause.`,
    context: [
      {
        type: 'system_architecture',
        content: `Order service database setup:
- PostgreSQL 14.x primary database
- Connection pool: HikariCP with maxPoolSize=20
- Read replicas available but not used by order-service
- Average query time: 15ms`
      },
      {
        type: 'current_situation',
        content: `Flash sale metrics:
- Normal traffic: 100 req/s
- Flash sale traffic: 2000 req/s (20x spike)
- Order creation endpoint most affected
- Error: "Connection is not available, request timed out after 30000ms"`
      },
      {
        type: 'database_metrics',
        content: `Database observations:
- Active connections: 20/20 (pool exhausted)
- Wait queue: Growing steadily
- Some queries taking 500ms+ (normally 15ms)
- One slow query: "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC"`
      }
    ],
    expectedOutcomes: [
      'Identify connection pool exhaustion from trace/log correlation',
      'Find slow queries holding connections too long',
      'Identify the specific slow query pattern',
      'Recommend: increase pool size, optimize slow query, add index, use read replica'
    ],
    labels: ['category:RCA', 'difficulty:Hard', 'domain:Database', 'type:Performance'],
    tags: ['promoted']
  },
  {
    id: 'demo-otel-004',
    name: 'Recommendation Service Cold Start',
    description: 'Diagnose slow initial requests after pod scaling',
    initialPrompt: `First requests to the recommendation-service after pod scaling take 30+ seconds.
Subsequent requests are fast (under 100ms).
This is causing timeouts for users during traffic spikes. Diagnose the issue.`,
    context: [
      {
        type: 'system_architecture',
        content: `Recommendation service setup:
- Kubernetes deployment with HPA (Horizontal Pod Autoscaler)
- Service loads 2GB ML model on startup
- Model loaded from S3 bucket
- Readiness probe: HTTP /health endpoint`
      },
      {
        type: 'kubernetes_config',
        content: `Current K8s configuration:
- minReplicas: 2, maxReplicas: 10
- CPU threshold for scaling: 70%
- Readiness probe: initialDelaySeconds=10, periodSeconds=5
- No preStop lifecycle hook configured`
      },
      {
        type: 'trace_pattern',
        content: `Observed trace pattern:
- First request after scale-up: 32000ms (model loading)
- Model load breakdown: S3 download (8s) + deserialization (20s) + warmup (4s)
- Subsequent requests: 50-100ms`
      }
    ],
    expectedOutcomes: [
      'Identify cold start pattern in traces (30s+ first request)',
      'Find initialization bottleneck (ML model loading from S3)',
      'Recognize readiness probe misconfiguration (allowing traffic before model ready)',
      'Suggest: increase initialDelaySeconds, implement model preloading, use init containers'
    ],
    labels: ['category:RCA', 'difficulty:Medium', 'domain:ML', 'type:Cold-Start'],
    tags: ['promoted']
  },
  {
    id: 'demo-otel-005',
    name: 'Cascading Failure Investigation',
    description: 'Trace a multi-service failure cascade',
    initialPrompt: `Multiple services are showing errors. It started with notification-service,
and now order-service and user-service are also affected.
Trace the failure cascade and identify the root cause.`,
    context: [
      {
        type: 'system_architecture',
        content: `Service dependencies:
- order-service → notification-service (async, for order confirmations)
- user-service → notification-service (async, for account alerts)
- notification-service → external SMS provider (Twilio)
- Circuit breakers configured on all external calls`
      },
      {
        type: 'timeline',
        content: `Failure timeline:
- T+0: notification-service starts returning 503
- T+5min: order-service response times increase 3x
- T+10min: user-service starts timing out
- T+15min: Circuit breakers not tripping as expected`
      },
      {
        type: 'circuit_breaker_config',
        content: `Circuit breaker configuration:
- Failure threshold: 50% in 10 seconds
- Open duration: 30 seconds
- Half-open max requests: 3
- Issue: Async calls not properly wrapped with circuit breaker`
      }
    ],
    expectedOutcomes: [
      'Trace failure propagation: Twilio → notification → order/user services',
      'Identify root cause: external SMS provider (Twilio) outage',
      'Find circuit breaker misconfiguration (async calls not protected)',
      'Recommend: fix circuit breaker wrapper, add fallback for notifications'
    ],
    labels: ['category:RCA', 'difficulty:Hard', 'domain:Reliability', 'type:Cascading-Failure'],
    tags: ['promoted']
  }
];

/**
 * Get a sample test case by ID
 */
export function getSampleTestCase(id: string): SampleTestCase | undefined {
  return SAMPLE_TEST_CASES.find(tc => tc.id === id);
}

/**
 * Get all sample test cases
 */
export function getAllSampleTestCases(): SampleTestCase[] {
  return [...SAMPLE_TEST_CASES];
}
