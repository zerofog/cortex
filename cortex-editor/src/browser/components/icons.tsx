/**
 * Central Lucide-icon module for the Panel v2 editor surface.
 *
 * Every icon in this file is a Preact component that renders an inline `<svg>`
 * with stroke-based paths copied verbatim from the MIT-licensed Lucide icon
 * set (https://lucide.dev). Sources are documented per-icon with a URL comment
 * so a rename or path-update upstream can be verified in one hop.
 *
 * Created by Task 3 (ZF0-1181) with the icons AppearanceSection needed.
 * Task 4 (ZF0-1182) extended this file with the full Panel v2 inventory
 * covering section icons,
 * control icons, and toolbar glyphs consumed by Tasks 5-16. Deliberately no
 * default export — named exports keep tree-shaking honest and make the
 * "add another icon" diff trivial. Snapshot tests in
 * tests/browser/components/icons.test.tsx lock every rendered SVG so lucide
 * upstream drift shows up with a clear per-icon diff.
 *
 * All icons:
 *  - accept an optional `size` prop (default 16) driving both width and height
 *  - accept an optional `class` prop (Preact uses `class`, not `className`)
 *  - render `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ...>`
 *    so color follows the surrounding CSS `color` and sizes scale via the
 *    single `size` knob — no per-icon fill overrides
 */
import type { JSX } from 'preact'

export interface IconProps {
  size?: number
  class?: string
}

// Common SVG attributes shared by every Lucide icon. Preact uses kebab-case
// for SVG presentation attributes; TypeScript's JSX namespace accepts both,
// but keeping them kebab-cased matches existing Toolbar.tsx conventions.
const BASE_SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
}

function svgProps(size: number, cls?: string): JSX.SVGAttributes<SVGSVGElement> {
  return {
    ...BASE_SVG_PROPS,
    width: size,
    height: size,
    class: cls,
    'aria-hidden': 'true',
  }
}

// source: https://lucide.dev/icons/eye
export function Eye({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// source: https://lucide.dev/icons/eye-off
export function EyeOff({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/eye-closed
export function EyeClosed({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m15 18-.722-3.25" />
      <path d="M2 8a10.645 10.645 0 0 0 20 0" />
      <path d="m20 15-1.726-2.05" />
      <path d="m4 15 1.726-2.05" />
      <path d="m9 18 .722-3.25" />
    </svg>
  )
}

// source: https://lucide.dev/icons/eclipse
// Used as the opacity-control prefix icon on AppearanceSection. Circle with an
// inner crescent reads as "partial light / transparency" — replaces the
// earlier `Contrast` glyph (half-filled hemisphere).
export function Eclipse({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a7 7 0 1 0 10 10" />
    </svg>
  )
}

// ── Per-corner indicator icons (hand-written, Lucide-style) ────────────────
// Single L-bracket at the respective corner, stroke geometry lifted from
// `Maximize` so the 4 icons visually harmonize with the corner-toggle glyph.
// Used as NumericInput prefixes on the Appearance per-corner radius inputs,
// replacing the earlier "TL" / "TR" / "BR" / "BL" text labels.

export function CornerTopLeft({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    </svg>
  )
}

export function CornerTopRight({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    </svg>
  )
}

export function CornerBottomRight({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export function CornerBottomLeft({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  )
}

// source: https://lucide.dev/icons/square-dashed
// Used as the "per-corner expand" affordance on the AppearanceSection radius
// control. A dashed square reads as "this is the bounding box — click to edit
// corners individually"; the existing BorderSection used a custom 4-corner SVG
// with the same intent, but SquareDashed is the Lucide canonical equivalent.
export function SquareDashed({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M5 3a2 2 0 0 0-2 2" />
      <path d="M19 3a2 2 0 0 1 2 2" />
      <path d="M21 19a2 2 0 0 1-2 2" />
      <path d="M5 21a2 2 0 0 1-2-2" />
      <path d="M9 3h1" />
      <path d="M9 21h1" />
      <path d="M14 3h1" />
      <path d="M14 21h1" />
      <path d="M3 9v1" />
      <path d="M21 9v1" />
      <path d="M3 14v1" />
      <path d="M21 14v1" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Task 4 (ZF0-1182) inventory — icons consumed by Panel v2 Tasks 5-16.
// Each path is verbatim from lucide.dev (MIT). Do NOT simplify or reorder
// shape elements: snapshot tests lock the rendered HTML so any drift is
// caught at CI time. When a section lands its implementation, grep
// `<IconName` in that section's .tsx to verify the import path.
// ─────────────────────────────────────────────────────────────────────────

// Position section (Task 5) ────────────────────────────────────────────────

// source: https://lucide.dev/icons/square
export function Square({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </svg>
  )
}

// source: https://lucide.dev/icons/move-diagonal
export function MoveDiagonal({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M11 19H5v-6" />
      <path d="M13 5h6v6" />
      <path d="M19 5 5 19" />
    </svg>
  )
}

// source: https://lucide.dev/icons/maximize
export function Maximize({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

// source: https://lucide.dev/icons/pin
export function Pin({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

// source: https://lucide.dev/icons/paperclip
export function Paperclip({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </svg>
  )
}

// Self-alignment (Task 6) ──────────────────────────────────────────────────

// source: https://lucide.dev/icons/align-horizontal-justify-start
export function AlignHorizontalJustifyStart({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="6" height="14" x="6" y="5" rx="2" />
      <rect width="6" height="10" x="16" y="7" rx="2" />
      <path d="M2 2v20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-horizontal-justify-center
export function AlignHorizontalJustifyCenter({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="6" height="14" x="2" y="5" rx="2" />
      <rect width="6" height="10" x="16" y="7" rx="2" />
      <path d="M12 2v20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-horizontal-justify-end
export function AlignHorizontalJustifyEnd({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="6" height="14" x="2" y="5" rx="2" />
      <rect width="6" height="10" x="12" y="7" rx="2" />
      <path d="M22 2v20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-vertical-justify-start
export function AlignVerticalJustifyStart({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="14" height="6" x="5" y="16" rx="2" />
      <rect width="10" height="6" x="7" y="6" rx="2" />
      <path d="M2 2h20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-vertical-justify-center
export function AlignVerticalJustifyCenter({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="14" height="6" x="5" y="16" rx="2" />
      <rect width="10" height="6" x="7" y="2" rx="2" />
      <path d="M2 12h20" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-vertical-justify-end
export function AlignVerticalJustifyEnd({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="14" height="6" x="5" y="12" rx="2" />
      <rect width="10" height="6" x="7" y="2" rx="2" />
      <path d="M2 22h20" />
    </svg>
  )
}

// Transforms (Task 6) ──────────────────────────────────────────────────────

// source: https://lucide.dev/icons/rotate-cw
export function RotateCw({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}

// source: https://lucide.dev/icons/flip-horizontal
export function FlipHorizontal({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
      <path d="M12 20v2" />
      <path d="M12 14v2" />
      <path d="M12 8v2" />
      <path d="M12 2v2" />
    </svg>
  )
}

// source: https://lucide.dev/icons/flip-vertical
export function FlipVertical({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
      <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
      <path d="M4 12H2" />
      <path d="M10 12H8" />
      <path d="M16 12h-2" />
      <path d="M22 12h-2" />
    </svg>
  )
}

// Flex direction (Task 8) ──────────────────────────────────────────────────

// source: https://lucide.dev/icons/arrow-right
export function ArrowRight({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

// source: https://lucide.dev/icons/arrow-left
export function ArrowLeft({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  )
}

// source: https://lucide.dev/icons/arrow-down
export function ArrowDown({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  )
}

// source: https://lucide.dev/icons/arrow-up
export function ArrowUp({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  )
}

// Spacing (Task 10) ────────────────────────────────────────────────────────

// source: https://lucide.dev/icons/move-horizontal
export function MoveHorizontal({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m18 8 4 4-4 4" />
      <path d="M2 12h20" />
      <path d="m6 8-4 4 4 4" />
    </svg>
  )
}

// source: https://lucide.dev/icons/move-vertical
export function MoveVertical({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M12 2v20" />
      <path d="m8 18 4 4 4-4" />
      <path d="m8 6 4-4 4 4" />
    </svg>
  )
}

// Token + common (Tasks 11-16) ─────────────────────────────────────────────

// source: https://lucide.dev/icons/unlink
export function Unlink({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" x2="8" y1="2" y2="5" />
      <line x1="2" x2="5" y1="8" y2="8" />
      <line x1="16" x2="16" y1="19" y2="22" />
      <line x1="19" x2="22" y1="16" y2="16" />
    </svg>
  )
}

// source: https://lucide.dev/icons/plus
export function Plus({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  )
}

// source: https://lucide.dev/icons/minus
export function Minus({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M5 12h14" />
    </svg>
  )
}

// source: https://lucide.dev/icons/check
export function Check({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

// source: https://lucide.dev/icons/chevron-down
export function ChevronDown({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

// source: https://lucide.dev/icons/chevron-right
export function ChevronRight({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

// Grid (Task 9) ────────────────────────────────────────────────────────────

// source: https://lucide.dev/icons/layout-grid
export function LayoutGrid({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

// source: https://lucide.dev/icons/gallery-horizontal-end
export function GalleryHorizontalEnd({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M2 7v10" />
      <path d="M6 5v14" />
      <rect width="12" height="18" x="10" y="3" rx="2" />
    </svg>
  )
}

// source: https://lucide.dev/icons/gallery-vertical-end
export function GalleryVerticalEnd({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M7 2h10" />
      <path d="M5 6h14" />
      <rect width="18" height="12" x="3" y="10" rx="2" />
    </svg>
  )
}

// Text align (Task 12) ─────────────────────────────────────────────────────

// source: https://lucide.dev/icons/align-left
export function AlignLeft({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 5H3" />
      <path d="M15 12H3" />
      <path d="M17 19H3" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-center
export function AlignCenter({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 5H3" />
      <path d="M17 12H7" />
      <path d="M19 19H5" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-right
export function AlignRight({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M21 5H3" />
      <path d="M21 12H9" />
      <path d="M21 19H7" />
    </svg>
  )
}

// source: https://lucide.dev/icons/align-justify
export function AlignJustify({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M3 5h18" />
      <path d="M3 12h18" />
      <path d="M3 19h18" />
    </svg>
  )
}

// Lock / Unlock (spacing axis link) ───────────────────────────────────────

// source: https://lucide.dev/icons/lock
export function Lock({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

// source: https://lucide.dev/icons/lock-open
export function LockOpen({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

// Misc (Task 12 — Typography T toggle) ────────────────────────────────────

// source: https://lucide.dev/icons/type
export function Type({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <path d="M12 4v16" />
      <path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2" />
      <path d="M9 20h6" />
    </svg>
  )
}
