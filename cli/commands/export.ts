/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Export Command
 * Exports benchmark test cases as import-compatible JSON
 *
 * Architecture: CLI -> Server HTTP API
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { loadConfig } from '@/lib/config/index.js';
import { ensureServer, createServerCleanup } from '@/cli/utils/serverLifecycle.js';
import { ApiClient } from '@/cli/utils/apiClient.js';
import { generateExportFilename } from '@/lib/benchmarkExport.js';

/**
 * Create the export command
 */
export function createExportCommand(): Command {
  const command = new Command('export')
    .description('Export benchmark test cases as JSON')
    .requiredOption('-b, --benchmark <id-or-name>', 'Benchmark ID or name')
    .option('-o, --output <file>', 'Output file path (default: <benchmark-name>.json)')
    .option('--stdout', 'Write to stdout instead of file')
    .action(async (options: { benchmark: string; output?: string; stdout?: boolean }) => {
      const config = await loadConfig();
      const serverResult = await ensureServer(config.server);
      const cleanup = createServerCleanup(serverResult, config.server.reuseExistingServer === false);

      try {
        const client = new ApiClient(serverResult.baseUrl);

        // Find benchmark by ID or name
        const benchmark = await client.findBenchmark(options.benchmark);
        if (!benchmark) {
          console.error(chalk.red(`\n  Error: Benchmark not found: ${options.benchmark}\n`));
          process.exit(1);
        }

        // Export test cases
        const exportData = await client.exportBenchmark(benchmark.id);

        if (options.stdout) {
          // Write to stdout (no extra formatting)
          process.stdout.write(JSON.stringify(exportData, null, 2) + '\n');
          return;
        }

        // Determine output file
        const outputFile = options.output || generateExportFilename(benchmark.name);

        // Write to file
        writeFileSync(outputFile, JSON.stringify(exportData, null, 2) + '\n', 'utf-8');

        console.log(chalk.green(`\n  Exported ${exportData.length} test case(s) to ${chalk.bold(outputFile)}`));
        console.log(chalk.gray(`  Benchmark: ${benchmark.name} (${benchmark.id})\n`));
      } catch (error: any) {
        console.error(chalk.red(`\n  Error: ${error.message}`));
        console.log(chalk.gray('  Is the server running? Start with: npm run dev:server\n'));
        process.exit(1);
      } finally {
        cleanup();
      }
    });

  return command;
}
