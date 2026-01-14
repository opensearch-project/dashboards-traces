/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Trash2, Database, CheckCircle2, XCircle, Upload, Download, Loader2, Server, Plus, Edit2, X, Save, ExternalLink } from 'lucide-react';
import { isDebugEnabled, setDebugEnabled } from '@/lib/debug';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { storageAdmin } from '@/services/storage/opensearchClient';
import {
  hasLocalStorageData,
  getLocalStorageCounts,
  migrateToOpenSearch,
  exportLocalStorageData,
  clearLocalStorageData,
  MigrationStats,
} from '@/services/storage';
import { DEFAULT_CONFIG } from '@/lib/constants';

interface StorageStats {
  testCases: number;
  experiments: number;
  runs: number;
  analytics: number;
  isConnected: boolean;
}

interface AgentEndpoint {
  id: string;
  name: string;
  endpoint: string;
}

const STORAGE_KEY = 'agenteval_custom_endpoints';

// Load custom endpoints from localStorage
function loadCustomEndpoints(): AgentEndpoint[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Save custom endpoints to localStorage
function saveCustomEndpoints(endpoints: AgentEndpoint[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(endpoints));
}

export const SettingsPage: React.FC = () => {
  const [debugMode, setDebugMode] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Migration state
  const [hasLocalData, setHasLocalData] = useState(false);
  const [localCounts, setLocalCounts] = useState<{ testCases: number; experiments: number; reports: number } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string>('');
  const [migrationResult, setMigrationResult] = useState<MigrationStats | null>(null);

  // Agent endpoints state
  const [customEndpoints, setCustomEndpoints] = useState<AgentEndpoint[]>([]);
  const [isAddingEndpoint, setIsAddingEndpoint] = useState(false);
  const [editingEndpointId, setEditingEndpointId] = useState<string | null>(null);
  const [newEndpointName, setNewEndpointName] = useState('');
  const [newEndpointUrl, setNewEndpointUrl] = useState('');
  const [endpointUrlError, setEndpointUrlError] = useState<string | null>(null);

  const loadStorageStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const health = await storageAdmin.health();
      const stats = await storageAdmin.stats();

      setStorageStats({
        testCases: stats.stats.evals_test_cases?.count || 0,
        experiments: stats.stats.evals_experiments?.count || 0,
        runs: stats.stats.evals_runs?.count || 0,
        analytics: stats.stats.evals_analytics?.count || 0,
        isConnected: health.status === 'connected' || health.status === 'ok',
      });
    } catch (error) {
      console.error('Failed to load storage stats:', error);
      setStorageStats({
        testCases: 0,
        experiments: 0,
        runs: 0,
        analytics: 0,
        isConnected: false,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setDebugMode(isDebugEnabled());
    loadStorageStats();

    // Check for localStorage data to migrate
    const hasData = hasLocalStorageData();
    setHasLocalData(hasData);
    if (hasData) {
      setLocalCounts(getLocalStorageCounts());
    }

    // Load custom agent endpoints
    setCustomEndpoints(loadCustomEndpoints());
  }, [loadStorageStats]);

  // Validate URL format
  const validateEndpointUrl = (url: string): string | null => {
    if (!url.trim()) return 'URL is required';
    try {
      const parsed = new URL(url.trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'URL must use http or https protocol';
      }
      return null;
    } catch {
      return 'Invalid URL format';
    }
  };

  // Agent endpoints handlers
  const handleAddEndpoint = () => {
    if (!newEndpointName.trim() || !newEndpointUrl.trim()) return;

    const urlError = validateEndpointUrl(newEndpointUrl);
    if (urlError) {
      setEndpointUrlError(urlError);
      return;
    }

    const newEndpoint: AgentEndpoint = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: newEndpointName.trim(),
      endpoint: newEndpointUrl.trim(),
    };

    const updated = [...customEndpoints, newEndpoint];
    setCustomEndpoints(updated);
    saveCustomEndpoints(updated);

    setNewEndpointName('');
    setNewEndpointUrl('');
    setEndpointUrlError(null);
    setIsAddingEndpoint(false);
  };

  const handleUpdateEndpoint = (id: string) => {
    if (!newEndpointName.trim() || !newEndpointUrl.trim()) return;

    const urlError = validateEndpointUrl(newEndpointUrl);
    if (urlError) {
      setEndpointUrlError(urlError);
      return;
    }

    const updated = customEndpoints.map(ep =>
      ep.id === id
        ? { ...ep, name: newEndpointName.trim(), endpoint: newEndpointUrl.trim() }
        : ep
    );

    setCustomEndpoints(updated);
    saveCustomEndpoints(updated);
    setEditingEndpointId(null);
    setNewEndpointName('');
    setNewEndpointUrl('');
    setEndpointUrlError(null);
  };

  const handleDeleteEndpoint = (id: string) => {
    if (!window.confirm('Remove this endpoint?')) return;

    const updated = customEndpoints.filter(ep => ep.id !== id);
    setCustomEndpoints(updated);
    saveCustomEndpoints(updated);
  };

  const startEditEndpoint = (endpoint: AgentEndpoint) => {
    setEditingEndpointId(endpoint.id);
    setNewEndpointName(endpoint.name);
    setNewEndpointUrl(endpoint.endpoint);
  };

  const cancelEdit = () => {
    setEditingEndpointId(null);
    setIsAddingEndpoint(false);
    setNewEndpointName('');
    setNewEndpointUrl('');
    setEndpointUrlError(null);
  };

  const handleDebugToggle = (checked: boolean) => {
    setDebugEnabled(checked);
    setDebugMode(checked);
  };

  const handleMigrate = async () => {
    if (!window.confirm('Migrate localStorage data to OpenSearch? Existing items will be skipped.')) {
      return;
    }

    setIsMigrating(true);
    setMigrationStatus('Starting migration...');
    setMigrationResult(null);

    try {
      const stats = await migrateToOpenSearch({
        skipExisting: true,
        onProgress: (message) => setMigrationStatus(message),
      });

      setMigrationResult(stats);
      setMigrationStatus('Migration complete!');

      // Reload stats
      loadStorageStats();
      setLocalCounts(getLocalStorageCounts());
      setHasLocalData(hasLocalStorageData());
    } catch (error) {
      setMigrationStatus(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleExportLocalData = () => {
    const json = exportLocalStorageData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agenteval-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearLocalData = () => {
    if (!window.confirm('Clear all localStorage data? This cannot be undone. Make sure you have migrated or exported your data first.')) {
      return;
    }

    clearLocalStorageData();
    setHasLocalData(false);
    setLocalCounts(null);
    setMigrationResult(null);
    setMigrationStatus('');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      {/* Debug Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Debug Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="debug-mode" className="text-sm font-medium">
                Verbose Logging
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable detailed console.debug() logs for SSE events, trajectory conversion, and evaluation flow.
                Open browser DevTools to view logs.
              </p>
            </div>
            <Switch
              id="debug-mode"
              checked={debugMode}
              onCheckedChange={handleDebugToggle}
            />
          </div>

          {debugMode && (
            <Alert className="bg-amber-900/20 border-amber-700/30">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                Debug mode enabled. Check browser console for detailed logs.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Agent Endpoints */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server size={18} />
            Agent Endpoints
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Built-in Agents */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Built-in Agents</Label>
            {DEFAULT_CONFIG.agents.map((agent) => (
              <div
                key={agent.key}
                className="p-3 border rounded-lg bg-muted/5 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {agent.name}
                    <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">built-in</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-1">
                    <ExternalLink size={10} />
                    {agent.endpoint || <span className="italic">Not configured</span>}
                  </div>
                  {agent.description && (
                    <div className="text-xs text-muted-foreground mt-1">{agent.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Custom Endpoints Section */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Custom Endpoints</Label>
              {!isAddingEndpoint && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingEndpoint(true)}
                >
                  <Plus size={14} className="mr-1" />
                  Add
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Add custom agent endpoints. These are stored in browser localStorage.
            </p>
          </div>

          {/* Add new endpoint form */}
          {isAddingEndpoint && (
            <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-endpoint-name" className="text-xs">Name</Label>
                <Input
                  id="new-endpoint-name"
                  placeholder="My Agent"
                  value={newEndpointName}
                  onChange={(e) => setNewEndpointName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-endpoint-url" className="text-xs">Endpoint URL</Label>
                <Input
                  id="new-endpoint-url"
                  placeholder="http://localhost:3000/api/agent"
                  value={newEndpointUrl}
                  onChange={(e) => {
                    setNewEndpointUrl(e.target.value);
                    setEndpointUrlError(null);
                  }}
                  className={endpointUrlError ? 'border-red-500' : ''}
                />
                {endpointUrlError && (
                  <p className="text-xs text-red-500">{endpointUrlError}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddEndpoint} disabled={!newEndpointName.trim() || !newEndpointUrl.trim()}>
                  <Save size={14} className="mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  <X size={14} className="mr-1" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* List of custom endpoints */}
          {customEndpoints.length > 0 ? (
            <div className="space-y-2">
              {customEndpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="p-3 border rounded-lg bg-muted/10 flex items-start justify-between gap-3"
                >
                  {editingEndpointId === ep.id ? (
                    <div className="flex-1 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input
                          value={newEndpointName}
                          onChange={(e) => setNewEndpointName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Endpoint URL</Label>
                        <Input
                          value={newEndpointUrl}
                          onChange={(e) => {
                            setNewEndpointUrl(e.target.value);
                            setEndpointUrlError(null);
                          }}
                          className={endpointUrlError ? 'border-red-500' : ''}
                        />
                        {endpointUrlError && (
                          <p className="text-xs text-red-500">{endpointUrlError}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleUpdateEndpoint(ep.id)}>
                          <Save size={14} className="mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X size={14} className="mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{ep.name}</div>
                        <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-1">
                          <ExternalLink size={10} />
                          {ep.endpoint}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditEndpoint(ep)}
                        >
                          <Edit2 size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEndpoint(ep.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !isAddingEndpoint && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No custom endpoints configured.
                <br />
                <span className="text-xs">Click "Add Endpoint" to configure a new agent endpoint.</span>
              </div>
            )
          )}

          <Alert className="bg-blue-900/10 border-blue-700/20">
            <AlertDescription className="text-xs text-blue-300">
              Custom endpoints will appear in the agent selector during evaluations.
              For authentication, use environment variables in the server configuration.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database size={18} />
            OpenSearch Storage
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Evaluation data is stored in OpenSearch. The backend server must be running on port 4001.
          </p>

          {/* Connection Status */}
          {storageStats && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {storageStats.isConnected ? (
                  <>
                    <CheckCircle2 size={16} className="text-opensearch-blue" />
                    <span className="text-sm text-opensearch-blue">Connected to OpenSearch</span>
                  </>
                ) : (
                  <>
                    <XCircle size={16} className="text-red-400" />
                    <span className="text-sm text-red-400">Not connected - start backend with `npm run dev:judge`</span>
                  </>
                )}
              </div>

              {/* Index Stats */}
              {storageStats.isConnected && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-muted-foreground text-xs uppercase mb-1">Test Cases</div>
                    <div className="text-lg font-semibold">{storageStats.testCases}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-muted-foreground text-xs uppercase mb-1">Experiments</div>
                    <div className="text-lg font-semibold">{storageStats.experiments}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-muted-foreground text-xs uppercase mb-1">Runs</div>
                    <div className="text-lg font-semibold">{storageStats.runs}</div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-muted-foreground text-xs uppercase mb-1">Analytics Records</div>
                    <div className="text-lg font-semibold">{storageStats.analytics}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading storage stats...</p>
          )}

          {!storageStats?.isConnected && !isLoading && (
            <Alert className="bg-amber-900/20 border-amber-700/30">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                Cannot connect to OpenSearch backend. Make sure the server is running.
              </AlertDescription>
            </Alert>
          )}

          {/* Refresh Stats */}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadStorageStats()}
              disabled={isLoading}
            >
              Refresh Stats
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm('Clear local debug settings?')) {
                  localStorage.removeItem('debug_enabled');
                  setDebugMode(false);
                }
              }}
            >
              <Trash2 size={14} className="mr-1" />
              Clear Local Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Migration */}
      {hasLocalData && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload size={18} />
              Data Migration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Found existing data in browser localStorage. Migrate it to OpenSearch for persistent storage.
            </p>

            {/* Local Data Stats */}
            {localCounts && (
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-muted-foreground text-xs uppercase mb-1">Test Cases</div>
                  <div className="text-lg font-semibold">{localCounts.testCases}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-muted-foreground text-xs uppercase mb-1">Experiments</div>
                  <div className="text-lg font-semibold">{localCounts.experiments}</div>
                </div>
                <div className="p-3 bg-muted/30 rounded-lg">
                  <div className="text-muted-foreground text-xs uppercase mb-1">Reports</div>
                  <div className="text-lg font-semibold">{localCounts.reports}</div>
                </div>
              </div>
            )}

            {/* Migration Status */}
            {migrationStatus && (
              <Alert className={migrationStatus.includes('failed') ? 'bg-red-900/20 border-red-700/30' : 'bg-blue-900/20 border-blue-700/30'}>
                {isMigrating && <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
                <AlertDescription className={migrationStatus.includes('failed') ? 'text-red-400' : 'text-blue-400'}>
                  {migrationStatus}
                </AlertDescription>
              </Alert>
            )}

            {/* Migration Results */}
            {migrationResult && (
              <div className="p-3 bg-muted/30 rounded-lg text-sm space-y-1">
                <div className="font-medium mb-2">Migration Results:</div>
                <div>Test Cases: {migrationResult.testCases.migrated} migrated, {migrationResult.testCases.skipped} skipped</div>
                <div>Experiments: {migrationResult.experiments.migrated} migrated, {migrationResult.experiments.skipped} skipped</div>
                <div>Reports: {migrationResult.reports.migrated} migrated, {migrationResult.reports.skipped} skipped</div>
                {(migrationResult.testCases.errors.length > 0 ||
                  migrationResult.experiments.errors.length > 0 ||
                  migrationResult.reports.errors.length > 0) && (
                  <div className="text-amber-400 mt-2">
                    {migrationResult.testCases.errors.length + migrationResult.experiments.errors.length + migrationResult.reports.errors.length} errors occurred
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleMigrate}
                disabled={isMigrating || !storageStats?.isConnected}
                className="bg-opensearch-blue hover:bg-blue-600"
              >
                {isMigrating ? (
                  <>
                    <Loader2 size={14} className="mr-1 animate-spin" />
                    Migrating...
                  </>
                ) : (
                  <>
                    <Upload size={14} className="mr-1" />
                    Migrate to OpenSearch
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportLocalData}
                disabled={isMigrating}
              >
                <Download size={14} className="mr-1" />
                Export as JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearLocalData}
                disabled={isMigrating}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 size={14} className="mr-1" />
                Clear localStorage
              </Button>
            </div>

            {!storageStats?.isConnected && (
              <p className="text-xs text-amber-400">
                Connect to OpenSearch backend first before migrating.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
