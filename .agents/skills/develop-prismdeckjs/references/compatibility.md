# PrismDeckJS agent compatibility

## Monorepo adaptation

`harness-alchemist.json` declares `packages/prismdeck` as the plugin root and
uses OpenCode's dedicated `./server` package export. PrismDeckJS therefore keeps
its existing SDK at `.` while satisfying the remaining Harness Alchemist skill,
manifest, Cordis, and npm-payload contracts.

## Harness surfaces

| Harness | Files | Contract |
| --- | --- | --- |
| Claude Code | root `.claude-plugin/marketplace.json`, package `.claude-plugin/plugin.json` | Marketplace source is `./packages/prismdeck`; skills are package-relative. |
| Codex/ChatGPT | root `.agents/plugins/marketplace.json`, package `.codex-plugin/plugin.json` | Local marketplace source is `./packages/prismdeck`. |
| OpenCode | package export `./server`, `src/opencode.ts` | Default export is an OpenCode server module; tool execution delegates to the skill script. |
| Antigravity | package `plugin.json` | Install or validate `packages/prismdeck`; skill discovery starts there. |
| DeepSeek Harness | package `cordis.patch.yml`, export `./deepseek` | Cordis uses named exports with no default export. |

## Shared skill runtime

- `skills/prismdeckjs/scripts/main.mjs` owns JSON parsing, path resolution, and
  delegation to the packaged PrismDeck browser runtime.
- `main.py` handles capability smoke requests itself and otherwise delegates to
  `main.mjs`; it does not reimplement PrismDeck validation or export.
- Both entrypoints read one JSON object from standard input and produce one JSON
  result plus a newline, or a standard-error diagnostic and non-zero exit.
- Host adapters may shape typed host arguments into that JSON payload but do not
  read decks, validate documents, or write HTML themselves.

## Metadata

`packages/prismdeck/package.json` owns package name, version, description,
author, repository, and license. `npm run sync:agents` propagates those fields
without replacing host-specific paths, policies, or schemas.
