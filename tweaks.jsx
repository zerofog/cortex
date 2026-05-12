// Tweaks panel for landing page variants

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "paper",
  "heroLayout": "stacked",
  "headline": "Edit your UI where it lives.",
  "showChannel": true,
  "showDemoShell": false,
  "showVersus": false,
  "showHowItWorks": false,
  "showFullSetup": false
}/*EDITMODE-END*/;

function Tweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply theme + hero layout
  React.useEffect(() => {
    document.body.setAttribute("data-variant", t.theme);
  }, [t.theme]);

  React.useEffect(() => {
    document.body.setAttribute("data-hero", t.heroLayout);
  }, [t.heroLayout]);

  React.useEffect(() => {
    const h = document.querySelector("h1.headline");
    if (h) {
      // preserve <em> bit if user keeps phrasing close
      const text = t.headline || "";
      const idx = text.indexOf("[");
      const idx2 = text.indexOf("]");
      if (idx >= 0 && idx2 > idx) {
        h.innerHTML =
          escapeHtml(text.slice(0, idx)) +
          "<em>" + escapeHtml(text.slice(idx + 1, idx2)) + "</em>" +
          escapeHtml(text.slice(idx2 + 1));
      } else {
        // try to highlight the last 3 words
        const parts = text.trim().split(/\s+/);
        if (parts.length >= 3) {
          const head = parts.slice(0, parts.length - 3).join(" ");
          const tail = parts.slice(parts.length - 3).join(" ");
          h.innerHTML = escapeHtml(head) + " <em>" + escapeHtml(tail) + "</em>";
        } else {
          h.textContent = text;
        }
      }
    }
  }, [t.headline]);

  React.useEffect(() => {
    const ch = document.querySelector(".channel");
    if (ch) ch.style.display = t.showChannel ? "" : "none";
  }, [t.showChannel]);

  // Demo shell: opt-in self-contained sandbox under the hero
  React.useEffect(() => {
    const hero = document.querySelector("section.hero");
    if (!hero) return;
    let shell = document.getElementById("demo-shell");
    let channelPair = document.getElementById("channel-pair");
    if (t.showDemoShell) {
      if (!shell) {
        shell = document.createElement("div");
        shell.id = "demo-shell";
        shell.className = "demo-shell";
        shell.innerHTML = `
          <div class="demo-chrome">
            <div class="dots"><span></span><span></span><span></span></div>
            <div class="url">localhost:5173 — your app</div>
            <span class="badge"><span class="d"></span>cortex active</span>
          </div>
          <div class="demo-grid">
            <div class="mockapp" id="demo-mockapp">
              <h2 class="ma-h" data-cx-target data-cx-id="d-h" data-cx-label="h2.ma-h" data-cx-file="Dashboard.tsx" data-cx-line="11" data-cx-comp="Heading">Welcome back, Alex</h2>
              <p class="ma-p" data-cx-target data-cx-id="d-p" data-cx-label="p.ma-p" data-cx-file="Dashboard.tsx" data-cx-line="14" data-cx-comp="Lede">Pick up where you left off. Click any element to refine it.</p>
              <div class="ma-card" data-cx-target data-cx-id="d-card" data-cx-label="div.ma-card" data-cx-file="Dashboard.tsx" data-cx-line="17" data-cx-comp="ProjectCard">
                <div class="ma-avatar" aria-hidden="true"></div>
                <div>
                  <p class="ma-title" data-cx-target data-cx-id="d-title" data-cx-label="p.ma-title" data-cx-file="ProjectCard.tsx" data-cx-line="9" data-cx-comp="Title">Project Aurora</p>
                  <p class="ma-sub" data-cx-target data-cx-id="d-sub" data-cx-label="p.ma-sub" data-cx-file="ProjectCard.tsx" data-cx-line="12" data-cx-comp="Subtitle">12 commits this week</p>
                </div>
                <button class="ma-cta" data-cx-target data-cx-id="d-cta" data-cx-label="button.ma-cta" data-cx-file="ProjectCard.tsx" data-cx-line="15" data-cx-comp="Button">Open</button>
              </div>
              <div class="ma-stats" data-cx-target data-cx-id="d-stats" data-cx-label="div.ma-stats" data-cx-file="Dashboard.tsx" data-cx-line="24" data-cx-comp="Stats">
                <div class="ma-stat"><div class="ma-stat-num">128</div><div class="ma-stat-lbl">Components</div></div>
                <div class="ma-stat"><div class="ma-stat-num">14</div><div class="ma-stat-lbl">Pages</div></div>
                <div class="ma-stat"><div class="ma-stat-num">3.2k</div><div class="ma-stat-lbl">Lines</div></div>
              </div>
            </div>
            <div class="cortex-panel-mount" id="cx-root"></div>
          </div>
        `;
        hero.appendChild(shell);
      }
      if (!channelPair) {
        channelPair = document.createElement("div");
        channelPair.id = "channel-pair";
        channelPair.className = "channel-pair";
        channelPair.innerHTML = `
          <div class="demo-mcp" id="demo-feed">
            <div class="ds-h">MCP channel</div>
            <div class="line"><span class="ts">00:00.00</span><span class="tag">init</span><span>cortex.activate() · channel <span style="color:var(--select)">opened</span></span></div>
          </div>
          <div class="demo-claude" id="claude-root">
            <div class="claude-head">
              <div class="claude-title">Claude Code</div>
              <div class="claude-meta" id="claude-meta">awaiting edits…</div>
            </div>
            <div class="claude-body" id="claude-body"></div>
          </div>
        `;
        hero.appendChild(channelPair);
      }
    } else {
      if (shell) shell.remove();
      if (channelPair) channelPair.remove();
    }
  }, [t.showDemoShell]);

  // Optional restored sections — injected after the install section
  React.useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const installSec = document.getElementById("install");
    const anchor = installSec || main.lastElementChild;

    // VERSUS
    let versus = document.getElementById("tw-versus");
    if (t.showVersus) {
      if (!versus) {
        versus = document.createElement("section");
        versus.id = "tw-versus";
        versus.className = "section section--tight";
        versus.innerHTML = `
          <div class="list-head"><span class="list-head__num">// without vs with</span></div>
          <div class="versus">
            <div class="versus-col is-old">
              <div class="label">Without Cortex</div>
              <h3>Negotiating with prose.</h3>
              <div class="chat-bubble user">make this card a little smaller</div>
              <div class="chat-bubble user">no, the padding. tighten it.</div>
              <div class="chat-bubble user">try 12px? actually 10. and bump the heading down one size.</div>
              <div class="chat-meta">3 turns · still wrong · context burned</div>
            </div>
            <div class="versus-divider" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
            <div class="versus-col is-new">
              <div class="label">With Cortex</div>
              <h3>Direct manipulation.</h3>
              <ul class="gesture-list">
                <li><span class="key">drag</span><span>card padding</span><span class="val">md → sm</span></li>
                <li><span class="key">click</span><span>heading size</span><span class="val">xl → lg</span></li>
                <li><span class="key">apply</span><span>2 edits to source</span><span class="val">✓ written</span></li>
              </ul>
              <div class="chat-meta">0 turns of prose · exact values · agent stays on task</div>
            </div>
          </div>
        `;
        anchor.parentNode.insertBefore(versus, anchor.nextSibling);
      }
    } else if (versus) versus.remove();

    // HOW IT WORKS
    let how = document.getElementById("tw-how");
    if (t.showHowItWorks) {
      if (!how) {
        how = document.createElement("section");
        how.id = "tw-how";
        how.className = "section section--tight";
        how.innerHTML = `
          <div class="list-head"><span class="list-head__num">// how it works</span></div>
          <div class="how">
            <div class="step">
              <div class="step-num">01 / EDIT</div>
              <h3>Click any element</h3>
              <p>Drag, type, pick tokens. Changes apply as live CSS overrides in the browser. Your source is untouched.</p>
            </div>
            <div class="step">
              <div class="step-num">02 / REVIEW</div>
              <h3>Read the diff</h3>
              <p>Cortex pushes intents to Claude Code over MCP. Claude proposes the file changes, scoped to the design system tokens you already use.</p>
            </div>
            <div class="step">
              <div class="step-num">03 / APPLY</div>
              <h3>Approve the write</h3>
              <p>Click Apply. Claude writes to the source files. Reload, the override is gone, the change is real.</p>
            </div>
          </div>
        `;
        const sib = versus || anchor;
        sib.parentNode.insertBefore(how, sib.nextSibling);
      }
    } else if (how) how.remove();

    // FULL SETUP (numbered + copy buttons)
    let full = document.getElementById("tw-fullsetup");
    if (t.showFullSetup) {
      if (!full) {
        full = document.createElement("section");
        full.id = "tw-fullsetup";
        full.className = "section section--tight";
        full.innerHTML = `
          <div class="list-head"><span class="list-head__num">// full setup</span></div>
          <div class="setup" style="max-width:520px">
            <ol class="setup-steps">
              <li class="setup-step">
                <span class="setup-step__num">1</span>
                <div class="setup-step__body">
                  <span class="setup-step__label">Install the MCP</span>
                  <button class="install-cmd" type="button" onclick="(function(b){navigator.clipboard&&navigator.clipboard.writeText('npm i -D @cortex/mcp');b.classList.add('copied');clearTimeout(b._t);b._t=setTimeout(function(){b.classList.remove('copied')},1400)})(this)">
                    <span class="install-cmd__prompt">$</span>
                    <span class="install-cmd__text">npm i -D @cortex/mcp</span>
                    <span class="install-cmd__icon"><svg class="i-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="i-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
                  </button>
                </div>
              </li>
              <li class="setup-step">
                <span class="setup-step__num">2</span>
                <div class="setup-step__body">
                  <span class="setup-step__label">In Claude Code, type</span>
                  <button class="install-cmd install-cmd--alt" type="button" onclick="(function(b){navigator.clipboard&&navigator.clipboard.writeText('activate cortex');b.classList.add('copied');clearTimeout(b._t);b._t=setTimeout(function(){b.classList.remove('copied')},1400)})(this)">
                    <span class="install-cmd__prompt">&gt;</span>
                    <span class="install-cmd__text">activate cortex</span>
                    <span class="install-cmd__icon"><svg class="i-copy" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><svg class="i-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>
                  </button>
                </div>
              </li>
            </ol>
          </div>
        `;
        const sib = how || versus || anchor;
        sib.parentNode.insertBefore(full, sib.nextSibling);
      }
    } else if (full) full.remove();
  }, [t.showVersus, t.showHowItWorks, t.showFullSetup]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Theme">
        <TweakRadio
          label="Mode"
          value={t.theme}
          onChange={(v) => setTweak("theme", v)}
          options={[
            { value: "paper", label: "Paper" },
            { value: "blueprint", label: "Blueprint" },
          ]}
        />
      </TweakSection>
      <TweakSection title="Hero">
        <TweakSelect
          label="Layout"
          value={t.heroLayout}
          onChange={(v) => setTweak("heroLayout", v)}
          options={[
            { value: "stacked", label: "Stacked (copy → demo → channel)" },
            { value: "split", label: "Split (copy ⇆ demo)" },
            { value: "centered", label: "Centered" },
          ]}
        />
        <TweakText
          label="Headline"
          value={t.headline}
          onChange={(v) => setTweak("headline", v)}
        />
      </TweakSection>
      <TweakSection title="Sections">
        <TweakToggle
          label="Show MCP channel"
          value={t.showChannel}
          onChange={(v) => setTweak("showChannel", v)}
        />
        <TweakToggle
          label="Demo shell (sandbox app)"
          value={t.showDemoShell}
          onChange={(v) => setTweak("showDemoShell", v)}
        />
        <TweakToggle
          label="Without vs with (versus)"
          value={t.showVersus}
          onChange={(v) => setTweak("showVersus", v)}
        />
        <TweakToggle
          label="How it works (3 steps)"
          value={t.showHowItWorks}
          onChange={(v) => setTweak("showHowItWorks", v)}
        />
        <TweakToggle
          label="Full setup with copy buttons"
          value={t.showFullSetup}
          onChange={(v) => setTweak("showFullSetup", v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

ReactDOM.createRoot(document.getElementById("tweaks-root")).render(<Tweaks />);
