import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import opencodePlugin from '../packages/prismdeck/dist/opencode.js';
import * as deepseekPlugin from '../packages/prismdeck/dist/deepseek.js';

const repositoryRoot = resolve(import.meta.dirname, '..');
const source = join(repositoryRoot, 'examples/deepseek-harness/deck.json');
const pythonAvailable = spawnSync('python3', ['--version'], { encoding: 'utf8' }).status === 0;

async function temporaryOutput() {
  const directory = await mkdtemp(join(tmpdir(), 'prismdeck-agent-'));
  return {
    output: join(directory, 'deck.html'),
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
}

test('OpenCode server tool delegates HTML export to the shared skill', async () => {
  const temporary = await temporaryOutput();
  try {
    assert.equal(opencodePlugin.id, 'prismdeckjs');
    const hooks = await opencodePlugin.server({});
    const entry = hooks.tool?.prismdeckjs_export_html;
    assert.equal(typeof entry?.execute, 'function');
    const result = JSON.parse(await entry.execute(
      { input: source, output: temporary.output },
      { directory: repositoryRoot },
    ));
    assert.equal(result.ok, true);
    assert.equal(result.output, temporary.output);
    assert.match(await readFile(temporary.output, 'utf8'), /<script id="prismdeck-data"/);
  } finally {
    await temporary.dispose();
  }
});

test('DeepSeek adapter exposes a named Cordis plugin and delegates export', async () => {
  const temporary = await temporaryOutput();
  try {
    assert.equal(deepseekPlugin.name, 'prismdeckjs');
    assert.equal('default' in deepseekPlugin, false);
    let service;
    deepseekPlugin.apply({
      provide(name, value) {
        assert.equal(name, 'prismdeckjs');
        service = value;
      },
    });
    assert.equal(typeof service?.run, 'function');
    const result = service.run(JSON.stringify({
      action: 'export_html',
      input: source,
      output: temporary.output,
    }));
    assert.equal(result.ok, true);
    assert.match(await readFile(temporary.output, 'utf8'), /<script id="prismdeck-data"/);
  } finally {
    await temporary.dispose();
  }
});

test('Python bridge preserves the shared export contract', { skip: !pythonAvailable }, async () => {
  const temporary = await temporaryOutput();
  try {
    const result = deepseekPlugin.runSkillScript('main.py', JSON.stringify({
      action: 'export_html',
      input: source,
      output: temporary.output,
    }), repositoryRoot);
    assert.equal(result.ok, true);
    assert.match(await readFile(temporary.output, 'utf8'), /<script id="prismdeck-data"/);
  } finally {
    await temporary.dispose();
  }
});
