# PrismDeckJS tool contract

The shared skill owns its runtime. Harness entrypoints delegate to these scripts
and do not contain deck or export logic.

## Entrypoints

| File | Runtime | Behavior |
| --- | --- | --- |
| `scripts/main.mjs` | Node.js 22.20+ | Describes capabilities or invokes the packaged PrismDeckJS HTML exporter. |
| `scripts/main.py` | CPython 3.10+ plus Node.js for export | Handles capability checks and forwards export requests to `main.mjs`. |

## Input

An empty JSON object requests a side-effect-free capability result. HTML export
uses:

```json
{
  "action": "export_html",
  "input": "path/to/deck.json",
  "output": "path/to/deck.html",
  "cwd": "optional/base/directory"
}
```

`input` and `output` are required non-empty strings for export. `output` must end
in `.html`. Relative paths resolve from `cwd` when supplied, otherwise from the
process working directory.

## Output

Capability success returns `{"ok":true,"plugin":"prismdeckjs","actions":["export_html"]}`.
Export success returns the action plus absolute input and output paths. Every
success result is one JSON object followed by a newline.

Failure writes a diagnostic to standard error, writes nothing to standard
output, and exits non-zero.

## Delegation

- Claude Code, Codex, and Antigravity agents may invoke the scripts directly as
  guided by `SKILL.md`.
- The OpenCode `./server` adapter registers `prismdeckjs_export_html` and shapes
  its typed arguments into this payload.
- The DeepSeek/Cordis adapter provides a `prismdeckjs` service whose `run`
  method forwards a JSON payload.
