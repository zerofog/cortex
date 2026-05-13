/*
 * cortex-demo-stub.js — fake server for marketing-page Cortex demo.
 *
 * The real Cortex browser bundle (cortex-browser.js) expects a server channel
 * for source-file reads/writes. On a static marketing page no such server
 * exists. This shim provides the minimum protocol surface so the real
 * Cortex UI runs in a "client-only" mode where edits apply as ephemeral
 * CSS overrides (refresh clears them).
 *
 * Protocol contract (must run BEFORE cortex-browser.js):
 *  - window.__cortex_send__(msg)    — Cortex calls this for every outgoing msg
 *  - window.__CORTEX_TOKEN__        — string token Cortex stamps onto sends
 *  - window.__cortex_channel__      — created by Cortex; we call its
 *                                     .handleServerMessage(data) to push fake
 *                                     responses back into the UI.
 *
 * Cortex captures __cortex_send__ + token at channel-create time and deletes
 * the globals. Our stub continues to receive sends through that closure-held
 * reference. Responses go in via __cortex_channel__.handleServerMessage().
 */
(function () {
  "use strict";

  var DEBUG = false;
  function log() {
    if (DEBUG && typeof console !== "undefined")
      console.log.apply(
        console,
        ["[cortex-demo]"].concat([].slice.call(arguments)),
      );
  }

  // Cortex stamps a token onto every outbound message. We don't validate it;
  // it just needs to exist so the channel doesn't bail.
  window.__CORTEX_TOKEN__ = "demo-token";

  // Synthesize a stable session id for the fake `hello` response.
  var SESSION_ID = "demo-" + Math.random().toString(36).slice(2, 10);

  // Deliver a fake server-to-browser message back into the Cortex UI.
  // __cortex_channel__ is created by createViteChannel() after our send
  // function is captured, so we look it up at delivery time, not bind time.
  function deliver(msg) {
    var ch = window.__cortex_channel__;
    if (!ch || typeof ch.handleServerMessage !== "function") {
      log("deliver before channel ready, dropping:", msg);
      return;
    }
    try {
      ch.handleServerMessage(msg);
    } catch (err) {
      log("handleServerMessage threw:", err);
    }
  }

  // Schedule responses on next tick so the channel finishes wiring up
  // its handlers before we push messages into them.
  function later(fn) {
    Promise.resolve().then(fn);
  }

  // Handle one message from the Cortex UI. We respond to the few message
  // types that the UI waits on; everything else is acknowledged silently.
  function handle(msg) {
    log("send:", msg.type, msg);

    switch (msg.type) {
      // 1. Initial handshake. Cortex sends `init` once subscribers are wired;
      //    it waits for `hello` before showing its full UI.
      case "init":
        later(function () {
          deliver({
            type: "hello",
            protocolVersion: 1,
            sessionId: msg.sessionId || SESSION_ID,
            swatches: [],
            colorChips: [],
            textComponents: [],
            spacingTokens: [],
          });
        });
        break;

      // 2. Edit intent. The override manager has ALREADY applied the visual
      //    change as a CSS rule with !important. We just need to ack it so
      //    the pending-edits tracker doesn't flag it stale at 35s.
      case "edit":
        later(function () {
          deliver({ type: "edit_status", editId: msg.editId, status: "done" });
          deliver({ type: "hmr_verified", editId: msg.editId, match: true });
        });
        break;

      // 3. Undo / redo — no server-side history to roll back; just say done.
      case "undo":
        later(function () {
          deliver({ type: "undo_sync_status", status: "done" });
        });
        break;
      case "redo":
        later(function () {
          deliver({ type: "redo_sync_status", status: "done" });
        });
        break;

      // 4. Staged-edit lifecycle — used by the staging buffer. Ack so the
      //    UI's loading states resolve.
      case "staged-edit-add":
      case "staged-edit-remove":
      case "staged-edit-clear":
      case "staged-edits-sync":
      case "staged-edits-ready":
        later(function () {
          deliver({ type: "staged-edits-acked" });
        });
        break;

      // 5. Annotations (comments). Echo back as `annotation-created` so the
      //    UI's comment pin appears.
      case "comment":
      case "comment-reply":
        later(function () {
          deliver({
            type: "annotation-created",
            id: msg.id || "a-" + Math.random().toString(36).slice(2, 10),
          });
        });
        break;

      // 6. Cortex was closed — silent ack.
      case "cortex-closed":
      case "clear_server_undo":
        break;

      // 7. cortex-rpc requests carry a requestId; respond with a generic
      //    successful result so any in-flight promise resolves.
      case "cortex-rpc":
        if (msg.requestId) {
          later(function () {
            deliver({
              type: "cortex-rpc-result",
              requestId: msg.requestId,
              result: null,
            });
          });
        }
        break;

      // Unhandled types — log so we can decide if they need a response.
      default:
        log("unhandled type:", msg.type);
    }
  }

  // Cortex's createViteChannel() reads window.__cortex_send__ during bootstrap,
  // captures it into closure, then DELETES the property. Our handler stays
  // reachable through that closure even after the global vanishes.
  window.__cortex_send__ = function (msg) {
    try {
      handle(msg);
    } catch (err) {
      if (typeof console !== "undefined") {
        console.warn("[cortex-demo] handler error:", err);
      }
    }
  };

  // Expose a toggle so the user can enable debug logging from devtools:
  //   window.__cortexDemoDebug(true)
  window.__cortexDemoDebug = function (on) {
    DEBUG = !!on;
  };

  // ---- Toggle wiring (replicates what cortex-editor's Vite adapter injects) -
  // In a Vite/Webpack project the adapter's client script attaches the toggle
  // hotkey + writes data-cortex-active. On a static page the adapter doesn't
  // exist — so the stub has to provide it.

  function pushToggle(active) {
    var msg = { type: "cortex-toggle", active: !!active };
    if (window.__cortex_channel__) {
      window.__cortex_channel__.handleServerMessage(msg);
    } else {
      // Channel not ready yet (this can happen during pre-bootstrap toggle).
      // Bootstrap reads __cortex_pending_toggle__ for initial-active state.
      window.__cortex_pending_toggle__ = msg;
    }
  }

  function setActive(active) {
    var html = document.documentElement;
    if (active) html.setAttribute("data-cortex-active", "");
    else html.removeAttribute("data-cortex-active");
    pushToggle(active);
  }

  // Called by the "Try it here" CTA. Trusted-source bypass: directly flip
  // state instead of dispatching a synthetic keystroke (which would fail
  // the adapter-style isTrusted check).
  window.__cortexToggle = function () {
    var isActive = document.documentElement.hasAttribute("data-cortex-active");
    setActive(!isActive);
  };

  // Real keystroke listener — only fires for trusted events. Matches Cortex's
  // default toggle shortcut: $mod+Shift+Period (Cmd on Mac, Ctrl elsewhere).
  if (
    !Object.prototype.hasOwnProperty.call(
      window,
      "__cortex_toggle_registered__",
    )
  ) {
    Object.defineProperty(window, "__cortex_toggle_registered__", {
      value: true,
      writable: false,
      configurable: false,
    });
    window.addEventListener(
      "keydown",
      function (e) {
        if (!e.isTrusted) return;
        var mod = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
          ? e.metaKey
          : e.ctrlKey;
        if (!mod || !e.shiftKey || e.altKey) return;
        if (e.code !== "Period") return;
        e.preventDefault();
        e.stopPropagation();
        window.__cortexToggle();
      },
      { capture: true },
    );
  }
})();
