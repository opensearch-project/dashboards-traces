/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addCustomAgent,
  removeCustomAgent,
  getCustomAgents,
  clearCustomAgents,
} from '@/server/services/customAgentStore';
import type { AgentConfig } from '@/types';

describe('customAgentStore', () => {
  beforeEach(() => {
    clearCustomAgents();
  });

  const makeAgent = (key: string, name: string, endpoint: string): AgentConfig => ({
    key,
    name,
    endpoint,
    models: [],
    headers: {},
    connectorType: 'agui-streaming',
  });

  describe('addCustomAgent', () => {
    it('stores an agent that can be retrieved', () => {
      const agent = makeAgent('custom-1', 'My Agent', 'http://localhost:3000');
      addCustomAgent(agent);

      const agents = getCustomAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].key).toBe('custom-1');
      expect(agents[0].name).toBe('My Agent');
      expect(agents[0].endpoint).toBe('http://localhost:3000');
    });

    it('sets isCustom to true on stored agents', () => {
      const agent = makeAgent('custom-2', 'Agent', 'http://localhost:4000');
      addCustomAgent(agent);

      const agents = getCustomAgents();
      expect(agents[0].isCustom).toBe(true);
    });

    it('overwrites agent with same key', () => {
      addCustomAgent(makeAgent('custom-1', 'Original', 'http://localhost:3000'));
      addCustomAgent(makeAgent('custom-1', 'Updated', 'http://localhost:4000'));

      const agents = getCustomAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Updated');
      expect(agents[0].endpoint).toBe('http://localhost:4000');
    });
  });

  describe('removeCustomAgent', () => {
    it('removes an existing agent and returns true', () => {
      addCustomAgent(makeAgent('custom-1', 'Agent', 'http://localhost:3000'));

      const result = removeCustomAgent('custom-1');
      expect(result).toBe(true);
      expect(getCustomAgents()).toHaveLength(0);
    });

    it('returns false for non-existent key', () => {
      const result = removeCustomAgent('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getCustomAgents', () => {
    it('returns empty array when store is empty', () => {
      expect(getCustomAgents()).toEqual([]);
    });

    it('returns all stored agents', () => {
      addCustomAgent(makeAgent('a', 'Agent A', 'http://a.example.com'));
      addCustomAgent(makeAgent('b', 'Agent B', 'http://b.example.com'));
      addCustomAgent(makeAgent('c', 'Agent C', 'http://c.example.com'));

      const agents = getCustomAgents();
      expect(agents).toHaveLength(3);
      expect(agents.map(a => a.key).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('clearCustomAgents', () => {
    it('empties the store', () => {
      addCustomAgent(makeAgent('a', 'Agent A', 'http://a.example.com'));
      addCustomAgent(makeAgent('b', 'Agent B', 'http://b.example.com'));

      clearCustomAgents();
      expect(getCustomAgents()).toEqual([]);
    });

    it('is safe to call on empty store', () => {
      clearCustomAgents();
      expect(getCustomAgents()).toEqual([]);
    });
  });
});
