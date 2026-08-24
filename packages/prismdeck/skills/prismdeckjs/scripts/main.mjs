#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

function capabilities() {
  return { ok: true, plugin: 'prismdeckjs', actions: ['export_html'] };
}

async function exportHtml(request) {
  if (typeof request.input !== 'string' || request.input.length === 0) throw new Error('input must be a non-empty path');
  if (typeof request.output !== 'string' || request.output.length === 0) throw new Error('output must be a non-empty path');
  if (!request.output.toLowerCase().endsWith('.html')) throw new Error('output path must end in .html');
  if (request.cwd !== undefined && (typeof request.cwd !== 'string' || request.cwd.length === 0)) {
    throw new Error('cwd must be a non-empty path when provided');
  }

  const baseDirectory = resolve(request.cwd ?? process.cwd());
  const inputPath = resolve(baseDirectory, request.input);
  const outputPath = resolve(baseDirectory, request.output);
  const document = JSON.parse(await readFile(inputPath, 'utf8'));
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const runtime = await import(pathToFileURL(resolve(packageRoot, 'dist/prism-deck.min.js')).href);
  const html = await runtime.savePrismDeckHtml({ document, assets: new Map() });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, new Uint8Array(await html.arrayBuffer()));
  return {
    ok: true,
    plugin: 'prismdeckjs',
    action: 'export_html',
    input: inputPath,
    output: outputPath,
  };
}

try {
  const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    throw new Error('Payload must be a JSON object');
  }
  const result = Object.keys(request).length === 0 || request.action === 'describe'
    ? capabilities()
    : request.action === 'export_html'
      ? await exportHtml(request)
      : (() => { throw new Error('Unsupported action; expected describe or export_html'); })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
