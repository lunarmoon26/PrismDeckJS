import {
  DeckPlayer,
  OUTPUT_PRESETS,
  importPresentation,
  savePrismDeck,
  savePrismDeckHtml,
  type DeckElement,
  type ElementPhysics,
  type ElementTransform,
  type ImportReport,
  type LoadedDeck,
  type OutputMode,
  type SessionChangeDetail,
} from 'prismdeckjs';
import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react';
import { createDemoDeck } from './demo';

const OUTPUT_LABELS: Record<OutputMode, string> = {
  mono: 'Mono',
  'full-sbs': 'Full SBS',
  'half-sbs': 'Half SBS',
};

function safeName(value: string): string {
  return value.trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'prismdeck';
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas capture failed'))), 'image/png');
  });
}

function snapshotSession(session: DeckPlayer['session']): LoadedDeck {
  return {
    document: structuredClone(session.document),
    assets: new Map(
      Array.from(session.assets, ([id, asset]) => [id, { ...asset, data: Uint8Array.from(asset.data) }]),
    ),
  };
}

function elementLabel(element: DeckElement): string {
  const placeholder = element.placeholder?.type;
  return placeholder ? `${element.name} · ${placeholder}` : element.name;
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const commit = (next: number) => {
    if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div className="number-field__control">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => commit(Number(event.target.value))}
        />
        <input
          aria-label={`${label} value`}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(3))}
          onChange={(event) => {
            const next = Number(event.target.value);
            commit(next);
          }}
        />
      </div>
    </label>
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DeckPlayer | undefined>(undefined);
  const importSequence = useRef(0);
  const dirtyRef = useRef(false);
  const editSequence = useRef(0);
  const [player, setPlayer] = useState<DeckPlayer>();
  const [revision, redraw] = useReducer((value: number) => value + 1, 0);
  const [selectedElementId, setSelectedElementId] = useState<string>();
  const [outputMode, setOutputModeState] = useState<OutputMode>('mono');
  const [report, setReport] = useState<ImportReport>();
  const [busyMessage, setBusyMessage] = useState('Starting renderer…');
  const [error, setError] = useState<string>();
  const [layoutChoice, setLayoutChoice] = useState('');
  const [dirty, setDirty] = useState(false);

  function updateDirty(value: boolean): void {
    dirtyRef.current = value;
    setDirty(value);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let instance: DeckPlayer | undefined;
    let observer: ResizeObserver | undefined;
    const onSessionChange = (event: Event) => {
      redraw();
      if ((event as CustomEvent<SessionChangeDetail>).detail.reason === 'content') {
        editSequence.current += 1;
        updateDirty(true);
      }
    };

    void DeckPlayer.create(canvas, createDemoDeck(), {
      physics: true,
      renderer: { outputMode: 'mono', antialias: true, clearColor: '#151311' },
    })
      .then((created) => {
        if (!active) {
          created.dispose();
          return;
        }
        instance = created;
        playerRef.current = created;
        created.session.addEventListener('change', onSessionChange);
        observer = new ResizeObserver(([entry]) => {
          if (!entry) return;
          created.renderer.resize(entry.contentRect.width, entry.contentRect.height, false);
        });
        observer.observe(canvas);
        created.start();
        setPlayer(created);
        setBusyMessage('');
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBusyMessage('');
        setError(cause instanceof Error ? cause.message : 'Unable to start the renderer');
      });

    return () => {
      active = false;
      observer?.disconnect();
      instance?.session.removeEventListener('change', onSessionChange);
      instance?.dispose();
      playerRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventAccidentalClose);
    return () => window.removeEventListener('beforeunload', preventAccidentalClose);
  }, []);

  useEffect(() => {
    if (!player) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') player.session.next();
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') player.session.previous();
      else if (event.key === ' ') {
        event.preventDefault();
        if (player.session.isPlaying) player.session.pause();
        else player.session.play();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [player]);

  const session = player?.session;
  const deckDocument = session?.document;
  const currentSlide = session?.currentSlide;
  const selectedElement = useMemo(
    () => (selectedElementId ? session?.findElement(selectedElementId) : undefined),
    [session, selectedElementId, revision],
  );
  const selectedLayoutId =
    (deckDocument?.layouts.some((layout) => layout.id === layoutChoice) ? layoutChoice : undefined) ??
    deckDocument?.layouts[0]?.id ??
    '';

  async function importFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !player) return;
    if (dirtyRef.current && !window.confirm('Discard unsaved changes and import another deck?')) return;
    const sequence = ++importSequence.current;
    setError(undefined);
    setBusyMessage(`Importing ${file.name}…`);
    try {
      const result = await importPresentation(await file.arrayBuffer(), { sourceName: file.name });
      if (sequence !== importSequence.current) return;
      player.load(result);
      setReport(result.report);
      setSelectedElementId(undefined);
      setLayoutChoice(result.document.layouts[0]?.id ?? '');
      updateDirty(false);
    } catch (cause) {
      if (sequence !== importSequence.current) return;
      setError(cause instanceof Error ? cause.message : `Could not import ${file.name}`);
    } finally {
      if (sequence === importSequence.current) setBusyMessage('');
    }
  }

  function setOutputMode(mode: OutputMode): void {
    setOutputModeState(mode);
    player?.renderer.setOutputMode(mode);
  }

  function selectSlide(index: number): void {
    session?.goTo(index);
    setSelectedElementId(undefined);
  }

  function createSlide(): void {
    if (!session || !selectedLayoutId) return;
    const slide = session.createSlide(selectedLayoutId);
    session.goTo(session.document.slides.indexOf(slide));
    setSelectedElementId(slide.elements.find((element) => element.placeholder)?.id ?? slide.elements[0]?.id);
  }

  function updateTransform(key: keyof ElementTransform, value: number): void {
    if (!session || !selectedElement) return;
    session.updateElementTransform(selectedElement.id, { [key]: value });
  }

  function mutateSelected(mutation: (element: DeckElement) => void): void {
    if (!session || !selectedElement) return;
    mutation(selectedElement);
    session.notifyContentChanged(selectedElement.id);
  }

  function updatePhysics(patch: Partial<ElementPhysics>): void {
    if (!session || !selectedElement) return;
    const current = selectedElement.physics ?? {
      body: 'fixed',
      shape: 'cuboid',
      density: 1,
      restitution: 0.2,
      friction: 0.5,
    };
    const next = { ...current, ...patch };
    next.density = Math.max(0, Number.isFinite(next.density) ? next.density : 0);
    next.restitution = Math.min(1, Math.max(0, Number.isFinite(next.restitution) ? next.restitution : 0));
    next.friction = Math.min(2, Math.max(0, Number.isFinite(next.friction) ? next.friction : 0));
    session.updateElementPhysics(selectedElement.id, next);
  }

  async function saveDeck(): Promise<void> {
    if (!session) return;
    const savedEditSequence = editSequence.current;
    setError(undefined);
    try {
      const blob = await savePrismDeck(snapshotSession(session));
      downloadBlob(blob, `${safeName(session.document.metadata.title)}.prismdeck`);
      if (savedEditSequence === editSequence.current) updateDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this deck');
    }
  }

  async function exportHtml(): Promise<void> {
    if (!session) return;
    const savedEditSequence = editSequence.current;
    setError(undefined);
    try {
      const blob = await savePrismDeckHtml(snapshotSession(session));
      downloadBlob(blob, `${safeName(session.document.metadata.title)}.html`);
      if (savedEditSequence === editSequence.current) updateDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export this deck');
    }
  }

  async function captureFrame(): Promise<void> {
    if (!player || !canvasRef.current || !session) return;
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    setBusyMessage(`Rendering ${OUTPUT_PRESETS[outputMode].width} × ${OUTPUT_PRESETS[outputMode].height}…`);
    player.stop();
    try {
      player.renderer.resizeToPreset(outputMode);
      await player.renderer.whenReady();
      player.renderer.render();
      downloadBlob(await canvasBlob(canvas), `${safeName(currentSlide?.name ?? 'slide')}-${outputMode}.png`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not capture this frame');
    } finally {
      if (playerRef.current === player) {
        player.renderer.resize(bounds.width, bounds.height, false);
        player.start();
      }
      setBusyMessage('');
    }
  }

  return (
    <div className="studio-shell">
      <header className="topbar">
        <div className="brand" aria-label="PrismDeck Studio">
          <span className="brand__mark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>PRISM</b>DECK</span>
          <small>STUDIO</small>
        </div>
        <div className="document-title">
          <span className="eyebrow">LOCAL DOCUMENT</span>
          <strong>{deckDocument?.metadata.title ?? 'No deck loaded'}{dirty && <em className="dirty-state">UNSAVED</em>}</strong>
        </div>
        <div className="topbar__actions">
          <span className="local-badge"><span /> Files stay here</span>
          <label className="button button--primary file-button">
            <input type="file" accept=".pptx,.odp,.prismdeck,.html,.htm" onChange={(event) => void importFile(event)} />
            Import deck
          </label>
          <button
            className="button save-button"
            type="button"
            disabled={!player}
            aria-label={dirty ? 'Save package, unsaved changes' : 'Save package'}
            onClick={() => void saveDeck()}
          >
            Save package{dirty && <i className="save-dirty-dot" aria-hidden="true" />}
          </button>
          <button className="button" type="button" disabled={!player} onClick={() => void exportHtml()}>
            Export HTML
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="slide-rail panel">
          <div className="panel-heading">
            <div><span className="eyebrow">SEQUENCE</span><h2>Slides</h2></div>
            <span className="counter">{deckDocument?.slides.length ?? 0}</span>
          </div>
          <div className="slide-list">
            {deckDocument?.slides.map((slide, index) => (
              <button
                type="button"
                className={`slide-card ${session?.currentSlideIndex === index ? 'is-active' : ''}`}
                key={slide.id}
                onClick={() => selectSlide(index)}
              >
                <span className="slide-card__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="slide-card__preview" style={{ background: slide.background }}>
                  <span>{slide.name.slice(0, 2).toUpperCase()}</span>
                  <i style={{ width: `${Math.min(78, Math.max(26, slide.elements.length * 11))}%` }} />
                </span>
                <span className="slide-card__name">{slide.name}</span>
              </button>
            ))}
            {deckDocument?.slides.length === 0 && (
              <div className="empty-state"><b>Template ready</b><span>Choose a layout below to create the first slide.</span></div>
            )}
          </div>
          <div className="layout-create">
            <label>
              <span>New from layout</span>
              <select value={selectedLayoutId} onChange={(event) => setLayoutChoice(event.target.value)} disabled={!deckDocument?.layouts.length}>
                {deckDocument?.layouts.map((layout) => <option value={layout.id} key={layout.id}>{layout.name}</option>)}
              </select>
            </label>
            <button className="button button--wide" type="button" disabled={!selectedLayoutId} onClick={createSlide}>＋ Add slide</button>
          </div>
          {report && (
            <details className="import-report">
              <summary><span>Import report</span><b>{report.warnings.length}</b></summary>
              <div className="import-report__body">
                {report.warnings.length === 0 ? <p>No compatibility warnings.</p> : report.warnings.map((warning, index) => (
                  <p key={`${warning.code}-${index}`}><b>{warning.code}</b>{warning.message}</p>
                ))}
              </div>
            </details>
          )}
        </aside>

        <section className="stage-column">
          <div className="stage-toolbar">
            <div className="mode-switch" aria-label="Output mode">
              {(Object.keys(OUTPUT_LABELS) as OutputMode[]).map((mode) => (
                <button type="button" key={mode} className={outputMode === mode ? 'is-active' : ''} onClick={() => setOutputMode(mode)}>
                  {OUTPUT_LABELS[mode]}
                </button>
              ))}
            </div>
            <div className="stage-toolbar__meta">
              <span>{OUTPUT_PRESETS[outputMode].width} × {OUTPUT_PRESETS[outputMode].height}</span>
              <button type="button" onClick={() => void captureFrame()} disabled={!currentSlide}>Capture PNG</button>
              <button type="button" onClick={() => void stageRef.current?.requestFullscreen()}>Fullscreen</button>
            </div>
          </div>
          <div className="stage" ref={stageRef}>
            <canvas
              ref={canvasRef}
              aria-label="Interactive 3D presentation canvas"
              onPointerDown={(event) => {
                const id = player?.renderer.pick(event.clientX, event.clientY);
                if (id) setSelectedElementId(id);
              }}
            />
            <div className="stage__grid" aria-hidden="true" />
            <div className="stage__label"><span>LIVE SCENE</span><b>{outputMode === 'mono' ? '01 VIEW' : '02 EYES'}</b></div>
            {busyMessage && <div className="stage-message"><span className="spinner" />{busyMessage}</div>}
            {error && <div className="stage-error"><b>Unable to continue</b><span>{error}</span><button type="button" onClick={() => setError(undefined)}>Dismiss</button></div>}
          </div>
          <div className="transport">
            <div className="transport__slide"><span>{String(Math.max(0, (session?.currentSlideIndex ?? -1) + 1)).padStart(2, '0')}</span><b>{currentSlide?.name ?? 'No slide'}</b></div>
            <div className="transport__controls">
              <button type="button" aria-label="Previous slide" onClick={() => session?.previous()}>←</button>
              <button
                className="play-button"
                type="button"
                aria-label={session?.isPlaying ? 'Pause' : 'Play'}
                onClick={() => session?.isPlaying ? session.pause() : session?.play()}
              >{session?.isPlaying ? 'Ⅱ' : '▶'}</button>
              <button type="button" aria-label="Next slide" onClick={() => session?.next()}>→</button>
            </div>
            <div className="transport__hint">← → navigate <i /> space plays</div>
          </div>
        </section>

        <aside className="inspector panel">
          <div className="panel-heading">
            <div><span className="eyebrow">OBJECT</span><h2>Inspector</h2></div>
            {selectedElement && <span className="type-badge">{selectedElement.type}</span>}
          </div>
          {!selectedElement ? (
            <div className="inspector-empty">
              <span className="inspector-empty__glyph">◇</span>
              <b>Select an element</b>
              <p>Click an object in the scene or choose one from the layer list.</p>
            </div>
          ) : (
            <div className="inspector-scroll">
              <section className="inspector-section object-summary">
                <span>{selectedElement.type.toUpperCase()}</span>
                <h3>{elementLabel(selectedElement)}</h3>
                <small>{selectedElement.id}</small>
              </section>
              {(selectedElement.type === 'text' || selectedElement.type === 'shape') && (
                <section className="inspector-section">
                  <h3>Content</h3>
                  <label className="stacked-field"><span>Text</span><textarea value={selectedElement.type === 'text' ? selectedElement.text : selectedElement.text ?? ''} onChange={(event) => session?.updateText(selectedElement.id, event.target.value)} /></label>
                </section>
              )}
              <section className="inspector-section">
                <h3>Spatial transform</h3>
                <NumberField label="Depth" value={selectedElement.transform.z} min={-0.5} max={1} step={0.01} onChange={(value) => updateTransform('z', value)} />
                <NumberField label="Rotate X" value={selectedElement.transform.rotationX} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationX', value)} />
                <NumberField label="Rotate Y" value={selectedElement.transform.rotationY} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationY', value)} />
                <NumberField label="Rotate Z" value={selectedElement.transform.rotationZ} min={-180} max={180} step={1} onChange={(value) => updateTransform('rotationZ', value)} />
                <NumberField label="Thickness" value={selectedElement.thickness ?? 0.025} min={0.01} max={1} step={0.01} onChange={(value) => mutateSelected((element) => { element.thickness = value; })} />
              </section>
              <section className="inspector-section">
                <div className="section-title-row"><h3>Physics</h3><label className="toggle"><input type="checkbox" checked={Boolean(selectedElement.physics)} onChange={(event) => session?.updateElementPhysics(selectedElement.id, event.target.checked ? { body: 'fixed', shape: 'cuboid', density: 1, restitution: 0.2, friction: 0.5 } : undefined)} /><span /></label></div>
                {selectedElement.physics && (
                  <div className="physics-grid">
                    <label><span>Body</span><select value={selectedElement.physics.body} onChange={(event) => updatePhysics({ body: event.target.value as ElementPhysics['body'] })}><option value="fixed">Fixed</option><option value="dynamic">Dynamic</option><option value="kinematic">Kinematic</option><option value="sensor">Sensor</option></select></label>
                    <label><span>Collider</span><select value={selectedElement.physics.shape} onChange={(event) => updatePhysics({ shape: event.target.value as ElementPhysics['shape'] })}><option value="cuboid">Cuboid</option><option value="ball">Ball</option></select></label>
                    <label><span>Density</span><input type="number" min="0" step="0.1" value={selectedElement.physics.density} onChange={(event) => updatePhysics({ density: Number(event.target.value) })} /></label>
                    <label><span>Bounce</span><input type="number" min="0" max="1" step="0.1" value={selectedElement.physics.restitution} onChange={(event) => updatePhysics({ restitution: Number(event.target.value) })} /></label>
                    <label><span>Friction</span><input type="number" min="0" max="2" step="0.1" value={selectedElement.physics.friction} onChange={(event) => updatePhysics({ friction: Number(event.target.value) })} /></label>
                  </div>
                )}
              </section>
              <section className="inspector-section inspector-actions">
                <button type="button" onClick={() => mutateSelected((element) => { element.visible = !element.visible; })}>{selectedElement.visible ? 'Hide object' : 'Show object'}</button>
                <button className="danger" type="button" onClick={() => { session?.removeElement(selectedElement.id); setSelectedElementId(undefined); }}>Remove</button>
              </section>
            </div>
          )}
          <div className="layer-list">
            <div className="layer-list__heading"><span>LAYERS</span><b>{currentSlide?.elements.length ?? 0}</b></div>
            <div>
              {currentSlide?.elements.map((element) => (
                <button key={element.id} type="button" className={element.id === selectedElementId ? 'is-active' : ''} onClick={() => setSelectedElementId(element.id)}>
                  <span className={`layer-icon layer-icon--${element.type}`}>{element.type === 'text' ? 'T' : element.type === 'image' ? '▧' : element.type === 'chart' ? '▥' : '◇'}</span>
                  <span>{elementLabel(element)}</span><i>{element.visible ? '●' : '○'}</i>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
