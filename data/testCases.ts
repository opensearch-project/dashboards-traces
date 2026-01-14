/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { TestCase } from '@/types';

// Import test cases from separate category files
import baselineTestCases from './test_cases/baseline.json';
import smartContextMenuTestCases from './test_cases/smart_context_menu.json';
import rcaTestCases from './test_cases/rca.json';
import conversationalTestCases from './test_cases/conversational_queries.json';
import topBrowsedProductsTestCases from './test_cases/top_browsed_products.json';
import errorsByServiceTestCases from './test_cases/errors_by_service.json';
import groupByErrorTypeTestCases from './test_cases/group_by_error_type.json';

// Helper to add versioning fields to legacy test case data
function addVersioningFields(testCases: unknown[]): TestCase[] {
  const now = new Date().toISOString();
  return testCases.map((tc: any) => ({
    ...tc,
    currentVersion: tc.currentVersion ?? 1,
    versions: tc.versions ?? [{
      version: 1,
      createdAt: now,
      initialPrompt: tc.initialPrompt,
      context: tc.context || [],
      tools: tc.tools,
      expectedPPL: tc.expectedPPL,
      expectedTrajectory: tc.expectedTrajectory || [],
      followUpQuestions: tc.followUpQuestions,
    }],
    isPromoted: tc.isPromoted ?? true,  // Default to saved in My Test Cases
    createdAt: tc.createdAt ?? now,
    updatedAt: tc.updatedAt ?? now,
  }));
}

// Aggregate all test cases with versioning
export const TEST_CASES: TestCase[] = [
  ...addVersioningFields(baselineTestCases),
  ...addVersioningFields(smartContextMenuTestCases),
  ...addVersioningFields(rcaTestCases),
  ...addVersioningFields(conversationalTestCases),
  ...addVersioningFields(topBrowsedProductsTestCases),
  ...addVersioningFields(errorsByServiceTestCases),
  ...addVersioningFields(groupByErrorTypeTestCases),
];

// Alias for UI terminology (TestCase = "Use Case" in UI)
export const USE_CASES = TEST_CASES;

// Extract unique categories for filtering
export const CATEGORIES = [...new Set(TEST_CASES.map(tc => tc.category))];
