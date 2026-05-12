// Cortex floating toolbar — direct port of cortex-editor/Toolbar.tsx, simplified
// for the marketing page. Faithful to the real component: grip handle, optional
// activity badge, segmented Select/Comment mode switcher with sliding indicator,
// divider, and close button. Draggable; snaps to nearest edge on release.

const { useState, useEffect, useRef, useCallback } = React;

const TOOLBAR_MARGIN = 16;
const TOOLBAR_LENGTH = 220;
const TOOLBAR_THICKNESS = 44;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Snap to whichever of the four edges is closest
function snapToEdge(x, y) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const distances = [
    { edge: "top",    d: y, h: false },
    { edge: "bottom", d: vh - (y + TOOLBAR_THICKNESS), h: false },
    { edge: "left",   d: x, h: true },
    { edge: "right",  d: vw - (x + TOOLBAR_LENGTH), h: true },
  ];
  // For our use we always horizontal so really just top vs bottom
  const top = y;
  const bottom = vh - (y + TOOLBAR_THICKNESS);
  if (top < bottom) {
    return { x: clamp(x, TOOLBAR_MARGIN, vw - TOOLBAR_LENGTH - TOOLBAR_MARGIN), y: TOOLBAR_MARGIN, isHorizontal: true };
  }
  return { x: clamp(x, TOOLBAR_MARGIN, vw - TOOLBAR_LENGTH - TOOLBAR_MARGIN), y: vh - TOOLBAR_THICKNESS - TOOLBAR_MARGIN, isHorizontal: true };
}

// Inline Lucide SVG icons (24×24, stroke-width 2, round caps/joins)
const svgProps = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round",
};
// lucide: grip-vertical
const IconGrip = () => (
  <svg {...svgProps}>
    <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
);
// lucide: x
const IconClose = () => (
  <svg {...svgProps}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
// lucide: mouse-pointer-2
const IconSelect = () => (
  <svg {...svgProps}>
    <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />
  </svg>
);
// lucide: message-square
const IconComment = () => (
  <svg {...svgProps}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

function CortexToolbar() {
  const [pos, setPos] = useState(() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    return { x: Math.max(TOOLBAR_MARGIN, (vw - TOOLBAR_LENGTH) / 2), y: vh - TOOLBAR_THICKNESS - TOOLBAR_MARGIN };
  });
  const [snapping, setSnapping] = useState(false);
  const [mode, setMode] = useState("select"); // 'select' | 'comment'
  const [pendingCount, setPendingCount] = useState(0);
  const [active, setActive] = useState(true);

  const modesRef = useRef(null);
  const [indicatorX, setIndicatorX] = useState(0);

  // Bridge: read pending edits from window.__cortexState (kept in sync by panel)
  useEffect(() => {
    const tick = () => {
      const s = window.__cortexState;
      if (!s) return;
      const total = Object.values(s.edits || {}).reduce(
        (n, e) => n + Object.keys(e).length, 0);
      setPendingCount(total);
    };
    tick();
    const id = setInterval(tick, 350);
    return () => clearInterval(id);
  }, []);

  // Move sliding indicator under the active mode
  useEffect(() => {
    const c = modesRef.current;
    if (!c) return;
    const btns = c.querySelectorAll(".cortex-toolbar__mode");
    const idx = mode === "comment" ? 1 : 0;
    const btn = btns[idx];
    if (btn) setIndicatorX(btn.offsetLeft);
  }, [mode]);

  // Reflect mode on body so other UI (panel hover/select cursor) can react
  useEffect(() => {
    document.body.setAttribute("data-cx-mode", mode);
  }, [mode]);

  // Drag from grip
  const dragRef = useRef(null);
  const onPointerDown = useCallback((e) => {
    if (!e.target.closest(".cortex-toolbar__grip")) return;
    const startX = e.clientX, startY = e.clientY;
    const start = { ...pos };
    dragRef.current = { startX, startY, start };
    setSnapping(false);
    e.target.setPointerCapture?.(e.pointerId);
  }, [pos]);
  const onPointerMove = useCallback((e) => {
    if (!dragRef.current) return;
    const { startX, startY, start } = dragRef.current;
    setPos({ x: start.x + (e.clientX - startX), y: start.y + (e.clientY - startY) });
  }, []);
  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setSnapping(true);
    setPos((p) => snapToEdge(p.x, p.y));
    setTimeout(() => setSnapping(false), 320);
  }, []);

  // Re-snap on resize
  useEffect(() => {
    const onResize = () => {
      setPos((p) => snapToEdge(p.x, p.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-activate on Shift+Cmd+. (or Shift+Ctrl+. on non-mac)
  useEffect(() => {
    const onKey = (e) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        setActive(true);
      }
    };
    const onActivate = () => setActive(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cortex:activate", onActivate);
    window.__cortexActivate = () => setActive(true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cortex:activate", onActivate);
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className={
        "cortex-toolbar cortex-toolbar--horizontal" +
        (snapping ? " cortex-toolbar--snapping" : "")
      }
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="cortex-toolbar__grip" role="presentation" aria-label="Drag to move">
        <IconGrip />
      </div>

      <button
        type="button"
        className="cortex-toolbar__badge"
        aria-label={`${pendingCount} ${pendingCount === 1 ? "change" : "changes"}`}
        title={`${pendingCount} pending`}
      >
        <span className="cortex-toolbar__badge-dot" aria-hidden="true" />
        {pendingCount} {pendingCount === 1 ? "change" : "changes"}
      </button>

      <div
        className="cortex-toolbar__modes"
        ref={modesRef}
        role="radiogroup"
        aria-label="Editor mode"
      >
        <div
          className="cortex-toolbar__modes-indicator"
          style={{ transform: `translateX(${indicatorX}px)` }}
        />
        <button
          type="button"
          className={
            "cortex-toolbar__mode" +
            (mode === "select" ? " cortex-toolbar__mode--active" : "")
          }
          role="radio"
          aria-checked={mode === "select"}
          aria-label="Select mode"
          title="Select (V)"
          onClick={() => setMode("select")}
        >
          <IconSelect />
        </button>
        <button
          type="button"
          className={
            "cortex-toolbar__mode" +
            (mode === "comment" ? " cortex-toolbar__mode--active" : "")
          }
          role="radio"
          aria-checked={mode === "comment"}
          aria-label="Comment mode"
          title="Comment (C)"
          onClick={() => setMode("comment")}
        >
          <IconComment />
        </button>
      </div>

      <div className="cortex-toolbar__divider" />

      <button
        type="button"
        className="cortex-toolbar__btn cortex-toolbar__btn--close"
        aria-label="Close Cortex"
        title="Close Cortex"
        onClick={() => setActive(false)}
      >
        <IconClose />
      </button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("cx-toolbar-root")).render(<CortexToolbar />);
