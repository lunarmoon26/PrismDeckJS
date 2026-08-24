import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tool, type Plugin, type PluginModule } from '@opencode-ai/plugin';

const scriptsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'skills/prismdeckjs/scripts',
);

export function runSkillScript(script: string, payload: string, cwd?: string): Promise<string> {
  return new Promise((resolveResult, rejectResult) => {
    const runtime = script.endsWith('.py') ? 'python3' : process.execPath;
    const child = spawn(runtime, [join(scriptsDirectory, script)], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      rejectResult(new Error(`Could not run ${script} via ${runtime}: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        rejectResult(new Error(stderr.trim() || `${script} exited with code ${code}`));
      } else {
        resolveResult(stdout);
      }
    });
    child.stdin.end(payload);
  });
}

const server = (async () => ({
  tool: {
    prismdeckjs_export_html: tool({
      description: 'Validate a PrismDeckJS DeckDocument JSON file and export an editable standalone HTML viewer.',
      args: {
        input: tool.schema.string().describe('DeckDocument JSON path, absolute or relative to the project directory'),
        output: tool.schema.string().describe('Destination .html path, absolute or relative to the project directory'),
        runtime: tool.schema
          .enum(['node', 'python'])
          .optional()
          .describe('Skill bridge runtime; defaults to node'),
      },
      execute: async (args, context) => {
        const script = args.runtime === 'python' ? 'main.py' : 'main.mjs';
        const output = await runSkillScript(script, JSON.stringify({
          action: 'export_html',
          cwd: context.directory,
          input: args.input,
          output: args.output,
        }), context.directory);
        return JSON.stringify(JSON.parse(output));
      },
    }),
  },
})) satisfies Plugin;

const plugin = { id: 'prismdeckjs', server } satisfies PluginModule;

export default plugin;
