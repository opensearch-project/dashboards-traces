/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for asyncRunStorage
 *
 * These tests require the backend server to be running:
 *   npm run dev:server
 *
 * Run tests:
 *   npm test -- --testPathPattern=runStorage.integration
 */

import { asyncRunStorage } from '@/services/storage/asyncRunStorage';
import { storageAdmin } from '@/services/storage/opensearchClient';
import type { EvaluationReport } from '@/types';

const checkBackend = async (): Promise<boolean> => {
  try {
    const health = await storageAdmin.health();
    return health.status === 'connected';
  } catch {
    return false;
  }
};

/** Build a minimal valid report for testing */
function buildReport(overrides: Partial<EvaluationReport> = {}): EvaluationReport {
  const id = `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  return {
    id,
    timestamp: new Date().toISOString(),
    testCaseId: overrides.testCaseId ?? 'tc-integration-test',
    testCaseVersion: 1,
    agentName: 'integration-test-agent',
    agentKey: 'integration-test-agent',
    modelName: 'test-model',
    modelId: 'test-model',
    status: 'completed',
    passFailStatus: 'passed',
    trajectory: [],
    metrics: { accuracy: 85 },
    llmJudgeReasoning: 'Integration test reasoning',
    ...overrides,
  };
}

describe('Run Storage Integration Tests', () => {
  let backendAvailable = false;
  const createdReportIds: string[] = [];

  beforeAll(async () => {
    backendAvailable = await checkBackend();
    if (!backendAvailable) {
      console.warn('Backend not available - skipping run storage integration tests');
    }
  });

  afterAll(async () => {
    if (!backendAvailable) return;
    // Cleanup all created reports
    for (const id of createdReportIds) {
      try {
        await asyncRunStorage.deleteReport(id);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('report save & retrieve', () => {
    it('should save a report and return a valid ID', async () => {
      if (!backendAvailable) return;

      const report = buildReport();
      const saved = await asyncRunStorage.saveReport(report);

      expect(saved).toBeDefined();
      expect(saved.id).toBeDefined();
      expect(typeof saved.id).toBe('string');
      createdReportIds.push(saved.id);
    });

    it('should retrieve a saved report by ID', async () => {
      if (!backendAvailable) return;

      const report = buildReport();
      const saved = await asyncRunStorage.saveReport(report);
      createdReportIds.push(saved.id);

      const retrieved = await asyncRunStorage.getReportById(saved.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(saved.id);
      expect(retrieved?.testCaseId).toBe(report.testCaseId);
      expect(retrieved?.agentName).toBe(report.agentName);
      expect(retrieved?.metrics.accuracy).toBe(85);
    });
  });

  describe('report with benchmark context', () => {
    it('should save a report with experimentId and experimentRunId', async () => {
      if (!backendAvailable) return;

      const report = buildReport();
      const saved = await asyncRunStorage.saveReport(report, {
        experimentId: 'bench-integration-test',
        experimentRunId: 'run-integration-test',
      });
      createdReportIds.push(saved.id);

      const retrieved = await asyncRunStorage.getReportById(saved.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.experimentId).toBe('bench-integration-test');
      expect(retrieved?.experimentRunId).toBe('run-integration-test');
    });
  });

  describe('reports by test case', () => {
    const testCaseIdA = `tc-integ-a-${Date.now()}`;
    const testCaseIdB = `tc-integ-b-${Date.now()}`;

    it('should filter reports by test case ID', async () => {
      if (!backendAvailable) return;

      // Save two reports for testCaseIdA
      const reportA1 = buildReport({ testCaseId: testCaseIdA });
      const savedA1 = await asyncRunStorage.saveReport(reportA1);
      createdReportIds.push(savedA1.id);

      const reportA2 = buildReport({ testCaseId: testCaseIdA });
      const savedA2 = await asyncRunStorage.saveReport(reportA2);
      createdReportIds.push(savedA2.id);

      // Save one report for testCaseIdB
      const reportB = buildReport({ testCaseId: testCaseIdB });
      const savedB = await asyncRunStorage.saveReport(reportB);
      createdReportIds.push(savedB.id);

      const resultA = await asyncRunStorage.getReportsByTestCase(testCaseIdA);
      expect(resultA.reports.length).toBeGreaterThanOrEqual(2);
      expect(resultA.reports.every(r => r.testCaseId === testCaseIdA)).toBe(true);

      const resultB = await asyncRunStorage.getReportsByTestCase(testCaseIdB);
      expect(resultB.reports.length).toBeGreaterThanOrEqual(1);
      expect(resultB.reports.every(r => r.testCaseId === testCaseIdB)).toBe(true);
    });
  });

  describe('report pagination', () => {
    it('should paginate with limit and offset', async () => {
      if (!backendAvailable) return;

      const reports = await asyncRunStorage.getAllReports({ limit: 2, offset: 0 });
      expect(Array.isArray(reports)).toBe(true);
      expect(reports.length).toBeLessThanOrEqual(2);
    });
  });

  describe('report update', () => {
    it('should update report fields and verify on re-fetch', async () => {
      if (!backendAvailable) return;

      const report = buildReport({ passFailStatus: 'passed' });
      const saved = await asyncRunStorage.saveReport(report);
      createdReportIds.push(saved.id);

      await asyncRunStorage.updateReport(saved.id, {
        passFailStatus: 'failed',
        llmJudgeReasoning: 'Updated reasoning after re-evaluation',
        metrics: { accuracy: 42 },
      });

      const updated = await asyncRunStorage.getReportById(saved.id);
      expect(updated).toBeDefined();
      expect(updated?.passFailStatus).toBe('failed');
      expect(updated?.llmJudgeReasoning).toBe('Updated reasoning after re-evaluation');
      expect(updated?.metrics.accuracy).toBe(42);
    });
  });

  describe('report deletion', () => {
    it('should delete a report and return null on subsequent fetch', async () => {
      if (!backendAvailable) return;

      const report = buildReport();
      const saved = await asyncRunStorage.saveReport(report);

      const deleted = await asyncRunStorage.deleteReport(saved.id);
      expect(deleted).toBe(true);

      const retrieved = await asyncRunStorage.getReportById(saved.id);
      expect(retrieved).toBeNull();
    });
  });
});
