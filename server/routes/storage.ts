/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Storage API Route - Re-exports from modular storage directory
 *
 * This file has been refactored from 1,226 lines to use:
 * - OpenSearch JS SDK (@opensearch-project/opensearch)
 * - CRUD Factory pattern for consistent entity handling
 *
 * See server/routes/storage/ for implementation:
 * - factory.ts: Generic CRUD route generator
 * - entities.ts: Entity-specific configurations
 * - admin.ts: Admin endpoints (health, init, stats)
 */

export { default } from './storage/index';
