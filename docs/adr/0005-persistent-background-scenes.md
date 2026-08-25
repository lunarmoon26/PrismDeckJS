# ADR 0005: Keep declarative background scenes outside slide ownership

- Status: Accepted
- Date: 2026-08-24

## Context

Slide elements are rebuilt and disposed whenever navigation changes the active
slide. That ownership is correct for editable content, but it resets animated
scenery and makes whole-canvas entry transitions move or fade the background.
Narrative decks need text and data to change while one spatial environment keeps
animating continuously.

The document boundary remains inert. It cannot persist JavaScript, shader source,
Three.js objects, URLs, callbacks, or imported application modules.

## Decision

`DeckDocument.backgroundScene` optionally selects a bounded declarative scene.
The first supported scene is a deterministic `galaxy` with a seed, particle
count, flow rate, two stellar colors, a Sol color, an optional packaged backdrop
asset ID, and an optional nested solar system. Solar texture declarations map a
fixed set of body and ring keys to package asset IDs; they cannot contain URLs or
rendering instructions.
This strict contract is schema version `0.4.0`; package boundaries advance
existing `0.1.0` through `0.3.0` documents without changing their slide content.

The renderer owns one background runtime in a separate render scene beside its
slide group. Slide changes rebuild only slide content. Deck replacement,
background configuration changes, detach, and renderer disposal release the
background geometry and materials. The existing player frame clock advances both
layers once before mono or stereo projection. Each eye renders the background,
clears depth, and then renders authored slide content.

`DeckSlide.backgroundCamera` defines a bounded x/y/z translation, optional
distance, `top`, `tilt`, or ecliptic-`horizon` view, optional fixed solar-body
focus, bounded focus-orbit azimuth/elevation, and optional transition duration
for the persistent layer. The runtime applies the inverse camera transform to the
background group, which produces camera movement without moving the slide group
or Canvas2D overlay. Focus keys are limited to Sol, the eight planets, and Luna.
Reduced motion applies the target framing immediately.
Studio exposes the same single Top View/Tilt View toggle as CyberHUD and persists
the selected view on the active slide.

The background has a dedicated stereo rig. Its convergence distance follows the
active background-camera distance, while its eye-separation ratio interpolates
logarithmically from CyberHUD's 0.024 close-focus calibration to 0.04 at Galactic
distance and observes the same host depth-scale control. The slide rig remains
converged on the authored slide plane. This keeps both layers at comfortable zero
disparity around their intended focal target instead of applying the slide rig's
large scene-unit separation to a planet less than one unit from the camera. The
solar sky sphere is recentered for each eye before its background pass.

When an overlay canvas is available, planar slide entry transitions animate only
that overlay. A slide requiring WebGL content animates the destination slide
group's material opacity and offset rather than moving or fading a persistent
background. Reduced-motion preferences still disable transitions.

The galaxy renderer adapts CyberHUD's weighted thin and thick disks, Galactic and
long bars, named spiral arms, Orion Spur, near and far 3-kpc arms, spectral star
populations, layered haze, structure flow, and Sol placement. It combines that
model with the GPU particle approach in the Three.js galaxy example. PrismDeck
owns a smaller WebGL implementation and does not load external code at document
runtime. The core package does not bundle CyberHUD's NASA/JPL backdrop. Studio's
demo packages an attributed WebP derivative in its deck asset store, displays the
required credit, and preserves the source and policy record beside the asset.
The demo also packages CC BY 4.0 Solar System Scope/NASA-derived overview maps
for Sol, the planets, Luna, Saturn's rings, and the inward-facing solar sky. The
renderer owns their textures, orbit geometry, solar illumination, and disposal.
Planet materials derive their day/night illumination directly from
each body's vector to Sol instead of inheriting slide-scene lights. The ecliptic
uses the J2000 60.188-degree inclination to the Galactic
plane; both overview and focused planets reduce CyberHUD's intentionally
exaggerated display radii, while focus remains larger for legibility. Slides
around Sol focus the actual nested bodies instead of leaving the narrative at a
Galactic marker.

## Consequences

- Galaxy motion remains continuous across slide navigation and playback.
- Each slide can reframe the galaxy while its authored UI remains camera-fixed.
- Slides can transition from Galactic scale into the solar system and individual
  bodies while preserving one background clock.
- Top/tilt/horizon view changes rotate only the persistent scene and use the same
  smoothstep transition family as CyberHUD.
- Mono, full SBS, and half SBS observe one authoritative scene and clock.
- Full and half SBS replicate the background per eye with distance-aware local
  disparity, then composite the UI through the unchanged slide rig.
- Exported HTML and re-imported `.prismdeck` documents preserve the scene because
  it is normalized document data.
- Background scenes add a small, explicit public contract and GPU allocation.
- Persistent-background decks can transition planar and spatial slide content
  without moving or fading the background.

## Conformance

- JSON Schema bounds every galaxy field and rejects executable or unknown data.
- Archive tests round-trip the scene declaration.
- Renderer tests cover deterministic construction, animation, and disposal.
- Browser tests verify that slide navigation animates the overlay without
  animating the WebGL canvas, that the galaxy keeps changing between frames, and
  that focused planets remain near both SBS eye centers.
