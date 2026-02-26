# Panel Component Options — Architecture Decision

## Context

The visual editor panel lives in Shadow DOM alongside an iframe containing the target app. It needs ~70 interactive elements for token-based CSS editing. This document evaluates component/framework options.

### Panel Requirements

| Primitive | Count | Use |
|---|---|---|
| Toggle buttons (radio-group style) | ~50 | Token selectors: `[xs] [sm] [md] [lg] [xl]` x 10 rows |
| Section headers (collapsible) | ~5 | Padding, Margin, Gap, Radius, Changes |
| Action buttons | ~5 | Undo, Discard All, Apply to Code, Browse, Select |
| Status text | ~3 | Mode, selection info, WS status |
| Change list items | variable | Pending changes display |

### Constraints

- **Shadow DOM isolation**: Panel renders inside Shadow DOM root to prevent style leakage into the target app
- **Injected into foreign pages**: Added to user's dev server pages via sidecar proxy
- **Bundle size matters**: Everything is injected, so smaller = better
- **Internal tool**: No public users, but should look decent and be functional
- **No build step for client code preferred**: Client scripts are injected as-is via script injection
- **Communication via postMessage**: Panel sends/receives messages to inspector in iframe
- **Must survive HMR**: Hot module replacement only replaces React modules, not global scripts

### Panel UI Structure

```
Shadow DOM root
+-- <style> (panel styles, isolated)
+-- Header: "Cortex Visual Editor"
+-- Mode section: [Browse] [Select Element] mode toggle buttons
+-- Status: "Navigate to a page, then click Select Element"
|
+-- (When element selected):
|   +-- Selection info: "Card [data-testid=dashboard-card]"
|   +-- Component chain: "Card > Paper > Box"
|   |
|   +-- Padding section:
|   |   +-- "All" row: [xs] [sm] [md] [lg] [xl]
|   |   +-- "Top" row: [xs] [sm] [md] [lg] [xl]
|   |   +-- "Right" row: ...
|   |   +-- "Bottom" row: ...
|   |   +-- "Left" row: ...
|   |
|   +-- Margin section (same per-side structure)
|   +-- Gap section (single row, gap has no sides)
|   +-- Radius section (single row for v1)
|   |
|   +-- Pending changes list: "2 changes"
|   |   +-- "padding-top: md -> xl"
|   |
|   +-- Buttons: [Undo] [Discard All] [Apply to Code]
|
+-- WebSocket status indicator (bottom)
```

---

## Option 1: Shoelace (Web Components Library)

**What it is**: A mature web component library (~60 components). Cherry-pick only what needed.

**Bundle**: ~20-25KB for the subset needed (`sl-button`, `sl-button-group`, `sl-details`, `sl-badge`, `sl-divider`)

**Usage pattern**: Import individual components, use their custom elements in the Shadow DOM. Components like `sl-button-group` provide radio-group behavior, `sl-details` provides collapsible sections, all with built-in accessibility.

**Pros**:
- Native Shadow DOM support, built for this exact use case
- Clean default theme, customizable via CSS custom properties
- Accessible out of the box (ARIA, keyboard nav)
- No framework dependency
- Well-maintained (2M+ weekly npm downloads)

**Cons**:
- 20-25KB is meaningful for an injected tool
- Web component registration is global (`customElements.define`), could collide with target app if it also uses Shoelace
- Requires module bundling or CDN import for the components
- The `customElements.define` collision is not theoretical: if the target app uses Shoelace with a different version, it will throw

**Collision mitigation**: Shoelace supports scoped element registration via base-path utility, but doesn't natively support custom tag prefixes. Would need a wrapper or prefix strategy.

---

## Option 2: Pico CSS + Vanilla DOM

**What it is**: A classless CSS framework (~10KB). You write semantic HTML (`<button>`, `<details>`, `<section>`) and it styles them automatically.

**Bundle**: ~10KB CSS, 0KB JS components

**Usage pattern**: Inject Pico CSS into Shadow DOM as a `<style>` element. Write semantic HTML using standard elements. Pico automatically styles buttons, details, sections, etc. Build all interactivity with vanilla DOM event listeners.

**Pros**:
- Truly minimal, just a stylesheet injected into Shadow DOM
- No component registration, no framework, zero collision risk
- Semantic HTML is naturally accessible
- Looks decent out of the box with zero effort
- Perfect Shadow DOM fit, just put the `<style>` in the shadow root
- No build step needed

**Cons**:
- No interactive components (no button groups, no toggle states)
- All interactivity built manually (toggle logic, collapsible sections, active states)
- Limited customization without CSS overrides
- `role="group"` doesn't give visual button-group styling by default
- The ~50 token buttons will need custom active-state management

---

## Option 3: Open Props + Custom Components

**What it is**: A set of CSS custom properties (~2KB) that provide a design token system (colors, spacing, shadows, easing, etc.). You build components yourself using these tokens.

**Bundle**: ~2KB CSS tokens + your component code

**Usage pattern**: Import Open Props CSS custom properties into Shadow DOM. Define your own CSS classes using these tokens for consistent spacing, colors, radii, etc. Build all HTML and interactivity manually.

**Pros**:
- Tiniest footprint, just design tokens
- Full control over every element
- Perfect Shadow DOM support
- Tokens give consistency without a framework
- No collision risk
- No build step needed

**Cons**:
- Building everything from scratch, buttons, groups, sections, all styling
- More upfront CSS work (though panel has limited variety)
- No accessibility primitives provided (must add ARIA manually)
- Maintaining consistent interaction patterns requires discipline

---

## Option 4: Preact + Custom CSS Variables

**What it is**: Preact (~4KB) for rendering, with a small handwritten CSS variable system (~1KB) for consistent styling. Build ~5 thin components: `TokenGroup`, `Section`, `ActionBar`, `ChangeList`, `StatusBar`.

**Bundle**: ~5KB total (Preact + CSS)

**Usage pattern**: Use Preact with `htm` tagged templates (no JSX build step needed). Define functional components like `TokenGroup`, `Section`, etc. Render into the Shadow DOM root. Manage state with Preact hooks. Style with custom CSS variables.

**Pros**:
- Smallest practical bundle for ~70 interactive elements
- Component composition makes panel code readable
- Full control, no collision risk
- Preact's `htm` tagged template avoids a JSX build step
- Reactive state management for changes/selections

**Cons**:
- All styling built from scratch
- Preact in Shadow DOM needs `render(vdom, shadowRoot)`, works but less documented
- Adds a runtime dependency (though tiny)
- `htm` adds ~1KB to avoid build step, or you need a bundler for JSX
- Need to bundle Preact somehow for injection (inline or CDN)

---

## Option 5: Lit (Web Component Framework)

**What it is**: Google's web component framework (~7KB). Each component is a class with reactive properties and scoped styles.

**Bundle**: ~7KB base + your components

**Usage pattern**: Define components as LitElement subclasses with static styles and reactive properties. Each component gets its own Shadow DOM with scoped CSS. Register via `customElements.define`. Use in the panel's Shadow DOM.

**Pros**:
- Built specifically for Shadow DOM, styles scoped by default per component
- Reactive properties handle toggle state, selections
- Battle-tested (YouTube, Chrome DevTools extensions)
- Good DX with template literals

**Cons**:
- Same `customElements.define` collision risk as Shoelace
- Class-based API is more ceremony than functional style
- 7KB base before you write any components
- Requires bundling for injection
- Each component registers globally

---

## Current Recommendation: Option 2 (Pico CSS) or Option 3 (Open Props)

### Reasoning

The panel has **limited component variety**, really just 3 distinct patterns: token button groups, collapsible sections, and action buttons. The interactivity is simple: click handlers that send `postMessage`. No complex state management, no async data fetching, no conditional rendering trees.

For that level of complexity, a rendering framework is overhead. What you want is:

- **Pico CSS** for fastest path to "looks decent" with semantic HTML
- **Open Props** for more control over the look while staying minimal

Both approaches: zero collision risk, minimal bundle, perfect Shadow DOM fit, no build step.

The tradeoff: toggle/selection logic written imperatively (~30 lines of event delegation).

### Decision Criteria

| Criterion | Shoelace | Pico CSS | Open Props | Preact | Lit |
|---|---|---|---|---|---|
| Bundle size | ~25KB | ~10KB | ~2KB | ~5KB | ~7KB |
| Shadow DOM support | Native | Perfect | Perfect | Works | Native |
| Collision risk | High | None | None | None | High |
| Build step needed | Yes | No | No | Preferred | Yes |
| Accessibility | Built-in | Semantic | Manual | Manual | Manual |
| Interactivity | Built-in | Manual | Manual | Reactive | Reactive |
| Styling effort | Minimal | Minimal | Medium | High | Medium |
| Component variety | 60+ | N/A | N/A | Custom | Custom |

---

## Architecture Review Findings (2026-02-25)

Review team: **frontend**, **security**, **performance**, **design**, **mts** (Master Technical Strategist)
- Selected based on document's focus on: DOM/Shadow DOM/CSS/components (frontend), injection into foreign pages (security), bundle size optimization (performance), token-based UI design (design), and architectural tradeoff analysis (mts)

Mode: **both** (clink multi-model + native Claude agents = 10 parallel reviewers)

### Cross-Reviewer Consensus

Issues flagged independently by 3+ reviewers — highest confidence signals:

| Issue | Flagged By | Severity |
|---|---|---|
| "~30 lines of event delegation" estimate is 10-20x wrong; actual is 300-600 lines | frontend (clink), mts (clink), frontend (native), design (native x2), mts (native), performance (native), security (native) — **8/10** | CRITICAL |
| Recommendation should be Preact + Open Props, not Pico/Open Props alone | frontend (clink), mts (clink), frontend (native), design (native x2), mts (native), performance (native) — **7/10** | CRITICAL |
| "No build step" is a false differentiator — tsup already configured in project | mts (clink), frontend (native), mts (native), performance (native) — **4/10** | HIGH |
| State management has 7 dimensions, contradicts "no complex state" claim | mts (clink), mts (native), design (native), performance (native) — **4/10** | HIGH |
| Shadow DOM is NOT a security boundary — same-origin iframe allows bypass | security (clink), security (native x2) — **3/10** | HIGH |
| XSS risk from rendering unsanitized selection data (textContent, classNames) | security (clink), security (native x2) — **3/10** | HIGH |
| Bundle size claims need correction — sizes converge at 8-14KB with panel code | performance (clink), performance (native), mts (native) — **3/10** | MEDIUM |

### Consolidated Findings by Severity

#### CRITICAL — Must fix before v1

**1. Imperative DOM estimate is dangerously wrong**
- *Reviewers*: 8 of 10
- *Evidence*: The existing `scripts/visual-toolbar.js` is **708 lines** for a simpler toolbar with fewer interactive elements. The proposed panel has ~70+ elements across 10 token rows with per-side spacing, collapsible sections, pending changes list, and multi-state action buttons.
- *The "~30 lines of event delegation" claim* would only cover a single event listener setup. The actual imperative code includes: DOM construction (~100 lines), state synchronization (~80 lines), event delegation + handlers (~60 lines), conditional rendering (~80 lines), list diffing for changes (~40 lines), active state management across 50 buttons (~40 lines), section collapse/expand (~30 lines), accessibility attributes (~30 lines). **Realistic: 300-600 lines.**
- *Fix*: Revise estimate to 300-600 lines. Use this corrected estimate in the recommendation analysis.

**2. Recommendation should shift to Preact + Open Props hybrid**
- *Reviewers*: 7 of 10
- *Rationale*: Once the imperative DOM estimate is corrected, the "framework is overhead" argument collapses. At 300-600 lines of imperative DOM code, you're essentially building a bespoke framework anyway — one without reactivity, diffing, or component boundaries. Preact (~4KB gzipped) provides:
  - Reactive state for 7 state dimensions (mode, selection, token maps, active tokens, pending changes, finalization state, WS status)
  - Component boundaries matching the implementation plan's own thinking (`TokenGroup`, `Section`, `ActionBar`, `ChangeList`, `StatusBar`)
  - `render(vdom, shadowRoot)` works directly — Preact supports rendering into any DOM node
  - Combined with Open Props (~2-4KB) for design tokens, total is ~6-8KB — comparable to Pico CSS alone
- *Fix*: Change recommendation to **Option 4 + Option 3 hybrid** (Preact + Open Props). Use tsup to bundle Preact + JSX into a single injected script.

#### HIGH — Should fix in v1

**3. "No build step" is a false differentiator**
- *Reviewers*: 4 of 10
- The implementation plan already configures tsup for server-side bundling. The client script must be injected somehow — whether inlined, CDN-loaded, or bundled. Since a build step exists, the "no build step" advantage of Options 2/3 evaporates. Preact + JSX via tsup is zero additional infrastructure.

**4. State management complexity is underestimated**
- *Reviewers*: 4 of 10
- The document claims "no complex state management" but the implementation plan describes 7 distinct state dimensions that must stay synchronized:
  1. Editor mode (browse/select)
  2. Selected element + source resolution
  3. Token maps per property (computed from target app CSS)
  4. Active token per property-side (user selections)
  5. Pending changes list (accumulating diffs)
  6. Finalization state (applying to code)
  7. WebSocket connection status
- With imperative DOM, each state change requires manually finding and updating every affected DOM node. With Preact, you call `setState` and the framework handles it.

**5. Shadow DOM is not a security boundary**
- *Reviewers*: 3 of 10 (all security personas)
- Shadow DOM provides style encapsulation, not access control. In a same-origin iframe architecture, JavaScript in the iframe CAN reach `window.parent.document` and traverse Shadow DOM roots via `shadowRoot` (if mode is "open"). This means:
  - Malicious target app code can read/modify the panel
  - Selection data flowing from target app to panel must be treated as untrusted
- *Mitigation*: Use `{mode: "closed"}` for Shadow DOM. Validate all postMessage origins. Sanitize all data before rendering.

**6. XSS via unsanitized selection data**
- *Reviewers*: 3 of 10 (all security personas)
- Selection data (textContent, className, component names) comes from the target app. If rendered via `textContent` property (not `innerHTML`), this is safe. But the document doesn't specify the rendering approach, and imperative DOM code is more prone to accidentally using `innerHTML` for convenience.
- *Mitigation*: Preact's JSX automatically escapes interpolated values, making XSS structurally harder. This is another argument for the Preact approach.

#### MEDIUM

- **Bundle size claims need correction**: Pico classless is ~6KB (not 10KB), Open Props subset is ~4-6KB (not 2KB), Preact realistic is 10-14KB with panel code (not 5KB). When you include the panel's own code, all options converge to 8-14KB. The differentiator is developer experience and maintainability, not bundle size.
- **customElements.define collision risk is architecture-dependent**: In the iframe architecture, parent frame and iframe have separate `CustomElementRegistry` instances, so collision risk is actually **None** for Options 1 and 5 in this specific architecture. However, same-origin means scripts can technically cross the boundary, so "Low" is more accurate than "High".
- **Token button UX needs 4 visual states**: default, hover, active/selected, and "inherited from All" — the document doesn't address inherited state visualization, which is important for per-side overrides.
- **Pico CSS fights dense layouts**: Pico is optimized for content pages with generous spacing. The panel's dense token grid (5 buttons × 10 rows) will require significant CSS overrides to Pico's defaults, negating the "looks decent out of the box" advantage.
- **Missing Option 6: Vanilla Web Components** (no library): Define `class TokenGroup extends HTMLElement` directly. Zero library cost, scoped styles per component, no collision if prefixed (`<cortex-token-group>`). Viable middle ground between imperative DOM and a framework.
- **`_debugOwner` removed in React 19**: The existing inspector uses `_debugOwner` for fiber traversal. React 19 removes this. Must switch to `fiber.return` with tag filtering. Not specific to the panel choice, but affects the system these options integrate with.
- **MessageChannel preferred over postMessage**: `MessageChannel` provides a dedicated port pair, eliminating origin-checking boilerplate and preventing message interception by other listeners on the window.

#### LOW

- Missing accessibility specification for keyboard navigation between token buttons (arrow keys within group, tab between groups)
- No mention of reduced-motion media query support for panel animations
- WebSocket reconnection strategy not addressed (exponential backoff, status indicator states)
- No dark mode consideration for the panel (may be needed if target app uses dark theme)

### Positive Practices — Preserve These

1. **Token-constrained editing model**: Restricting to design system tokens (xs/sm/md/lg/xl) rather than arbitrary values is architecturally sound — it prevents invalid states and keeps the UI simple.
2. **Shadow DOM isolation for style encapsulation**: Correctly identified as the right tool for preventing style leakage between panel and target app.
3. **Per-side spacing model**: Supporting padding-top, padding-right, etc. independently rather than just "padding all" shows understanding of real design needs.
4. **Pending changes list with undo**: Batch-then-apply model prevents premature source code changes and gives designers a safety net.
5. **Thorough options analysis**: Evaluating 5 approaches with consistent criteria (bundle size, collision risk, build step, accessibility) is the right process — the conclusion just needs updating based on corrected assumptions.

### Review Methodology Note

**Both mode** deployed 10 parallel reviewers: 5 via PAL clink (distributed across Codex, Gemini, and Claude for model diversity) and 5 via native Claude Task agents (with direct codebase access).

**What clink uniquely caught**:
- MTS (Gemini) was the most forceful in calling the recommendation "dangerously flawed" — the adversarial framing was productive
- Security (Gemini) identified DNS rebinding and CSWSH attack vectors not covered by native reviewers
- Performance (Codex) provided the most precise corrected bundle size numbers

**What native uniquely caught**:
- Frontend (native) discovered that `customElements.define` collision is actually None in iframe architecture — required understanding the parent/iframe document separation
- MTS (native) enumerated all 7 state dimensions by cross-referencing the implementation plan
- Security (native) identified `MessageChannel` as superior to `postMessage` for this architecture
- Design (native) provided the 4-state token button analysis (default/hover/selected/inherited)

**Recommendation**: Both mode provides the most comprehensive coverage. Clink excels at adversarial challenge and cross-model perspective diversity. Native excels at codebase-grounded analysis that requires reading actual implementation files.
