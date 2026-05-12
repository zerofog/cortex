// Renders inside #claude-root — Claude Code's view of pending edits.
// Subscribes to window.__cortexState (populated by cortex-panel.jsx) so it
// reflects what's currently staged. Each pending edit becomes a unified-diff
// snippet keyed to the file/line/component on the selected element.

const { useState, useEffect } = React;

const TOKEN_MAP = {
  padding: { xs: "space-xs", sm: "space-sm", md: "space-md", lg: "space-lg", xl: "space-xl" },
  gap:     { xs: "space-xs", sm: "space-sm", md: "space-md", lg: "space-lg", xl: "space-xl" },
  radius:  { none: "radius-none", sm: "radius-sm", md: "radius-md", lg: "radius-lg", full: "radius-full" },
  bg:      { ink: "color-ink", accent: "color-accent", paper: "color-paper", vellum: "color-vellum", well: "color-well" },
  color:   { ink: "color-ink", accent: "color-accent", muted: "color-muted" },
  size:    { sm: "text-sm", md: "text-md", lg: "text-lg", xl: "text-xl" },
};
const PROP_MAP = {
  padding: "padding", gap: "gap",
  radius: "rounded", bg: "bg",
  color: "text", size: "text",
};

// Per-element prior token values (what the file currently has)
const PRIOR = {
  "hero-h":      { size: "xl",  padding: "md" },
  "hero-p":      { size: "md",  color: "muted" },
  "card":        { padding: "lg", radius: "md", gap: "md" },
  "card-title":  { size: "md" },
  "card-sub":    { size: "sm", color: "muted" },
  "cta":         { padding: "sm", radius: "sm", bg: "ink" },
  "stats":       { gap: "md", padding: "md" },
};

function ClaudeView() {
  const [state, setState] = useState({ selectedId: null, edits: {} });

  useEffect(() => {
    const store = window.__cortexState;
    if (!store) return;
    const sub = (s) => setState({ selectedId: s.selectedId, edits: { ...s.edits } });
    store.subscribers.add(sub);
    return () => store.subscribers.delete(sub);
  }, []);

  const meta = document.getElementById("claude-meta");

  const ids = Object.keys(state.edits || {}).filter(id => Object.keys(state.edits[id] || {}).length);

  useEffect(() => {
    if (meta) {
      const total = ids.reduce((n, id) => n + Object.keys(state.edits[id] || {}).length, 0);
      meta.textContent = total ? `${total} pending edit${total > 1 ? "s" : ""}` : "awaiting edits…";
    }
  });

  if (ids.length === 0) {
    return (
      <div className="claude-empty">
        Cortex pushes edits over the MCP channel.
        <br />Claude proposes the file changes here.
      </div>
    );
  }

  return (
    <>
      <div className="claude-msg">
        <div className="who">claude</div>
        <div>I'll apply {ids.length === 1 ? "this edit" : `${ids.length} edits`} using your design tokens. Review the diff before approving.</div>
      </div>
      <div className="claude-diff-wrap">
        {ids.map((id) => {
          const el = document.querySelector(`[data-cx-id="${id}"]`);
          if (!el) return null;
          const file = el.getAttribute("data-cx-file") || "App.tsx";
          const line = el.getAttribute("data-cx-line") || "1";
          const comp = el.getAttribute("data-cx-comp") || "Component";
          const prior = PRIOR[id] || {};
          const edits = state.edits[id] || {};

          // build a flat list of - / + lines per edit
          const lines = [];
          Object.entries(edits).forEach(([key, val]) => {
            const propPrefix = PROP_MAP[key];
            const newToken = TOKEN_MAP[key]?.[val] || val;
            const oldVal = prior[key];
            const oldToken = oldVal != null ? (TOKEN_MAP[key]?.[oldVal] || oldVal) : null;
            if (oldToken) lines.push({ type: "del", prop: propPrefix, token: oldToken });
            lines.push({ type: "add", prop: propPrefix, token: newToken });
          });

          return (
            <div key={id} style={{ marginBottom: 14 }}>
              <div className="claude-diff-file">
                <span className="path">{file}<span className="ln">:{line}</span></span>
                <span>· {comp}</span>
                <span className="lang">tsx</span>
              </div>
              <div className="claude-diff-body">
                <div className="claude-line ctx">
                  <span className="sigil"> </span>
                  <span>{`<${comp.toLowerCase()} className={cn(`}</span>
                </div>
                {lines.map((l, i) => (
                  <div key={i} className={"claude-line " + l.type}>
                    <span className="sigil">{l.type === "add" ? "+" : "-"}</span>
                    <span>
                      {`  "`}
                      <span className="claude-token">{l.prop}-{l.token}</span>
                      {`",`}
                    </span>
                  </div>
                ))}
                <div className="claude-line ctx">
                  <span className="sigil"> </span>
                  <span>{`)} />`}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="claude-foot">
          <span className="pill">tokens preserved</span>
          <span>uses your design system</span>
        </div>
      </div>
    </>
  );
}

function mountClaude() {
  const root = document.getElementById("claude-body");
  if (!root || root.__claudeMounted) return;
  root.__claudeMounted = true;
  ReactDOM.createRoot(root).render(<ClaudeView />);
}
mountClaude();
const claudeObserver = new MutationObserver(() => mountClaude());
claudeObserver.observe(document.body, { childList: true, subtree: true });
