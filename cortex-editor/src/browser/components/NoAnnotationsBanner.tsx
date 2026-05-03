import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { X } from './icons.js'

const SETUP_DOCS_URL = 'https://github.com/zerofog/cortex#setup'

function hasAnnotation(): boolean {
  return document.querySelector('[data-cortex-source]') !== null
}

export function NoAnnotationsBanner(): JSX.Element | null {
  const [dismissed, setDismissed] = useState(false)
  const [hidden, setHidden] = useState(() => hasAnnotation())
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Once annotations exist (or banner was dismissed) we never need the
    // observer again — banner stays hidden for the rest of its lifetime.
    if (hidden || dismissed) return

    const observer = new MutationObserver(() => {
      if (hasAnnotation()) setHidden(true)
    })
    // childList only — `data-cortex-source` is set at JSX-element-creation
    // by the Vite plugin transform, never as a later attribute mutation. Dropping
    // attribute observation halves the callback volume on busy SPAs during the
    // window where the banner is visible (the only time the observer is attached).
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [hidden, dismissed])

  // Push host page content + cortex's own UI down by the banner's height
  // while visible, so the banner doesn't overlap either surface. Two
  // mutations:
  //   - documentElement.paddingTop  → pushes the user's app down
  //   - --cx-banner-height variable → consumed by CortexApp's transform
  //     wrapper, which becomes a containing block for fixed-positioned
  //     descendants (toolbar, overlays, panel) and shifts them down too.
  // Measured (not hardcoded) because the description text wraps on narrow
  // viewports. Restored on unmount/hide/dismiss.
  useEffect(() => {
    if (hidden || dismissed) return
    const banner = bannerRef.current
    if (!banner) return
    const root = document.documentElement
    const prevPadding = root.style.paddingTop
    const prevTransition = root.style.transition
    const prevHeightVar = root.style.getPropertyValue('--cx-banner-height')
    const prevTransformVar = root.style.getPropertyValue('--cx-banner-transform')
    const px = `${banner.getBoundingClientRect().height}px`
    // Smooth the show/hide transition so dismiss doesn't visually jump.
    // 200ms layout transition is acceptable for a one-shot banner event;
    // not on the per-frame hot path.
    //
    // Trade-off: while the banner is visible, this inline `transition` on
    // documentElement DOES clobber any host-page stylesheet rule that sets
    // `transition` on the `<html>` element (CSS cascade: inline > stylesheet).
    // Most pages don't transition documentElement properties; if a host page
    // does, those transitions are suppressed for the lifetime of the banner.
    // Restored on dismiss/unmount.
    root.style.transition = 'padding-top 200ms ease-out'
    root.style.paddingTop = px
    root.style.setProperty('--cx-banner-height', px)
    // Set the transform expression that CortexApp's wrapper consumes. We
    // publish this as a SEPARATE variable from --cx-banner-height because
    // when the banner is hidden, the wrapper must read `transform: none`
    // (not `translateY(0px)`) — `translateY(0px)` still creates a CSS
    // containing block for `position: fixed` descendants per spec, which
    // changes how cortex's panel/overlays resolve and produces flaky
    // intra-file test pollution in cortex-app.test.tsx. Setting this only
    // when banner is visible means wrapper falls back to `none` otherwise.
    root.style.setProperty('--cx-banner-transform', `translateY(${px})`)
    return () => {
      root.style.paddingTop = prevPadding
      root.style.transition = prevTransition
      if (prevHeightVar) root.style.setProperty('--cx-banner-height', prevHeightVar)
      else root.style.removeProperty('--cx-banner-height')
      if (prevTransformVar) root.style.setProperty('--cx-banner-transform', prevTransformVar)
      else root.style.removeProperty('--cx-banner-transform')
    }
  }, [hidden, dismissed])

  if (hidden || dismissed) return null

  return (
    <div
      ref={bannerRef}
      data-banner-id="no-annotations"
      class="cortex-no-annotations-banner"
      role="alert"
      aria-live="assertive"
    >
      <div class="cortex-no-annotations-banner__body">
        <span class="cortex-no-annotations-banner__title">
          No editable elements detected
        </span>
        <span class="cortex-no-annotations-banner__desc">
          Cortex needs the Vite plugin to add source annotations to your components.{' '}
          <a
            href={SETUP_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="cortex-no-annotations-banner__link"
          >
            Setup guide
          </a>
        </span>
      </div>
      <button
        type="button"
        class="cortex-no-annotations-banner__dismiss"
        aria-label="Dismiss"
        onClick={(e) => {
          // selection.ts opts out of intercepting cortex-UI clicks (isOwnUI
          // early-return), so without stopPropagation this dismiss click would
          // bubble to any window/document handler the host app installed.
          e.stopPropagation()
          setDismissed(true)
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}
