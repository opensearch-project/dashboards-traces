/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';

// Mock express Router
const mockUse = jest.fn();
const mockRouter = {
  use: mockUse,
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter),
}));

// Mock all route modules
jest.mock('../health', () => ({ default: 'healthRoutes' }));
jest.mock('../judge', () => ({ default: 'judgeRoutes' }));
jest.mock('../agent', () => ({ default: 'agentRoutes' }));
jest.mock('../traces', () => ({ default: 'tracesRoutes' }));
jest.mock('../metrics', () => ({ default: 'metricsRoutes' }));
jest.mock('../logs', () => ({ default: 'logsRoutes' }));
jest.mock('../storage', () => ({ default: 'storageRoutes' }));

describe('Routes Aggregator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a router and mount all route modules', () => {
    // Import the routes module which triggers route mounting
    const routes = require('../index').default;

    // Verify Router was created
    expect(Router).toHaveBeenCalled();

    // Verify all routes were mounted
    expect(mockUse).toHaveBeenCalledWith('healthRoutes');
    expect(mockUse).toHaveBeenCalledWith('judgeRoutes');
    expect(mockUse).toHaveBeenCalledWith('agentRoutes');
    expect(mockUse).toHaveBeenCalledWith('tracesRoutes');
    expect(mockUse).toHaveBeenCalledWith('metricsRoutes');
    expect(mockUse).toHaveBeenCalledWith('logsRoutes');
    expect(mockUse).toHaveBeenCalledWith('storageRoutes');
  });

  it('should mount routes in the correct order', () => {
    jest.resetModules();
    mockUse.mockClear();

    require('../index');

    const calls = mockUse.mock.calls.map((call) => call[0]);

    expect(calls).toEqual([
      'healthRoutes',
      'judgeRoutes',
      'agentRoutes',
      'tracesRoutes',
      'metricsRoutes',
      'logsRoutes',
      'storageRoutes',
    ]);
  });

  it('should export the router as default', () => {
    jest.resetModules();

    const routes = require('../index').default;

    expect(routes).toBe(mockRouter);
  });
});
