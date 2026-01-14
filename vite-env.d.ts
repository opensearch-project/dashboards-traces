/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />

declare module "*.svg" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly AGENT_ENDPOINT: string;
  readonly AWS_REGION: string;
  readonly AWS_PROFILE: string;
  readonly BEDROCK_MODEL_ID: string;
  readonly OPENSEARCH_ENDPOINT: string;
  readonly OPENSEARCH_USERNAME: string;
  readonly OPENSEARCH_PASSWORD: string;
  readonly OPENSEARCH_INDEX_PREFIX: string;
  readonly OPENSEARCH_TIME_RANGE_MINUTES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
