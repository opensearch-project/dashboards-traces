/**
 * Backend Server Entry Point
 * Handles AWS Bedrock API calls and serves as the main API server
 */

import 'dotenv/config';
import express from 'express';
import config from './config';
import routes from './routes';
import { setupMiddleware } from './middleware';
import { isStorageConfigured } from './services/opensearchClient';

const app = express();
const PORT = config.PORT;

// ============================================================================
// MIDDLEWARE - CORS, JSON parsing, static serving
// ============================================================================

setupMiddleware(app);

// ============================================================================
// ROUTES - All API endpoints are now modularized in server/routes/
// ============================================================================

app.use(routes);

// ============================================================================
// START SERVER
// ============================================================================

// Start server - bind to 0.0.0.0 to allow external access
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Backend Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   AWS Region: ${process.env.AWS_REGION || 'us-west-2'}`);
  console.log(`   Bedrock Model: ${process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'}`);
  if (isStorageConfigured()) {
    console.log(`   OpenSearch Storage: ${process.env.OPENSEARCH_STORAGE_ENDPOINT}`);
  } else {
    console.log(`   OpenSearch Storage: NOT CONFIGURED`);
  }
  console.log('');
});
