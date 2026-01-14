/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Experiment, ExperimentRun } from '@/types';

// Storage key - only experiments now (runs embedded within)
const EXPERIMENTS_KEY = 'experiments';

// Types for storage
interface ExperimentsStorage {
  [experimentId: string]: Experiment;
}

class ExperimentStorage {
  // ==================== Experiment CRUD Operations ====================

  /**
   * Get all experiments
   */
  getAll(): Experiment[] {
    const experiments = this.getExperimentsRaw();
    return Object.values(experiments).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Get a single experiment by ID
   */
  getById(id: string): Experiment | null {
    const experiments = this.getExperimentsRaw();
    return experiments[id] || null;
  }

  /**
   * Save an experiment (create or update)
   */
  save(experiment: Experiment): void {
    try {
      const experiments = this.getExperimentsRaw();

      // Update timestamp
      experiment.updatedAt = new Date().toISOString();

      // If new, set createdAt and initialize runs array
      if (!experiments[experiment.id]) {
        experiment.createdAt = experiment.createdAt || new Date().toISOString();
        if (!experiment.runs) {
          experiment.runs = [];
        }
      }

      experiments[experiment.id] = experiment;
      localStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(experiments));
    } catch (error) {
      console.error('Error saving experiment:', error);
      throw new Error(`Failed to save experiment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete an experiment
   */
  delete(id: string): boolean {
    try {
      const experiments = this.getExperimentsRaw();

      if (!experiments[id]) {
        return false;
      }

      delete experiments[id];
      localStorage.setItem(EXPERIMENTS_KEY, JSON.stringify(experiments));

      return true;
    } catch (error) {
      console.error('Error deleting experiment:', error);
      return false;
    }
  }

  /**
   * Get total count of experiments
   */
  getCount(): number {
    const experiments = this.getExperimentsRaw();
    return Object.keys(experiments).length;
  }

  // ==================== Run Operations (embedded in experiment) ====================

  /**
   * Get all runs for an experiment
   */
  getRuns(experimentId: string): ExperimentRun[] {
    const experiment = this.getById(experimentId);
    if (!experiment) return [];

    return [...(experiment.runs || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Get a specific run by ID from an experiment
   */
  getRunById(experimentId: string, runId: string): ExperimentRun | null {
    const experiment = this.getById(experimentId);
    if (!experiment) return null;

    return experiment.runs?.find(r => r.id === runId) || null;
  }

  /**
   * Add or update a run in an experiment
   */
  saveRun(experimentId: string, run: ExperimentRun): void {
    const experiment = this.getById(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    // Ensure runs array exists
    if (!experiment.runs) {
      experiment.runs = [];
    }

    // Check if run already exists (update case)
    const existingIndex = experiment.runs.findIndex(r => r.id === run.id);

    if (existingIndex >= 0) {
      // Update existing run
      experiment.runs[existingIndex] = run;
    } else {
      // Add new run
      experiment.runs.push(run);
    }

    this.save(experiment);
  }

  /**
   * Delete a run from an experiment
   */
  deleteRun(experimentId: string, runId: string): boolean {
    const experiment = this.getById(experimentId);
    if (!experiment || !experiment.runs) return false;

    const index = experiment.runs.findIndex(r => r.id === runId);
    if (index < 0) return false;

    experiment.runs.splice(index, 1);
    this.save(experiment);
    return true;
  }

  // ==================== Utility Functions ====================

  /**
   * Generate a unique experiment ID
   */
  generateExperimentId(): string {
    return `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a unique run ID
   */
  generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // ==================== Private Helpers ====================

  private getExperimentsRaw(): ExperimentsStorage {
    const data = localStorage.getItem(EXPERIMENTS_KEY);
    if (!data) {
      return {};
    }

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Error parsing experiments:', error);
      return {};
    }
  }

  /**
   * Clear all experiments
   */
  clearAll(): void {
    try {
      localStorage.removeItem(EXPERIMENTS_KEY);
      console.log('All experiments cleared');
    } catch (error) {
      console.error('Error clearing experiments:', error);
    }
  }
}

// Export singleton instance
export const experimentStorage = new ExperimentStorage();
