/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configure Mode Command Handler
 * Interactive wizard to configure connection to real infrastructure
 */

import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import type { CLIConfig } from '../types.js';
import { startServer } from '../utils/startServer.js';

interface ConfigureOptions {
  port: number;
  noBrowser: boolean;
}

/**
 * Run configure mode - interactive wizard
 */
export async function runConfigureMode(options: ConfigureOptions): Promise<void> {
  console.log(chalk.cyan('\n  Configure Mode - Connect to your infrastructure\n'));

  try {
    const inquirer = await import('inquirer');

    // Step 1: Storage configuration
    const storageAnswers = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'configureStorage',
        message: 'Configure OpenSearch storage? (No = sample data only)',
        default: true,
      },
    ]);

    let storageConfig: CLIConfig['storage'] | undefined;

    if (storageAnswers.configureStorage) {
      const osAnswers = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'endpoint',
          message: 'OpenSearch endpoint:',
          default: 'http://localhost:9200',
        },
        {
          type: 'input',
          name: 'username',
          message: 'Username (leave empty for none):',
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          when: (answers: { username: string }) => !!answers.username,
        },
      ]);

      storageConfig = {
        endpoint: osAnswers.endpoint,
        username: osAnswers.username || undefined,
        password: osAnswers.password || undefined,
      };
    }

    // Step 2: Agent configuration
    const agentAnswers = await inquirer.default.prompt([
      {
        type: 'list',
        name: 'agentType',
        message: 'Agent type:',
        choices: [
          { name: 'Mock (simulated responses)', value: 'mock' },
          { name: 'ML-Commons Agent', value: 'mlcommons' },
          { name: 'Langgraph Agent', value: 'langgraph' },
        ],
      },
    ]);

    let agentConfig: CLIConfig['agent'] = { type: 'mock' };

    if (agentAnswers.agentType !== 'mock') {
      const agentEndpointAnswers = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'endpoint',
          message: 'Agent endpoint URL:',
          default: agentAnswers.agentType === 'mlcommons'
            ? 'http://localhost:9200/_plugins/_ml/agents/{agent_id}/_execute/stream'
            : 'http://localhost:8080/agent/stream',
        },
      ]);

      agentConfig = {
        type: agentAnswers.agentType,
        endpoint: agentEndpointAnswers.endpoint,
      };
    }

    // Step 3: Judge configuration
    const judgeAnswers = await inquirer.default.prompt([
      {
        type: 'list',
        name: 'judgeType',
        message: 'LLM Judge:',
        choices: [
          { name: 'Mock (simulated evaluations)', value: 'mock' },
          { name: 'AWS Bedrock', value: 'bedrock' },
        ],
      },
    ]);

    let judgeConfig: CLIConfig['judge'] = { type: 'mock' };

    if (judgeAnswers.judgeType === 'bedrock') {
      const bedrockAnswers = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'region',
          message: 'AWS Region:',
          default: 'us-west-2',
        },
        {
          type: 'input',
          name: 'modelId',
          message: 'Bedrock Model ID:',
          default: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        },
      ]);

      judgeConfig = {
        type: 'bedrock',
        region: bedrockAnswers.region,
        modelId: bedrockAnswers.modelId,
      };
    }

    // Step 4: Traces configuration (optional)
    const tracesAnswers = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'enableTraces',
        message: 'Enable trace visualization?',
        default: !!storageConfig,
      },
    ]);

    let tracesConfig: CLIConfig['traces'] | undefined;

    if (tracesAnswers.enableTraces) {
      const tracesEndpointAnswers = await inquirer.default.prompt([
        {
          type: 'input',
          name: 'endpoint',
          message: 'Traces OpenSearch endpoint:',
          default: storageConfig?.endpoint || 'http://localhost:9200',
        },
        {
          type: 'input',
          name: 'index',
          message: 'Traces index pattern:',
          default: 'otel-v1-apm-span-*',
        },
      ]);

      tracesConfig = {
        endpoint: tracesEndpointAnswers.endpoint,
        index: tracesEndpointAnswers.index,
      };
    }

    // Build final config
    const config: CLIConfig = {
      mode: 'configure',
      port: options.port,
      noBrowser: options.noBrowser,
      storage: storageConfig,
      agent: agentConfig,
      judge: judgeConfig,
      traces: tracesConfig,
    };

    // Save configuration option
    const saveAnswers = await inquirer.default.prompt([
      {
        type: 'confirm',
        name: 'save',
        message: 'Save this configuration for future use?',
        default: true,
      },
    ]);

    if (saveAnswers.save) {
      await saveConfig(config);
      console.log(chalk.gray('\n  Configuration saved to ~/.agent-health/config.json'));
    }

    // Display configuration summary
    console.log(chalk.gray('\n  Configuration:'));
    console.log(chalk.gray(`    Storage: ${config.storage ? `OpenSearch (${config.storage.endpoint})` : 'Sample data only'}`));
    console.log(chalk.gray(`    Agent: ${config.agent.type}${config.agent.endpoint ? ` (${config.agent.endpoint})` : ''}`));
    console.log(chalk.gray(`    Judge: ${config.judge.type}${config.judge.region ? ` (${config.judge.region})` : ''}`));
    if (config.traces) {
      console.log(chalk.gray(`    Traces: ${config.traces.endpoint}`));
    }
    console.log('');

    // Start server
    const spinner = ora('Starting server...').start();
    await startServer(config);
    spinner.succeed('Server started');

    const url = `http://localhost:${options.port}`;
    console.log(chalk.green(`\n  Server running at ${chalk.bold(url)}\n`));

    if (!options.noBrowser) {
      console.log(chalk.gray('  Opening browser...'));
      await open(url);
    }

    console.log(chalk.gray('  Press Ctrl+C to stop\n'));

  } catch (error) {
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}

/**
 * Save configuration to ~/.agent-health/config.json
 */
async function saveConfig(config: CLIConfig): Promise<void> {
  const { homedir } = await import('os');
  const { mkdir, writeFile } = await import('fs/promises');
  const { join } = await import('path');

  const configDir = join(homedir(), '.agent-health');
  const configPath = join(configDir, 'config.json');

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}
