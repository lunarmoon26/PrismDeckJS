# Coding-agent adapters

PrismDeckJS packages one shared deck-authoring skill for Claude Code,
Codex/ChatGPT, OpenCode, Google Antigravity, and DeepSeek Harness/Cordis. The
skill writes ordinary `DeckDocument` JSON and delegates HTML creation to the
same validated exporter used by the SDK and `npm run export:html`.

## Shared contract

The portable workflow lives at
`packages/prismdeck/skills/prismdeckjs/SKILL.md`. Its entrypoints accept one JSON
object on standard input:

```json
{
  "action": "export_html",
  "input": "generated/story.json",
  "output": "generated/story.html"
}
```

An empty object returns a capability description for installation smoke tests.
On export success, the scripts write one JSON object followed by a newline.
Relative paths resolve from `cwd` in the payload when provided, otherwise from
the process working directory. Invalid JSON, invalid paths, schema failures, and
write failures produce a diagnostic on standard error, no standard-output
result, and a non-zero exit code. The Python entrypoint delegates export to the
Node entrypoint so the SDK remains the only implementation of validation and
HTML generation.

## Claude Code

```bash
claude plugin marketplace add lunarmoon26/PrismDeckJS
claude plugin install prismdeckjs@prismdeckjs-plugins
```

For local development, validate and load the package plugin root:

```bash
claude plugin validate packages/prismdeck --strict
claude --plugin-dir packages/prismdeck
```

## Codex and ChatGPT

```bash
codex plugin marketplace add lunarmoon26/PrismDeckJS
codex plugin add prismdeckjs@prismdeckjs-plugins
codex plugin list
```

## OpenCode

The published package exposes `./server`, so the normal package name is the
plugin specification:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["prismdeckjs"]
}
```

For a checkout, use the package directory after `npm run build:core`:

```json
{
  "plugin": ["file:///absolute/path/to/PrismDeckJS/packages/prismdeck"]
}
```

OpenCode discovers skills separately from npm plugins. Copy
`packages/prismdeck/skills/prismdeckjs` into `~/.agents/skills/` when the shared
workflow is not already installed. Restart OpenCode after changing plugin or
skill configuration.

## Google Antigravity

```bash
agy plugin validate packages/prismdeck
agy plugin install packages/prismdeck
```

## DeepSeek Harness

```bash
dsh plugin --profile demo add prismdeckjs
dsh --profile demo --dump-config
```

For a checkout, add the absolute `packages/prismdeck` directory. The composed
configuration lists an insert named `prismdeckjs` loading
`prismdeckjs/deepseek`.

## Verification

```bash
npm run sync:agents
node ../harness-alchemist/bin/harness-alchemist.mjs validate .
npm run test:agents
npm run check
npm pack --workspace=prismdeckjs --dry-run
```

Structural validation proves manifests and delegation contracts, not remote
marketplace availability or third-party host lifecycle behavior.
