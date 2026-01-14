/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for server-side tracesService
 */

import {
  transformSpan,
  fetchTraces,
  checkTracesHealth,
  OpenSearchSpanSource,
  OpenSearchConfig,
} from '../tracesService';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('transformSpan', () => {
  const createOpenSearchSpan = (overrides: Partial<OpenSearchSpanSource> = {}): OpenSearchSpanSource => ({
    traceId: 'trace-123',
    spanId: 'span-456',
    parentSpanId: 'span-parent',
    name: 'test-operation',
    startTime: '2024-01-15T10:00:00.000Z',
    endTime: '2024-01-15T10:00:01.000Z',
    durationInNanos: 1000000000,
    kind: 'INTERNAL',
    serviceName: 'test-service',
    'status.code': 1,
    ...overrides,
  });

  describe('basic field mapping', () => {
    it('maps traceId, spanId, parentSpanId', () => {
      const source = createOpenSearchSpan({
        traceId: 'my-trace',
        spanId: 'my-span',
        parentSpanId: 'parent-span',
      });

      const result = transformSpan(source);

      expect(result.traceId).toBe('my-trace');
      expect(result.spanId).toBe('my-span');
      expect(result.parentSpanId).toBe('parent-span');
    });

    it('maps name, startTime, endTime', () => {
      const source = createOpenSearchSpan({
        name: 'bedrock.converse',
        startTime: '2024-01-15T10:00:00.000Z',
        endTime: '2024-01-15T10:00:05.000Z',
      });

      const result = transformSpan(source);

      expect(result.name).toBe('bedrock.converse');
      expect(result.startTime).toBe('2024-01-15T10:00:00.000Z');
      expect(result.endTime).toBe('2024-01-15T10:00:05.000Z');
    });
  });

  describe('duration conversion', () => {
    it('converts durationInNanos to milliseconds', () => {
      const source = createOpenSearchSpan({
        durationInNanos: 1500000000, // 1.5 seconds in nanos
      });

      const result = transformSpan(source);

      expect(result.duration).toBe(1500); // milliseconds
    });

    it('returns null for missing durationInNanos', () => {
      const source = createOpenSearchSpan({
        durationInNanos: undefined,
      });

      const result = transformSpan(source);

      expect(result.duration).toBeNull();
    });

    it('handles small durations correctly', () => {
      const source = createOpenSearchSpan({
        durationInNanos: 100000, // 0.1ms
      });

      const result = transformSpan(source);

      expect(result.duration).toBe(0.1);
    });
  });

  describe('status mapping', () => {
    it('maps status.code 2 to ERROR', () => {
      const source = createOpenSearchSpan({ 'status.code': 2 });

      const result = transformSpan(source);

      expect(result.status).toBe('ERROR');
    });

    it('maps status.code 1 to OK', () => {
      const source = createOpenSearchSpan({ 'status.code': 1 });

      const result = transformSpan(source);

      expect(result.status).toBe('OK');
    });

    it('maps status.code 0 to UNSET', () => {
      const source = createOpenSearchSpan({ 'status.code': 0 });

      const result = transformSpan(source);

      expect(result.status).toBe('UNSET');
    });

    it('maps undefined status.code to UNSET', () => {
      const source = createOpenSearchSpan({ 'status.code': undefined });

      const result = transformSpan(source);

      expect(result.status).toBe('UNSET');
    });
  });

  describe('attribute extraction', () => {
    it('extracts span.attributes.* fields', () => {
      const source = createOpenSearchSpan({
        'span.attributes.gen_ai@request@model': 'claude-3',
        'span.attributes.gen_ai@usage@input_tokens': 100,
      });

      const result = transformSpan(source);

      expect(result.attributes['gen_ai.request.model']).toBe('claude-3');
      expect(result.attributes['gen_ai.usage.input_tokens']).toBe(100);
    });

    it('extracts resource.attributes.* fields', () => {
      const source = createOpenSearchSpan({
        'resource.attributes.service@name': 'my-service',
        'resource.attributes.deployment@environment': 'production',
      });

      const result = transformSpan(source);

      expect(result.attributes['service.name']).toBe('my-service');
      expect(result.attributes['deployment.environment']).toBe('production');
    });

    it('converts @ notation to dot notation in attributes', () => {
      const source = createOpenSearchSpan({
        'span.attributes.deeply@nested@attribute@name': 'value',
      });

      const result = transformSpan(source);

      expect(result.attributes['deeply.nested.attribute.name']).toBe('value');
    });

    it('adds spanKind and serviceName to attributes', () => {
      const source = createOpenSearchSpan({
        kind: 'CLIENT',
        serviceName: 'payment-service',
      });

      const result = transformSpan(source);

      expect(result.attributes['spanKind']).toBe('CLIENT');
      expect(result.attributes['serviceName']).toBe('payment-service');
    });

    it('adds instrumentationScope.name to attributes', () => {
      const source = createOpenSearchSpan({
        'instrumentationScope.name': 'opentelemetry-python',
      });

      const result = transformSpan(source);

      expect(result.attributes['instrumentation.scope.name']).toBe('opentelemetry-python');
    });
  });

  describe('events processing', () => {
    it('processes events with @ to . notation conversion', () => {
      const source = createOpenSearchSpan({
        events: [
          {
            name: 'exception',
            time: '2024-01-15T10:00:00.500Z',
            attributes: {
              'exception@type': 'ValueError',
              'exception@message': 'Invalid input',
            },
          },
        ],
      });

      const result = transformSpan(source);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('exception');
      expect(result.events[0].time).toBe('2024-01-15T10:00:00.500Z');
      expect(result.events[0].attributes['exception.type']).toBe('ValueError');
      expect(result.events[0].attributes['exception.message']).toBe('Invalid input');
    });

    it('handles events with no attributes', () => {
      const source = createOpenSearchSpan({
        events: [
          {
            name: 'start_processing',
            time: '2024-01-15T10:00:00.000Z',
          },
        ],
      });

      const result = transformSpan(source);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].attributes).toEqual({});
    });

    it('handles missing events', () => {
      const source = createOpenSearchSpan({
        events: undefined,
      });

      const result = transformSpan(source);

      expect(result.events).toEqual([]);
    });

    it('handles empty events array', () => {
      const source = createOpenSearchSpan({
        events: [],
      });

      const result = transformSpan(source);

      expect(result.events).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles minimal span with only required fields', () => {
      const source: OpenSearchSpanSource = {
        traceId: 't1',
        spanId: 's1',
      };

      const result = transformSpan(source);

      expect(result.traceId).toBe('t1');
      expect(result.spanId).toBe('s1');
      expect(result.status).toBe('UNSET');
      expect(result.events).toEqual([]);
      expect(result.attributes).toBeDefined();
    });

    it('preserves undefined optional fields', () => {
      const source = createOpenSearchSpan({
        parentSpanId: undefined,
      });

      const result = transformSpan(source);

      expect(result.parentSpanId).toBeUndefined();
    });
  });
});

describe('fetchTraces', () => {
  const defaultConfig: OpenSearchConfig = {
    endpoint: 'https://opensearch.example.com',
    username: 'admin',
    password: 'password123',
    indexPattern: 'otel-v1-apm-span-*',
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('validation', () => {
    it('throws error when no traceId, runIds, or time range provided', async () => {
      await expect(fetchTraces({}, defaultConfig)).rejects.toThrow(
        'Either traceId, runIds, or time range is required'
      );
    });

    it('does not throw when traceId is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await expect(fetchTraces({ traceId: 'trace-123' }, defaultConfig)).resolves.toBeDefined();
    });

    it('does not throw when runIds is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await expect(fetchTraces({ runIds: ['run-1'] }, defaultConfig)).resolves.toBeDefined();
    });

    it('does not throw when time range is provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await expect(fetchTraces({ startTime: 1000 }, defaultConfig)).resolves.toBeDefined();
    });
  });

  describe('query building', () => {
    it('builds query with traceId filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 'trace-abc' }, defaultConfig);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://opensearch.example.com/otel-v1-apm-span-*/_search');
      const body = JSON.parse(options.body);
      expect(body.query.bool.must).toContainEqual({ term: { 'traceId': 'trace-abc' } });
    });

    it('builds query with runIds filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ runIds: ['run-1', 'run-2'] }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.query.bool.must).toContainEqual({
        terms: { 'span.attributes.gen_ai@request@id': ['run-1', 'run-2'] }
      });
    });

    it('builds query with time range filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ startTime: 1000, endTime: 2000 }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const rangeFilter = body.query.bool.must.find((m: any) => m.range);
      // Implementation converts timestamps to ISO strings
      expect(rangeFilter.range.startTime.gte).toBe(new Date(1000).toISOString());
      expect(rangeFilter.range.startTime.lte).toBe(new Date(2000).toISOString());
    });

    it('builds query with serviceName filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 't1', serviceName: 'my-service' }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Implementation uses bool/should query to check both serviceName and agent name
      const serviceFilter = body.query.bool.must.find((m: any) => m.bool?.should);
      expect(serviceFilter.bool.should).toContainEqual({ term: { 'serviceName': 'my-service' } });
    });

    it('builds query with textSearch filter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 't1', textSearch: 'error' }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Implementation uses query_string instead of multi_match
      const queryString = body.query.bool.must.find((m: any) => m.query_string);
      expect(queryString.query_string.query).toBe('*error*');
      expect(queryString.query_string.fields).toContain('name');
    });

    it('uses custom size parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 't1', size: 100 }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(100);
    });

    it('uses default size of 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 't1' }, defaultConfig);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.size).toBe(500);
    });

    it('includes Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      await fetchTraces({ traceId: 't1' }, defaultConfig);

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Authorization']).toMatch(/^Basic /);
    });
  });

  describe('response handling', () => {
    it('transforms spans from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: {
            hits: [
              {
                _source: {
                  traceId: 'trace-1',
                  spanId: 'span-1',
                  name: 'test-span',
                  durationInNanos: 1000000000,
                  'status.code': 1,
                }
              }
            ],
            total: { value: 1 }
          }
        }),
      });

      const result = await fetchTraces({ traceId: 'trace-1' }, defaultConfig);

      expect(result.spans).toHaveLength(1);
      expect(result.spans[0].traceId).toBe('trace-1');
      expect(result.spans[0].spanId).toBe('span-1');
      expect(result.spans[0].duration).toBe(1000);
      expect(result.spans[0].status).toBe('OK');
      expect(result.total).toBe(1);
    });

    it('handles empty results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ hits: { hits: [], total: { value: 0 } } }),
      });

      const result = await fetchTraces({ traceId: 't1' }, defaultConfig);

      expect(result.spans).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('handles missing total in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          hits: {
            hits: [{ _source: { traceId: 't1', spanId: 's1' } }]
          }
        }),
      });

      const result = await fetchTraces({ traceId: 't1' }, defaultConfig);

      expect(result.total).toBe(1); // falls back to spans.length
    });
  });

  describe('error handling', () => {
    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(fetchTraces({ traceId: 't1' }, defaultConfig)).rejects.toThrow('OpenSearch error: Bad request');
    });

    it('throws error on 500 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      await expect(fetchTraces({ traceId: 't1' }, defaultConfig)).rejects.toThrow('OpenSearch error: Internal server error');
    });
  });
});

describe('checkTracesHealth', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('configuration validation', () => {
    it('returns error when endpoint not configured', async () => {
      const result = await checkTracesHealth({
        endpoint: '',
        username: 'admin',
        password: 'password',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('OpenSearch not configured');
    });

    it('returns error when username not configured', async () => {
      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: '',
        password: 'password',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('OpenSearch not configured');
    });

    it('returns error when password not configured', async () => {
      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: '',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('OpenSearch not configured');
    });
  });

  describe('health check', () => {
    it('returns ok on successful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: 'password',
        indexPattern: 'custom-index-*',
      });

      expect(result.status).toBe('ok');
      expect(result.index).toBe('custom-index-*');
    });

    it('returns error on failed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: 'password',
      });

      expect(result.status).toBe('error');
      expect(result.index).toBe('otel-v1-apm-span-*');
    });

    it('returns error on network exception', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: 'password',
      });

      expect(result.status).toBe('error');
      expect(result.error).toBe('Network error');
    });

    it('uses default index pattern when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: 'password',
      });

      expect(result.index).toBe('otel-v1-apm-span-*');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('otel-v1-apm-span-*');
    });

    it('includes Authorization header in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      await checkTracesHealth({
        endpoint: 'https://example.com',
        username: 'admin',
        password: 'password',
      });

      const options = mockFetch.mock.calls[0][1];
      expect(options.headers['Authorization']).toMatch(/^Basic /);
    });
  });
});
