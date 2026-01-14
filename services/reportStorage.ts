/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EvaluationReport, TestCaseRun, RunAnnotation } from '@/types';

// Storage keys (migrated from 'eval_reports_by_testcase' to 'test_case_runs')
const TEST_CASE_RUNS_KEY = 'test_case_runs';
const LEGACY_REPORTS_KEY = 'eval_reports_by_testcase';
const ANNOTATIONS_KEY = 'eval_annotations';

// Types for storage
interface ReportsByTestCase {
  [testCaseId: string]: EvaluationReport[];
}

interface AnnotationsByReport {
  [reportId: string]: RunAnnotation[];
}

export interface SearchQuery {
  testCaseIds?: string[];
  dateRange?: { start: string; end: string };
  agentNames?: string[];
  modelNames?: string[];
  minAccuracy?: number;
  status?: ('running' | 'completed' | 'failed')[];
  hasAnnotations?: boolean;
  annotationTags?: string[];
}

export interface GetReportsOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'accuracy';
  order?: 'asc' | 'desc';
}


export interface StorageStats {
  totalReports: number;
  reportsByTestCase: Record<string, number>;
  totalAnnotations: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  usagePercent: number;
}

class ReportStorage {
  // ==================== Core CRUD Operations ====================

  /**
   * Save a report, organizing it by test case ID
   * Automatically prunes old reports if storage quota is exceeded
   */
  saveReport(report: EvaluationReport): void {
    const trySave = (retryCount = 0): void => {
      try {
        const reportsByTestCase = this.getReportsByTestCaseRaw();

        // Ensure test case array exists
        if (!reportsByTestCase[report.testCaseId]) {
          reportsByTestCase[report.testCaseId] = [];
        }

        // Check if report already exists (update case)
        const existingIndex = reportsByTestCase[report.testCaseId].findIndex(
          r => r.id === report.id
        );

        if (existingIndex >= 0) {
          // Update existing report
          reportsByTestCase[report.testCaseId][existingIndex] = report;
        } else {
          // Add new report
          reportsByTestCase[report.testCaseId].push(report);
        }

        // Sort by timestamp (newest first)
        reportsByTestCase[report.testCaseId].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Save back to localStorage
        localStorage.setItem(TEST_CASE_RUNS_KEY, JSON.stringify(reportsByTestCase));
      } catch (error) {
        // Check if it's a quota error and we haven't retried too many times
        if (error instanceof DOMException &&
            (error.name === 'QuotaExceededError' || error.code === 22) &&
            retryCount < 5) {
          console.warn(`Storage quota exceeded, pruning old reports (attempt ${retryCount + 1})...`);
          const pruned = this.pruneOldReports(5); // Remove 5 oldest reports
          if (pruned > 0) {
            trySave(retryCount + 1); // Retry save
            return;
          }
        }
        console.error('Error saving report:', error);
        throw new Error(`Failed to save report: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };

    trySave();
  }

  /**
   * Prune oldest reports to free up storage space
   * @param count Number of reports to remove
   * @returns Number of reports actually removed
   */
  pruneOldReports(count: number): number {
    try {
      const allReports = this.getAllReports({ sortBy: 'timestamp', order: 'asc' }); // oldest first
      const toRemove = allReports.slice(0, count);

      let removed = 0;
      for (const report of toRemove) {
        if (this.deleteReport(report.id)) {
          removed++;
          console.log(`Pruned old report: ${report.id} (${report.testCaseId})`);
        }
      }

      return removed;
    } catch (error) {
      console.error('Error pruning old reports:', error);
      return 0;
    }
  }

  /**
   * Clear all reports and annotations
   */
  clearAllData(): void {
    try {
      localStorage.removeItem(TEST_CASE_RUNS_KEY);
      localStorage.removeItem(ANNOTATIONS_KEY);
      localStorage.removeItem(LEGACY_REPORTS_KEY);
      console.log('All report storage cleared');
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  /**
   * Get all reports for a specific test case
   */
  getReportsByTestCase(
    testCaseId: string,
    options: GetReportsOptions = {}
  ): EvaluationReport[] {
    const { limit, offset = 0, sortBy = 'timestamp', order = 'desc' } = options;

    const reportsByTestCase = this.getReportsByTestCaseRaw();
    let reports = reportsByTestCase[testCaseId] || [];

    // Apply sorting if different from default
    if (sortBy === 'accuracy') {
      reports = [...reports].sort((a, b) => {
        const aVal = a.metrics.accuracy;
        const bVal = b.metrics.accuracy;
        return order === 'asc' ? aVal - bVal : bVal - aVal;
      });
    } else if (order === 'asc') {
      reports = [...reports].reverse();
    }

    // Apply pagination
    const start = offset;
    const end = limit ? offset + limit : reports.length;

    return reports.slice(start, end);
  }

  /**
   * Get all reports across all test cases
   */
  getAllReports(options: GetReportsOptions = {}): EvaluationReport[] {
    const { sortBy = 'timestamp', order = 'desc' } = options;

    const reportsByTestCase = this.getReportsByTestCaseRaw();
    const allReports: EvaluationReport[] = [];

    // Flatten all reports
    for (const reports of Object.values(reportsByTestCase)) {
      allReports.push(...reports);
    }

    // Sort
    if (sortBy === 'timestamp') {
      allReports.sort((a, b) => {
        const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        return order === 'asc' ? -diff : diff;
      });
    } else if (sortBy === 'accuracy') {
      allReports.sort((a, b) => {
        const diff = a.metrics.accuracy - b.metrics.accuracy;
        return order === 'asc' ? diff : -diff;
      });
    }

    return allReports;
  }

  /**
   * Get a single report by ID
   */
  getReportById(reportId: string): EvaluationReport | null {
    const reportsByTestCase = this.getReportsByTestCaseRaw();

    for (const reports of Object.values(reportsByTestCase)) {
      const report = reports.find(r => r.id === reportId);
      if (report) {
        return report;
      }
    }

    return null;
  }

  /**
   * Delete a report and its annotations
   */
  deleteReport(reportId: string): boolean {
    try {
      const reportsByTestCase = this.getReportsByTestCaseRaw();
      let found = false;

      // Find and remove the report
      for (const testCaseId in reportsByTestCase) {
        const reports = reportsByTestCase[testCaseId];
        const index = reports.findIndex(r => r.id === reportId);

        if (index >= 0) {
          reports.splice(index, 1);
          found = true;

          // Clean up empty arrays
          if (reports.length === 0) {
            delete reportsByTestCase[testCaseId];
          }

          break;
        }
      }

      if (found) {
        localStorage.setItem(TEST_CASE_RUNS_KEY, JSON.stringify(reportsByTestCase));

        // Delete associated annotations
        const annotations = this.getAnnotationsByReportRaw();
        if (annotations[reportId]) {
          delete annotations[reportId];
          localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
        }
      }

      return found;
    } catch (error) {
      console.error('Error deleting report:', error);
      return false;
    }
  }

  /**
   * Get total count of reports
   */
  getReportCount(): number {
    const reportsByTestCase = this.getReportsByTestCaseRaw();
    let count = 0;

    for (const reports of Object.values(reportsByTestCase)) {
      count += reports.length;
    }

    return count;
  }

  /**
   * Get report count for a specific test case
   */
  getReportCountByTestCase(testCaseId: string): number {
    const reportsByTestCase = this.getReportsByTestCaseRaw();
    return reportsByTestCase[testCaseId]?.length || 0;
  }

  // ==================== Annotation Operations ====================

  /**
   * Add an annotation to a report
   */
  addAnnotation(
    reportId: string,
    annotation: Omit<RunAnnotation, 'id' | 'timestamp'>
  ): RunAnnotation {
    try {
      const annotations = this.getAnnotationsByReportRaw();

      // Create full annotation
      const fullAnnotation: RunAnnotation = {
        ...annotation,
        id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
      };

      // Ensure array exists
      if (!annotations[reportId]) {
        annotations[reportId] = [];
      }

      annotations[reportId].push(fullAnnotation);

      // Save
      localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));

      return fullAnnotation;
    } catch (error) {
      console.error('Error adding annotation:', error);
      throw new Error(`Failed to add annotation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing annotation
   */
  updateAnnotation(annotationId: string, updates: Partial<RunAnnotation>): boolean {
    try {
      const annotations = this.getAnnotationsByReportRaw();
      let found = false;

      // Find and update the annotation
      for (const reportId in annotations) {
        const anns = annotations[reportId];
        const index = anns.findIndex(a => a.id === annotationId);

        if (index >= 0) {
          anns[index] = { ...anns[index], ...updates };
          found = true;
          break;
        }
      }

      if (found) {
        localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
      }

      return found;
    } catch (error) {
      console.error('Error updating annotation:', error);
      return false;
    }
  }

  /**
   * Delete an annotation
   */
  deleteAnnotation(annotationId: string): boolean {
    try {
      const annotations = this.getAnnotationsByReportRaw();
      let found = false;

      for (const reportId in annotations) {
        const anns = annotations[reportId];
        const index = anns.findIndex(a => a.id === annotationId);

        if (index >= 0) {
          anns.splice(index, 1);
          found = true;

          // Clean up empty arrays
          if (anns.length === 0) {
            delete annotations[reportId];
          }

          break;
        }
      }

      if (found) {
        localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
      }

      return found;
    } catch (error) {
      console.error('Error deleting annotation:', error);
      return false;
    }
  }

  /**
   * Get all annotations for a report
   */
  getAnnotationsByReport(reportId: string): RunAnnotation[] {
    const annotations = this.getAnnotationsByReportRaw();
    return annotations[reportId] || [];
  }

  // ==================== Search and Filter ====================

  /**
   * Search reports with complex filtering
   */
  searchReports(query: SearchQuery): EvaluationReport[] {
    let reports = this.getAllReports();

    // Filter by test case IDs
    if (query.testCaseIds && query.testCaseIds.length > 0) {
      reports = reports.filter(r => query.testCaseIds!.includes(r.testCaseId));
    }

    // Filter by date range
    if (query.dateRange) {
      const startTime = new Date(query.dateRange.start).getTime();
      const endTime = new Date(query.dateRange.end).getTime();
      reports = reports.filter(r => {
        const timestamp = new Date(r.timestamp).getTime();
        return timestamp >= startTime && timestamp <= endTime;
      });
    }

    // Filter by agent names
    if (query.agentNames && query.agentNames.length > 0) {
      reports = reports.filter(r => query.agentNames!.includes(r.agentName));
    }

    // Filter by model names
    if (query.modelNames && query.modelNames.length > 0) {
      reports = reports.filter(r => query.modelNames!.includes(r.modelName));
    }

    // Filter by minimum accuracy
    if (query.minAccuracy !== undefined) {
      reports = reports.filter(r => r.metrics.accuracy >= query.minAccuracy!);
    }

    // Filter by status
    if (query.status && query.status.length > 0) {
      reports = reports.filter(r => query.status!.includes(r.status));
    }

    // Filter by has annotations
    if (query.hasAnnotations !== undefined) {
      const allAnnotations = this.getAnnotationsByReportRaw();
      reports = reports.filter(r => {
        const hasAnns = !!(allAnnotations[r.id] && allAnnotations[r.id].length > 0);
        return hasAnns === query.hasAnnotations;
      });
    }

    // Filter by annotation tags
    if (query.annotationTags && query.annotationTags.length > 0) {
      const allAnnotations = this.getAnnotationsByReportRaw();
      reports = reports.filter(r => {
        const anns = allAnnotations[r.id] || [];
        return anns.some(ann =>
          ann.tags?.some(tag => query.annotationTags!.includes(tag))
        );
      });
    }

    return reports;
  }

  // ==================== Import/Export ====================

  /**
   * Export reports to JSON
   */
  exportReports(options: { testCaseIds?: string[]; includeAnnotations?: boolean } = {}): string {
    const { testCaseIds, includeAnnotations = true } = options;

    let reports: EvaluationReport[];
    if (testCaseIds && testCaseIds.length > 0) {
      reports = [];
      testCaseIds.forEach(tcId => {
        reports.push(...this.getReportsByTestCase(tcId));
      });
    } else {
      reports = this.getAllReports();
    }

    const exportData: any = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      reports,
    };

    if (includeAnnotations) {
      const allAnnotations = this.getAnnotationsByReportRaw();
      const relevantAnnotations: AnnotationsByReport = {};

      reports.forEach(report => {
        if (allAnnotations[report.id]) {
          relevantAnnotations[report.id] = allAnnotations[report.id];
        }
      });

      exportData.annotations = relevantAnnotations;
    }

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import reports from JSON
   */
  importReports(jsonData: string): { imported: number; skipped: number; errors: string[] } {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      const data = JSON.parse(jsonData);

      // Validate format
      if (!data.version || !data.reports || !Array.isArray(data.reports)) {
        throw new Error('Invalid export format');
      }

      const existingIds = new Set<string>();
      const allReports = this.getAllReports();
      allReports.forEach(r => existingIds.add(r.id));

      // Import reports
      data.reports.forEach((report: EvaluationReport, index: number) => {
        try {
          // Validate report
          if (!this.validateReportSchema(report)) {
            result.errors.push(`Report ${index}: Invalid schema`);
            result.skipped++;
            return;
          }

          // Check for duplicates
          if (existingIds.has(report.id)) {
            result.skipped++;
            return;
          }

          // Save report
          this.saveReport(report);
          result.imported++;
        } catch (error) {
          result.errors.push(
            `Report ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
          result.skipped++;
        }
      });

      // Import annotations if present
      if (data.annotations) {
        const annotations = this.getAnnotationsByReportRaw();

        for (const reportId in data.annotations) {
          if (!annotations[reportId]) {
            annotations[reportId] = [];
          }

          data.annotations[reportId].forEach((ann: RunAnnotation) => {
            // Check for duplicate annotation IDs
            if (!annotations[reportId].some(a => a.id === ann.id)) {
              annotations[reportId].push(ann);
            }
          });
        }

        localStorage.setItem(ANNOTATIONS_KEY, JSON.stringify(annotations));
      }

    } catch (error) {
      result.errors.push(`Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate report schema
   */
  validateReportSchema(report: any): boolean {
    return !!(
      report &&
      typeof report === 'object' &&
      report.id &&
      report.timestamp &&
      report.agentName &&
      report.modelName &&
      report.testCaseId &&
      report.status &&
      Array.isArray(report.trajectory) &&
      report.metrics
    );
  }

  // ==================== Storage Stats ====================

  /**
   * Get storage statistics
   */
  getStorageStats(): StorageStats {
    const reportsByTestCase = this.getReportsByTestCaseRaw();
    const annotations = this.getAnnotationsByReportRaw();

    // Calculate counts
    const reportCounts: Record<string, number> = {};
    let totalReports = 0;
    let totalAnnotations = 0;

    for (const testCaseId in reportsByTestCase) {
      const count = reportsByTestCase[testCaseId].length;
      reportCounts[testCaseId] = count;
      totalReports += count;
    }

    for (const anns of Object.values(annotations)) {
      totalAnnotations += anns.length;
    }

    // Calculate storage usage
    let storageUsed = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          storageUsed += key.length + value.length;
        }
      }
    }

    const storageQuota = 10 * 1024 * 1024; // Approximate 10MB
    const usagePercent = (storageUsed / storageQuota) * 100;

    return {
      totalReports,
      reportsByTestCase: reportCounts,
      totalAnnotations,
      storageUsedBytes: storageUsed,
      storageQuotaBytes: storageQuota,
      usagePercent,
    };
  }

  // ==================== Private Helpers ====================

  private getReportsByTestCaseRaw(): ReportsByTestCase {
    // Check new key first
    let data = localStorage.getItem(TEST_CASE_RUNS_KEY);

    // Migrate from legacy key if needed
    if (!data) {
      const legacyData = localStorage.getItem(LEGACY_REPORTS_KEY);
      if (legacyData) {
        try {
          const parsed = JSON.parse(legacyData);
          // Migrate: add testCaseVersion: 1 to all existing reports
          for (const testCaseId in parsed) {
            parsed[testCaseId] = parsed[testCaseId].map((report: EvaluationReport) => ({
              ...report,
              testCaseVersion: report.testCaseVersion ?? 1,
            }));
          }
          // Save to new key
          localStorage.setItem(TEST_CASE_RUNS_KEY, JSON.stringify(parsed));
          // Remove legacy key
          localStorage.removeItem(LEGACY_REPORTS_KEY);
          return parsed;
        } catch (error) {
          console.error('Error migrating legacy reports:', error);
        }
      }
      return {};
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing reports:', error);
      return {};
    }
  }

  private getAnnotationsByReportRaw(): AnnotationsByReport {
    const data = localStorage.getItem(ANNOTATIONS_KEY);
    if (!data) {
      return {};
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing annotations:', error);
      return {};
    }
  }
}

// Export singleton instance
export const reportStorage = new ReportStorage();

// Alias for new naming convention
export const testCaseRunStorage = reportStorage;
