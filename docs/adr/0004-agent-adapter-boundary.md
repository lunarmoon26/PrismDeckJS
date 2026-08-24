# ADR 0004: Keep agent harnesses behind package subpaths

Status: accepted

## Decision

PrismDeckJS ships one shared Agent Skill inside the existing `prismdeckjs` npm
package. Claude Code, Codex/ChatGPT, and Antigravity consume that skill through
harness manifests. OpenCode discovers a server plugin from the package's
`./server` export, and DeepSeek Harness loads the named-export Cordis plugin from
`./deepseek` through `cordis.patch.yml`.

The package root remains the public PrismDeckJS SDK. Harness adapters translate
host arguments into the skill-owned JSON script contract and contain no deck
generation, validation, archive, rendering, or import logic. The script bridge
calls the packaged browser runtime used by the existing HTML export command.

Root marketplace manifests point at `packages/prismdeck`, which is the plugin
root inside this monorepo. Package metadata owns shared identity and version
values; the release workflow synchronizes those values into harness manifests.

## Rationale

Harness Alchemist's canonical single-package scaffold assumes that the package
root is an OpenCode plugin. PrismDeckJS already has a shipped SDK root export, so
replacing it would break library consumers. Current OpenCode packages can expose
a dedicated `./server` entrypoint, allowing one npm package to support both
surfaces without a second package or duplicated SDK.

Keeping the workflow in one portable skill gives instruction-based harnesses and
runtime-plugin harnesses the same behavior. Delegation also keeps agent changes
outside the normalized document and security boundaries.

## Consequences

The repository adapts, rather than copies, the canonical Harness Alchemist
layout. Local Claude, Codex, and Antigravity installation targets
`packages/prismdeck`; OpenCode and DeepSeek install the published `prismdeckjs`
package. OpenCode users install the shared skill separately because npm plugins
do not register Agent Skills.

The Python entrypoint is a standard-library compatibility shim over the Node
entrypoint because the authoritative PrismDeck runtime is JavaScript. Both
entrypoints preserve the same JSON and exit-code contract, and Node remains a
runtime requirement for HTML export.
