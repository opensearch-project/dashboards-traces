/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Demo Mode Command Handler
 * Runs the application with sample data and mock agent/judge
 */

import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import type { CLIConfig } from '../types.js';
import { startServer } from '../utils/startServer.js';

interface DemoOptions {
  port: number;
  noBrowser: boolean;
}

/**
 * Run demo mode - sample data + mock agent/judge, no external dependencies
 */
export async function runDemoMode(options: DemoOptions): Promise<void> {
  const spinner = ora('Starting demo mode...').start();

  try {
    // Build CLI config for demo mode
    // No storage config = sample data only mode (OpenSearch not required)
    const config: CLIConfig = {
      mode: 'demo',
      port: options.port,
      noBrowser: options.noBrowser,
      // storage not configured = sample data only mode
      agent: {
        type: 'mock',
      },
      judge: {
        type: 'mock',
      },
    };

    spinner.text = 'Loading sample data...';
    // Sample test cases, experiments, runs, and traces are built-in

    spinner.text = 'Configuring mock agent...';
    // Mock agent configured via config

    spinner.text = 'Configuring mock LLM judge...';
    // Mock judge configured via config

    spinner.succeed('Demo mode configured');

    console.log(chalk.gray('\n  Configuration:'));
    console.log(chalk.gray(`    Storage: Sample data only (read-only)`));
    console.log(chalk.gray(`    Agent: Mock (simulated trajectories)`));
    console.log(chalk.gray(`    Judge: Mock (simulated evaluations)`));
    console.log(chalk.gray(`    Data: 5 test cases, 1 experiment, 5 runs with traces\n`));

    // Start the server
    await startServer(config);

    const url = `http://localhost:${options.port}`;
    console.log(chalk.green(`\n  Server running at ${chalk.bold(url)}\n`));

    if (!options.noBrowser) {
      console.log(chalk.gray('  Opening browser...'));
      await open(url);
    }

    console.log(chalk.gray('  Press Ctrl+C to stop\n'));

  } catch (error) {
    spinner.fail('Failed to start demo mode');
    console.error(chalk.red(`\n  Error: ${error instanceof Error ? error.message : error}\n`));
    process.exit(1);
  }
}
