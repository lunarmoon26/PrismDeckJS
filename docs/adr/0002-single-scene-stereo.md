# ADR 0002: Render stereo from one authoritative scene

Status: accepted

## Decision

Mono, full SBS, and half SBS render from one Three.js scene and one simulation.
SBS uses off-axis left and right cameras with configurable eye order, separation,
focus distance, and comfort limits.

## Rationale

Duplicating scenes or browser documents risks state drift, double physics steps,
and inconsistent resource ownership. One scene guarantees both eyes observe the
same presentation state.

## Consequences

Half SBS intentionally compresses two logical 16:9 eye images into one 16:9
frame. Device-specific display expansion is outside the renderer. WebXR remains
a separate future output mode.
