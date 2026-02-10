/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Middleware Setup - CORS, JSON parsing, and static file serving
 */

import { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { storageClientMiddleware } from './storageClient.js';

// Get directory of this file for resolving paths relative to package location
// Server always runs from server/dist/, so path resolution is straightforward
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Setup CORS middleware
 * - Same-origin only in both dev and production
 * - Dev mode uses Vite proxy (vite.config.ts) to forward /api requests
 */
function setupCors(app: Express): void {
  app.use(cors({
    origin: false,  // Same-origin only - dev uses Vite proxy, prod serves from same server
    credentials: true
  }));
}

/**
 * Setup JSON body parser
 */
function setupJsonParser(app: Express): void {
  app.use(express.json({ limit: '10mb' }));
}

/**
 * Setup static file serving for production mode
 * Serves built frontend assets (JS, CSS, images) from dist/ folder.
 * SPA fallback is registered separately via setupSpaFallback() after routes.
 */
function setupStaticServing(app: Express): void {
  // From server/dist/, go up 2 levels to package root, then into dist/
  const distPath = path.join(__dirname, '..', '..', 'dist');
  const indexPath = path.join(distPath, 'index.html');
  const indexExists = fs.existsSync(indexPath);

  console.log('[StaticServer] __dirname:', __dirname);
  console.log('[StaticServer] Computed distPath:', distPath);
  console.log('[StaticServer] index.html exists:', indexExists);

  if (indexExists) {
    console.log('[StaticServer] Serving frontend from dist/ folder');
    // index: false prevents express.static from serving index.html for directory
    // requests (like / or /benchmarks/...). This lets the SPA fallback middleware
    // (registered after API routes) handle all HTML navigation instead.
    // Without this, direct navigation to deep links returns 404.
    app.use(express.static(distPath, { index: false }));
  } else {
    console.log('[StaticServer] dist/index.html not found - API-only mode');
  }
}

/**
 * SPA fallback - serve index.html for all non-API routes.
 * Must be registered AFTER API routes so it only catches client-side routes.
 */
export function setupSpaFallback(app: Express): void {
  const distPath = path.join(__dirname, '..', '..', 'dist');
  const indexPath = path.join(distPath, 'index.html');

  if (!fs.existsSync(indexPath)) return;

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip API routes and health checks
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    // Only serve index.html for GET/HEAD requests (not OPTIONS, POST, etc.)
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    res.sendFile(indexPath, (err) => {
      if (err) next();
    });
  });
}

/**
 * Setup storage client middleware
 * Attaches req.storageClient and req.storageConfig to each request
 */
function setupStorageClient(app: Express): void {
  app.use(storageClientMiddleware);
}

/**
 * Setup all middleware for the Express app
 */
export function setupMiddleware(app: Express): void {
  setupCors(app);
  setupJsonParser(app);
  setupStorageClient(app);  // Add storage client before routes
  setupStaticServing(app);
}
