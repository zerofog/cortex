// Cortex live demo panel. Mounts inside the demo shell.
// Lets the user click any [data-cx-target] in the mockapp, edits stage as
// CSS overrides on the element, and writes lines into #feed (the MCP channel).
// Nothing leaves the page.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// design tokens we expose in the panel
const SPACING_TOKENS = [
  { name: "xs", px: 4 },
  { name: "sm", px: 8 },
  { name: "md", px: 12 },
  { name: "lg", px: 20 },
  { name: "xl", px: 32 },
];
const RADIUS_TOKENS = [
  { name: "none", px: 0 },
  { name: "sm", px: 4 },
  { name: "md", px: 8 },
  { name: "lg", px: 14 },
  { name: "full", px: 999 },
];
const COLORS = [
  { name: "ink", value: "#111827" },
  { name: "accent", value: "#3b82f6" },
  { name: "paper", value: "#ffffff" },
  { name: "vellum", value: "#fafafa" },
  { name: "well", value: "#f5f5f5" },
];

// rules per element label (what controls to show)
function controlsFor(el) {
  if (!el) return [];
  const tag = el.tagName.toLowerCase();
  const cls = el.className || "";
  if (cls.includes("ma-cta")) return ["padding", "radius", "bg"];
  if (cls.includes("ma-card")) return ["padding", "radius", "gap"];
  if (cls.includes("ma-stats")) return ["gap", "padding"];
  if (tag === "h2") return ["size", "padding"];
  if (tag === "p") return ["size", "color"];
  return ["padding", "radius"];
}

let feedClock = 0;
function pushFeed(tag, text) {
  const feed = document.getElementById("demo-feed") || document.getElementById("feed");
  if (!feed) return;
  feedClock += 0.42 + Math.random() * 0.6;
  const t = feedClock.toFixed(2).padStart(5, "0");
  const line = document.createElement("div");
  line.className = "line";
  line.innerHTML = `<span class="ts">00:${t}</span><span class="tag ${tag}">${tag}</span><span>${text}</span>`;
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
  // cap
  while (feed.children.length > 18) feed.removeChild(feed.children[1]);
}

function CortexPanel() {
  const [selectedId, setSelectedId] = useState(null);
  const [edits, setEdits] = useState({}); // { id: { padding: "md", ... } }
  const [applied, setApplied] = useState(false);
  const lastClickTimeRef = useRef(0);

  // Wire selection on the mockapp
  useEffect(() => {
    const root = document.getElementById("demo-mockapp") || document.getElementById("mockapp");
    if (!root) return;
    const handler = (e) => {
      const t = e.target.closest("[data-cx-target]");
      if (!t || !root.contains(t)) return;
      e.preventDefault();
      e.stopPropagation();
      // clear previous selection class
      root.querySelectorAll(".cx-selected").forEach((n) => n.classList.remove("cx-selected"));
      t.classList.add("cx-selected");
      const id = t.getAttribute("data-cx-id");
      setSelectedId(id);
      setApplied(false);
      if (window.__cortexState) {
        window.__cortexState.selectedId = id;
        window.__cortexState.notify();
      }
      pushFeed("select", `selected <span style="color:var(--select)">${t.getAttribute("data-cx-label")}</span> · #${id}`);
    };
    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, []);

  const selectedEl = selectedId
    ? document.querySelector(`[data-cx-id="${selectedId}"]`)
    : null;
  const controls = useMemo(() => controlsFor(selectedEl), [selectedId]);

  const currentEdits = edits[selectedId] || {};

  const setEdit = useCallback((key, value, label) => {
    setSelectedId((sid) => {
      if (!sid) return sid;
      setEdits((prev) => {
        const next = {
          ...prev,
          [sid]: { ...(prev[sid] || {}), [key]: value },
        };
        if (window.__cortexState) {
          window.__cortexState.selectedId = sid;
          window.__cortexState.edits = next;
          window.__cortexState.notify();
        }
        return next;
      });
      const el = document.querySelector(`[data-cx-id="${sid}"]`);
      if (el) applyEdit(el, key, value);
      pushFeed("edit", `<span style="color:var(--ink)">${key}</span> = <span style="color:var(--select)">${label || value}</span>`);
      setApplied(false);
      return sid;
    });
  }, []);

  const pendingCount = Object.values(edits).reduce(
    (n, e) => n + Object.keys(e).length,
    0
  );

  const onApply = () => {
    if (!pendingCount) return;
    pushFeed("ack", `cortex_apply_edits(${pendingCount}) → claude code`);
    setTimeout(() => {
      pushFeed("write", `claude wrote ${pendingCount} change${pendingCount > 1 ? "s" : ""} to source · <span style="color:var(--ink-3)">demo only</span>`);
      setApplied(true);
      // clear edits state in shared store after apply
      if (window.__cortexState) {
        window.__cortexState.edits = {};
        window.__cortexState.notify();
      }
      setEdits({});
    }, 520);
  };

  const onReset = () => {
    Object.keys(edits).forEach((id) => {
      const el = document.querySelector(`[data-cx-id="${id}"]`);
      if (el) el.removeAttribute("style");
    });
    setEdits({});
    setApplied(false);
    pushFeed("reset", `staging buffer cleared`);
  };

  return (
    <div className="cx-panel" role="region" aria-label="Cortex panel">
      <div className="cx-panel-head">
        <span className="cx-title">Cortex</span>
        <span className="cx-meta">{selectedEl ? selectedEl.getAttribute("data-cx-label") : "no selection"}</span>
      </div>

      {!selectedEl && (
        <div className="cx-empty">
          Click anything in the app on the left to start refining.
        </div>
      )}

      {selectedEl && (
        <>
          {controls.includes("padding") && (
            <div className="cx-section">
              <h4>Spacing</h4>
              <div className="cx-row">
                <span className="cx-lbl">padding</span>
                <div className="cx-tokenrow">
                  {SPACING_TOKENS.map((t) => (
                    <button
                      key={t.name}
                      className="cx-token"
                      aria-pressed={currentEdits.padding === t.name}
                      onClick={() => setEdit("padding", t.name, `${t.name} (${t.px}px)`)}
                    >{t.name}</button>
                  ))}
                </div>
              </div>
              {controls.includes("gap") && (
                <div className="cx-row">
                  <span className="cx-lbl">gap</span>
                  <div className="cx-tokenrow">
                    {SPACING_TOKENS.map((t) => (
                      <button
                        key={t.name}
                        className="cx-token"
                        aria-pressed={currentEdits.gap === t.name}
                        onClick={() => setEdit("gap", t.name, `${t.name} (${t.px}px)`)}
                      >{t.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {controls.includes("radius") && (
            <div className="cx-section">
              <h4>Appearance</h4>
              <div className="cx-row">
                <span className="cx-lbl">radius</span>
                <div className="cx-tokenrow">
                  {RADIUS_TOKENS.map((t) => (
                    <button
                      key={t.name}
                      className="cx-token"
                      aria-pressed={currentEdits.radius === t.name}
                      onClick={() => setEdit("radius", t.name, `${t.name} (${t.px}px)`)}
                    >{t.name}</button>
                  ))}
                </div>
              </div>
              {controls.includes("bg") && (
                <div className="cx-row">
                  <span className="cx-lbl">bg</span>
                  <div className="cx-tokenrow">
                    {COLORS.map((c) => (
                      <button
                        key={c.name}
                        className="cx-token"
                        aria-pressed={currentEdits.bg === c.name}
                        onClick={() => setEdit("bg", c.name, c.name)}
                        style={{display: "inline-flex", alignItems: "center", gap: 5}}
                      >
                        <span style={{width:9, height:9, borderRadius:2, background:c.value, border:"1px solid rgba(0,0,0,0.08)"}} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {controls.includes("size") && (
            <div className="cx-section">
              <h4>Typography</h4>
              <div className="cx-row">
                <span className="cx-lbl">size</span>
                <div className="cx-seg" role="tablist">
                  {["sm","md","lg","xl"].map((s) => (
                    <button
                      key={s}
                      aria-pressed={currentEdits.size === s}
                      onClick={() => setEdit("size", s, s)}
                    >{s}</button>
                  ))}
                </div>
              </div>
              {controls.includes("color") && (
                <div className="cx-row">
                  <span className="cx-lbl">color</span>
                  <div className="cx-tokenrow">
                    {COLORS.slice(0,2).concat([{name:"muted", value:"#6b7280"}]).map((c) => (
                      <button
                        key={c.name}
                        className="cx-token"
                        aria-pressed={currentEdits.color === c.name}
                        onClick={() => setEdit("color", c.name, c.name)}
                        style={{display:"inline-flex",alignItems:"center",gap:5}}
                      >
                        <span style={{width:9,height:9,borderRadius:999,background:c.value,border:"1px solid rgba(0,0,0,0.08)"}} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="cx-footer">
            <div className="cx-pending">
              <span>{pendingCount === 0 ? "no pending changes" : "pending changes"}</span>
              <span className="count">{pendingCount}</span>
            </div>
            <button
              className={"cx-apply" + (applied ? " is-applied" : "")}
              disabled={!pendingCount}
              onClick={onApply}
            >
              {applied ? "✓ applied to source" : "Apply to source"}
            </button>
            {pendingCount > 0 && !applied && (
              <button
                onClick={onReset}
                style={{
                  width: "100%", marginTop: 6, height: 24,
                  background: "transparent", color: "var(--ink-3)",
                  border: 0, fontFamily: "var(--mono)", fontSize: 10,
                  cursor: "pointer"
                }}
              >reset staging buffer</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Translate token edit into inline style override
function applyEdit(el, key, value) {
  const sp = Object.fromEntries(
    [
      ["xs", 4], ["sm", 8], ["md", 12], ["lg", 20], ["xl", 32],
    ]
  );
  const r = Object.fromEntries(
    [
      ["none", 0], ["sm", 4], ["md", 8], ["lg", 14], ["full", 999],
    ]
  );
  const colors = {
    ink: "#111827", accent: "#3b82f6", paper: "#ffffff",
    vellum: "#fafafa", well: "#f5f5f5", muted: "#6b7280",
  };
  const fontSizes = { sm: "13px", md: "16px", lg: "20px", xl: "26px" };

  if (key === "padding") el.style.padding = sp[value] + "px";
  else if (key === "gap")     el.style.gap = sp[value] + "px";
  else if (key === "radius")  el.style.borderRadius = r[value] + "px";
  else if (key === "bg")      el.style.background = colors[value];
  else if (key === "color")   el.style.color = colors[value];
  else if (key === "size")    el.style.fontSize = fontSizes[value];
}

// expose for use outside the panel (Claude Code diff card)
window.__cortexState = {
  subscribers: new Set(),
  selectedId: null,
  edits: {},
  notify() { this.subscribers.forEach(fn => fn(this)); },
};

// Mount the panel whenever #cx-root appears (it's created by the demo-shell
// tweak, so it doesn't exist on initial load).
function mountCortexPanel() {
  const root = document.getElementById("cx-root");
  if (!root || root.__cortexMounted) return;
  root.__cortexMounted = true;
  ReactDOM.createRoot(root).render(<CortexPanel />);
}
mountCortexPanel();
const cortexObserver = new MutationObserver(() => mountCortexPanel());
cortexObserver.observe(document.body, { childList: true, subtree: true });

// ---- Diff preview ----------------------------------------------------------
// Generates a token-aware patch per pending edit. Maps the chosen design token
// to the user's existing token name (--space-sm, etc) and shows a unified-diff
// snippet keyed to the file/line in the data-cx-* attrs on the element.

const TOKEN_MAP = {
  padding: { xs: "--space-xs", sm: "--space-sm", md: "--space-md", lg: "--space-lg", xl: "--space-xl" },
  gap:     { xs: "--space-xs", sm: "--space-sm", md: "--space-md", lg: "--space-lg", xl: "--space-xl" },
  radius:  { none: "--radius-none", sm: "--radius-sm", md: "--radius-md", lg: "--radius-lg", full: "--radius-full" },
  bg:      { ink: "--color-ink", accent: "--color-accent", paper: "--color-paper", vellum: "--color-vellum", well: "--color-well" },
  color:   { ink: "--color-ink", accent: "--color-accent", muted: "--color-muted" },
  size:    { sm: "--text-sm", md: "--text-md", lg: "--text-lg", xl: "--text-xl" },
};

const PROP_MAP = {
  padding: "padding", gap: "gap",
  radius: "border-radius", bg: "background",
  color: "color", size: "font-size",
};

// per-element prior values (what the file currently has) for the diff
const PRIOR = {
  "hero-h":      { size: "xl",  padding: "md" },
  "hero-p":      { size: "md",  color: "muted" },
  "card":        { padding: "lg", radius: "md", gap: "md" },
  "card-title":  { size: "md" },
  "card-sub":    { size: "sm", color: "muted" },
  "cta":         { padding: "sm", radius: "sm", bg: "ink" },
  "stats":       { gap: "md", padding: "md" },
};

function DiffPreview({ el, edits }) {
  const file = el.getAttribute("data-cx-file") || "App.tsx";
  const line = el.getAttribute("data-cx-line") || "1";
  const comp = el.getAttribute("data-cx-comp") || "Component";
  const id = el.getAttribute("data-cx-id");
  const prior = PRIOR[id] || {};

  const lines = [];
  Object.entries(edits).forEach(([key, val]) => {
    const prop = PROP_MAP[key];
    const newToken = TOKEN_MAP[key]?.[val] || val;
    const oldVal = prior[key];
    const oldToken = oldVal ? (TOKEN_MAP[key]?.[oldVal] || oldVal) : null;
    if (oldToken) {
      lines.push({ type: "del", prop, token: oldToken });
    }
    lines.push({ type: "add", prop, token: newToken });
  });

  return (
    <div className="cx-diff" aria-label="Generated diff">
      <div className="cx-diff-head">
        <span className="file">{file}<span className="ln">:{line}</span></span>
        <span>· {comp}</span>
        <span className="lang">tsx</span>
      </div>
      <div className="cx-diff-body">
        <div className="cx-diff-line ctx">
          <span className="sigil"> </span>
          <span>{`<${comp.toLowerCase()} className={cn(`}</span>
        </div>
        {lines.map((l, i) => (
          <div key={i} className={"cx-diff-line " + l.type}>
            <span className="sigil">{l.type === "add" ? "+" : "-"}</span>
            <span>
              {`  "${l.prop}-`}
              <span className="cx-diff-token">{l.token.replace(/^--/, "")}</span>
              {`",`}
            </span>
          </div>
        ))}
        <div className="cx-diff-line ctx">
          <span className="sigil"> </span>
          <span>{`)} />`}</span>
        </div>
      </div>
      <div className="cx-diff-foot">
        <span className="pill">tokens preserved</span>
        <span>uses your design system, not raw px</span>
      </div>
    </div>
  );
}
