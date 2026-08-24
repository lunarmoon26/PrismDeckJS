---
name: develop-prismdeckjs
description: "Develop and validate PrismDeckJS shared Agent Skills, Claude or Codex manifests, OpenCode server adapter, Antigravity plugin, or DeepSeek Cordis integration. Use before changing agent-facing package exports or runtime entrypoints."
compatibility: Requires Node.js 24, the PrismDeckJS npm workspace, and the sibling Harness Alchemist checkout for structural validation.
---

# Maintain PrismDeckJS Agent Adapters

Use this repository skill for agent-facing changes. Product behavior remains
owned by the PrismDeckJS schema, SDK, and focused documentation.

## Boundaries

- `packages/prismdeck/skills/prismdeckjs/` owns the portable end-user workflow
  and JSON script contract.
- `packages/prismdeck/src/opencode.ts` and `src/deepseek.ts` are thin host
  adapters. Do not put deck authoring or validation logic there.
- `packages/prismdeck/.claude-plugin/`, `.codex-plugin/`, `plugin.json`, and
  `cordis.patch.yml` are package-level host manifests.
- Root `.claude-plugin/` and `.agents/plugins/` are repository marketplaces that
  point at the package workspace.
- `packages/prismdeck/package.json` owns shared metadata and runtime exports.
- The normalized schema, importers, renderer, archive, and Studio remain the
  authoritative product implementation; adapters call them rather than copying
  them.

Read [the compatibility reference](references/compatibility.md) before changing
paths, exports, or harness behavior.

## Workflow

1. Change the portable skill or script contract before host adapters.
2. Keep `main.mjs` and `main.py` behaviorally equivalent; Python may remain a
   shim because HTML export is implemented by the JavaScript SDK.
3. Change shared identity or version metadata in
   `packages/prismdeck/package.json`, then run `npm run sync:agents`.
4. Run the sibling Harness Alchemist validator against the repository root.
5. Run `npm run test:agents` and `npm run check`.
6. Inspect `npm pack --workspace=prismdeckjs --dry-run` before publishing.
7. Treat local host validation as structural evidence; do not claim marketplace
   or remote-service behavior without exercising that host.
