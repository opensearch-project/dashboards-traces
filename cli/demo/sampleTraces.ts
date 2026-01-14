/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Sample Trace Spans for Demo Mode
 *
 * OTel-format trace spans linked to sample runs.
 * Always visible alongside real traces - trace IDs prefixed with 'demo-'.
 */

import type { Span } from '../../types/index.js';

// Base timestamp for demo traces
const BASE_TIME = new Date('2024-01-15T10:05:00.000Z').getTime();

/**
 * Generate spans for Payment Service Latency Spike (demo-report-001)
 */
function generatePaymentTraceSpans(): Span[] {
  const traceId = 'demo-trace-001';
  const baseTime = BASE_TIME;

  return [
    {
      traceId,
      spanId: 'span-001-root',
      name: 'POST /checkout',
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + 1050).toISOString(),
      duration: 1050,
      status: 'OK',
      attributes: {
        'service.name': 'frontend',
        'http.method': 'POST',
        'http.route': '/checkout',
        'http.status_code': 200,
        'run.id': 'demo-agent-run-001',
      },
    },
    {
      traceId,
      spanId: 'span-001-payment',
      parentSpanId: 'span-001-root',
      name: 'payment-service.processPayment',
      startTime: new Date(baseTime + 50).toISOString(),
      endTime: new Date(baseTime + 1000).toISOString(),
      duration: 950,
      status: 'OK',
      attributes: {
        'service.name': 'payment-service',
        'payment.amount': 99.99,
        'payment.currency': 'USD',
      },
    },
    {
      traceId,
      spanId: 'span-001-fraud',
      parentSpanId: 'span-001-payment',
      name: 'fraud-detection.check',
      startTime: new Date(baseTime + 60).toISOString(),
      endTime: new Date(baseTime + 180).toISOString(),
      duration: 120,
      status: 'OK',
      attributes: {
        'service.name': 'fraud-detection',
        'fraud.score': 0.12,
        'fraud.decision': 'approve',
      },
    },
    {
      traceId,
      spanId: 'span-001-stripe',
      parentSpanId: 'span-001-payment',
      name: 'stripe.charges.create',
      startTime: new Date(baseTime + 200).toISOString(),
      endTime: new Date(baseTime + 980).toISOString(),
      duration: 780,
      status: 'OK',
      attributes: {
        'service.name': 'payment-service',
        'http.url': 'https://api.stripe.com/v1/charges',
        'http.method': 'POST',
        'http.status_code': 200,
        'peer.service': 'stripe-api',
        'stripe.latency_degraded': true,
      },
    },
  ];
}

/**
 * Generate spans for Cart Service Error Rate (demo-report-002)
 */
function generateCartErrorTraceSpans(): Span[] {
  const traceId = 'demo-trace-002';
  const baseTime = BASE_TIME + 180000; // 3 minutes after first trace

  return [
    {
      traceId,
      spanId: 'span-002-root',
      name: 'POST /cart/checkout',
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + 5050).toISOString(),
      duration: 5050,
      status: 'ERROR',
      attributes: {
        'service.name': 'cart-service',
        'http.method': 'POST',
        'http.route': '/cart/checkout',
        'http.status_code': 503,
        'run.id': 'demo-agent-run-002',
        'error': true,
      },
    },
    {
      traceId,
      spanId: 'span-002-inventory',
      parentSpanId: 'span-002-root',
      name: 'inventory-service.checkStock',
      startTime: new Date(baseTime + 10).toISOString(),
      endTime: new Date(baseTime + 5010).toISOString(),
      duration: 5000,
      status: 'ERROR',
      attributes: {
        'service.name': 'cart-service',
        'peer.service': 'inventory-service',
        'http.status_code': 503,
        'error': true,
        'error.message': 'Connection refused: inventory-service:8080',
      },
      events: [
        {
          name: 'exception',
          time: new Date(baseTime + 5010).toISOString(),
          attributes: {
            'exception.type': 'ConnectionRefusedException',
            'exception.message': 'Connection refused: inventory-service:8080',
          },
        },
      ],
    },
  ];
}

/**
 * Generate spans for Database Connection Pool (demo-report-003)
 */
function generateDbPoolTraceSpans(): Span[] {
  const traceId = 'demo-trace-003';
  const baseTime = BASE_TIME + 420000; // 7 minutes after first trace

  return [
    {
      traceId,
      spanId: 'span-003-root',
      name: 'POST /orders',
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + 30500).toISOString(),
      duration: 30500,
      status: 'ERROR',
      attributes: {
        'service.name': 'order-service',
        'http.method': 'POST',
        'http.route': '/orders',
        'http.status_code': 504,
        'run.id': 'demo-agent-run-003',
        'error': true,
      },
    },
    {
      traceId,
      spanId: 'span-003-db',
      parentSpanId: 'span-003-root',
      name: 'postgresql.query',
      startTime: new Date(baseTime + 50).toISOString(),
      endTime: new Date(baseTime + 30050).toISOString(),
      duration: 30000,
      status: 'ERROR',
      attributes: {
        'service.name': 'order-service',
        'db.system': 'postgresql',
        'db.statement': 'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        'db.operation': 'SELECT',
        'db.pool.active_connections': 20,
        'db.pool.max_connections': 20,
        'db.pool.pending_requests': 150,
        'error': true,
        'error.message': 'Connection is not available, request timed out after 30000ms',
      },
      events: [
        {
          name: 'pool_exhausted',
          time: new Date(baseTime + 100).toISOString(),
          attributes: {
            'pool.active': 20,
            'pool.max': 20,
            'pool.pending': 150,
          },
        },
      ],
    },
  ];
}

/**
 * Generate spans for Cold Start (demo-report-004)
 */
function generateColdStartTraceSpans(): Span[] {
  const traceId = 'demo-trace-004';
  const baseTime = BASE_TIME + 660000; // 11 minutes after first trace

  return [
    {
      traceId,
      spanId: 'span-004-root',
      name: 'GET /recommendations',
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + 32000).toISOString(),
      duration: 32000,
      status: 'OK',
      attributes: {
        'service.name': 'recommendation-service',
        'http.method': 'GET',
        'http.route': '/recommendations',
        'http.status_code': 200,
        'run.id': 'demo-agent-run-004',
        'cold_start': true,
      },
    },
    {
      traceId,
      spanId: 'span-004-s3',
      parentSpanId: 'span-004-root',
      name: 's3.getObject',
      startTime: new Date(baseTime + 100).toISOString(),
      endTime: new Date(baseTime + 8100).toISOString(),
      duration: 8000,
      status: 'OK',
      attributes: {
        'service.name': 'recommendation-service',
        'aws.service': 's3',
        'aws.operation': 'GetObject',
        's3.bucket': 'ml-models-prod',
        's3.key': 'recommendation-model-v2.bin',
        's3.object_size': 2147483648, // 2GB
      },
    },
    {
      traceId,
      spanId: 'span-004-load',
      parentSpanId: 'span-004-root',
      name: 'model.deserialize',
      startTime: new Date(baseTime + 8200).toISOString(),
      endTime: new Date(baseTime + 28200).toISOString(),
      duration: 20000,
      status: 'OK',
      attributes: {
        'service.name': 'recommendation-service',
        'model.size_bytes': 2147483648,
        'model.format': 'pytorch',
        'model.version': 'v2',
      },
    },
    {
      traceId,
      spanId: 'span-004-warmup',
      parentSpanId: 'span-004-root',
      name: 'model.warmup',
      startTime: new Date(baseTime + 28300).toISOString(),
      endTime: new Date(baseTime + 32000).toISOString(),
      duration: 3700,
      status: 'OK',
      attributes: {
        'service.name': 'recommendation-service',
        'model.warmup_samples': 100,
      },
    },
  ];
}

/**
 * Generate spans for Cascading Failure (demo-report-005)
 */
function generateCascadeTraceSpans(): Span[] {
  const traceId = 'demo-trace-005';
  const baseTime = BASE_TIME + 900000; // 15 minutes after first trace

  return [
    {
      traceId,
      spanId: 'span-005-root',
      name: 'POST /orders/confirm',
      startTime: new Date(baseTime).toISOString(),
      endTime: new Date(baseTime + 95000).toISOString(),
      duration: 95000,
      status: 'ERROR',
      attributes: {
        'service.name': 'order-service',
        'http.method': 'POST',
        'http.route': '/orders/confirm',
        'http.status_code': 504,
        'run.id': 'demo-agent-run-005',
        'error': true,
      },
    },
    {
      traceId,
      spanId: 'span-005-notify',
      parentSpanId: 'span-005-root',
      name: 'notification-service.sendConfirmation',
      startTime: new Date(baseTime + 100).toISOString(),
      endTime: new Date(baseTime + 90100).toISOString(),
      duration: 90000,
      status: 'ERROR',
      attributes: {
        'service.name': 'order-service',
        'peer.service': 'notification-service',
        'http.status_code': 503,
        'error': true,
        'retry.count': 3,
        'retry.timeout_per_attempt_ms': 30000,
      },
    },
    {
      traceId,
      spanId: 'span-005-twilio',
      parentSpanId: 'span-005-notify',
      name: 'twilio.messages.create',
      startTime: new Date(baseTime + 200).toISOString(),
      endTime: new Date(baseTime + 30200).toISOString(),
      duration: 30000,
      status: 'ERROR',
      attributes: {
        'service.name': 'notification-service',
        'peer.service': 'twilio-api',
        'http.url': 'https://api.twilio.com/2010-04-01/Accounts/*/Messages.json',
        'http.status_code': 503,
        'error': true,
        'error.message': 'Service Unavailable - Twilio experiencing outage',
      },
      events: [
        {
          name: 'external_service_outage',
          time: new Date(baseTime + 30200).toISOString(),
          attributes: {
            'provider': 'twilio',
            'status_page': 'https://status.twilio.com',
            'incident': 'SMS API Degraded Performance',
          },
        },
      ],
    },
  ];
}

/**
 * All sample trace spans
 */
export const SAMPLE_TRACE_SPANS: Span[] = [
  ...generatePaymentTraceSpans(),
  ...generateCartErrorTraceSpans(),
  ...generateDbPoolTraceSpans(),
  ...generateColdStartTraceSpans(),
  ...generateCascadeTraceSpans(),
];

/**
 * Get sample spans for a specific run ID (via agent run ID in attributes)
 */
export function getSampleSpansForRunId(runId: string): Span[] {
  return SAMPLE_TRACE_SPANS.filter(span => span.attributes['run.id'] === runId);
}

/**
 * Get sample spans for multiple run IDs
 */
export function getSampleSpansForRunIds(runIds: string[]): Span[] {
  if (!runIds || runIds.length === 0) return [];
  return SAMPLE_TRACE_SPANS.filter(span => runIds.includes(span.attributes['run.id']));
}

/**
 * Get sample spans by trace ID
 */
export function getSampleSpansByTraceId(traceId: string): Span[] {
  return SAMPLE_TRACE_SPANS.filter(span => span.traceId === traceId);
}

/**
 * Get all sample trace spans
 */
export function getAllSampleTraceSpans(): Span[] {
  return [...SAMPLE_TRACE_SPANS];
}

/**
 * Check if a trace ID is a sample trace
 */
export function isSampleTraceId(traceId: string): boolean {
  return traceId.startsWith('demo-trace-');
}

/**
 * Get unique sample trace IDs
 */
export function getSampleTraceIds(): string[] {
  return [...new Set(SAMPLE_TRACE_SPANS.map(span => span.traceId))];
}
