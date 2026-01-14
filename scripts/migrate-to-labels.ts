#!/usr/bin/env npx ts-node
/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Migration Script: Convert category/subcategory/difficulty to unified labels system
 *
 * Usage:
 *   npx ts-node scripts/migrate-to-labels.ts [options]
 *
 * Options:
 *   --dry-run     Preview changes without writing to OpenSearch
 *   --verbose     Show detailed output for each test case
 *   --cleanup     Remove legacy fields after migration
 *
 * Examples:
 *   npx ts-node scripts/migrate-to-labels.ts --dry-run --verbose
 *   npx ts-node scripts/migrate-to-labels.ts
 *   npx ts-node scripts/migrate-to-labels.ts --cleanup
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// OpenSearch configuration from environment
const OPENSEARCH_ENDPOINT = process.env.OPENSEARCH_STORAGE_ENDPOINT || 'http://localhost:9200';
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_STORAGE_USERNAME || 'admin';
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_STORAGE_PASSWORD || 'admin';
const TEST_CASES_INDEX = 'evals_test_cases';

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const doCleanup = args.includes('--cleanup');

interface StorageTestCase {
  id: string;
  name: string;
  version: number;
  initialPrompt: string;
  labels?: string[];
  category?: string;
  subcategory?: string;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  [key: string]: unknown;
}

interface MigrationStats {
  total: number;
  migrated: number;
  skipped: number;
  cleaned: number;
  errors: string[];
}

/**
 * Build labels array from legacy fields
 */
function buildLabels(fields: {
  category?: string;
  subcategory?: string;
  difficulty?: string;
}): string[] {
  const labels: string[] = [];
  if (fields.difficulty) {
    labels.push(`difficulty:${fields.difficulty}`);
  }
  if (fields.category) {
    labels.push(`category:${fields.category}`);
  }
  if (fields.subcategory) {
    labels.push(`subcategory:${fields.subcategory}`);
  }
  return labels;
}

/**
 * Make authenticated request to OpenSearch
 */
async function opensearchRequest(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<unknown> {
  const url = `${OPENSEARCH_ENDPOINT}${endpoint}`;
  const auth = Buffer.from(`${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}`).toString('base64');

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenSearch request failed: ${response.status} ${text}`);
  }

  return response.json();
}

/**
 * Fetch all test cases from OpenSearch
 */
async function fetchAllTestCases(): Promise<StorageTestCase[]> {
  const query = {
    query: {
      match_all: {},
    },
    size: 10000,
    sort: [{ createdAt: { order: 'desc' } }],
  };

  const result = (await opensearchRequest('POST', `/${TEST_CASES_INDEX}/_search`, query)) as {
    hits: { hits: Array<{ _id: string; _source: StorageTestCase }> };
  };

  return result.hits.hits.map((hit) => ({
    ...hit._source,
    id: hit._id,
  }));
}

/**
 * Update a test case in OpenSearch
 */
async function updateTestCase(
  id: string,
  updates: Partial<StorageTestCase>
): Promise<void> {
  await opensearchRequest('POST', `/${TEST_CASES_INDEX}/_update/${id}`, {
    doc: updates,
  });
}

/**
 * Main migration function
 */
async function migrate(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    total: 0,
    migrated: 0,
    skipped: 0,
    cleaned: 0,
    errors: [],
  };

  console.log('========================================');
  console.log('Labels Migration Script');
  console.log('========================================');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Cleanup: ${doCleanup ? 'Yes (legacy fields will be removed)' : 'No'}`);
  console.log(`OpenSearch: ${OPENSEARCH_ENDPOINT}`);
  console.log(`Index: ${TEST_CASES_INDEX}`);
  console.log('----------------------------------------\n');

  // Fetch all test cases
  console.log('Fetching test cases...');
  let testCases: StorageTestCase[];
  try {
    testCases = await fetchAllTestCases();
  } catch (error) {
    console.error('Failed to fetch test cases:', error);
    process.exit(1);
  }

  stats.total = testCases.length;
  console.log(`Found ${testCases.length} test cases\n`);

  if (testCases.length === 0) {
    console.log('No test cases to migrate.');
    return stats;
  }

  console.log('Processing test cases...\n');

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const prefix = `[${i + 1}/${testCases.length}]`;

    try {
      // Check if already has labels
      if (tc.labels && tc.labels.length > 0) {
        if (isVerbose) {
          console.log(`${prefix} "${tc.name}" - Already has labels, skipping`);
        }
        stats.skipped++;
        continue;
      }

      // Build labels from legacy fields
      const labels = buildLabels({
        category: tc.category,
        subcategory: tc.subcategory,
        difficulty: tc.difficulty,
      });

      if (labels.length === 0) {
        if (isVerbose) {
          console.log(`${prefix} "${tc.name}" - No legacy fields to migrate, skipping`);
        }
        stats.skipped++;
        continue;
      }

      // Prepare update
      const updates: Partial<StorageTestCase> = { labels };

      if (doCleanup) {
        // Set legacy fields to null/undefined to remove them
        updates.category = undefined;
        updates.subcategory = undefined;
        updates.difficulty = undefined;
      }

      if (isVerbose || !isDryRun) {
        console.log(`${prefix} "${tc.name}"`);
        console.log(`     Labels: ${JSON.stringify(labels)}`);
        if (doCleanup) {
          console.log(`     Cleanup: Removing category, subcategory, difficulty fields`);
        }
      }

      // Apply update
      if (!isDryRun) {
        await updateTestCase(tc.id, updates);
      }

      stats.migrated++;
      if (doCleanup) {
        stats.cleaned++;
      }
    } catch (error) {
      const errorMsg = `Failed to migrate "${tc.name}": ${error instanceof Error ? error.message : 'Unknown error'}`;
      stats.errors.push(errorMsg);
      console.error(`${prefix} ERROR: ${errorMsg}`);
    }
  }

  return stats;
}

/**
 * Print summary
 */
function printSummary(stats: MigrationStats): void {
  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`Total test cases:  ${stats.total}`);
  console.log(`Migrated:          ${stats.migrated}`);
  console.log(`Skipped:           ${stats.skipped}`);
  if (doCleanup) {
    console.log(`Cleaned:           ${stats.cleaned}`);
  }
  console.log(`Errors:            ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    stats.errors.forEach((err) => console.log(`  - ${err}`));
  }

  if (isDryRun) {
    console.log('\n[DRY RUN] No changes were made. Run without --dry-run to apply changes.');
  } else {
    console.log('\nMigration complete!');
  }
}

// Run migration
migrate()
  .then((stats) => {
    printSummary(stats);
    process.exit(stats.errors.length > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
