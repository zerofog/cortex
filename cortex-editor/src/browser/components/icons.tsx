/**
 * Central Lucide-icon module for the Panel v2 editor surface.
 *
 * Every icon in this file is a Preact component that renders an inline `<svg>`
 * with stroke-based paths copied verbatim from the MIT-licensed Lucide icon
 * set (https://lucide.dev). Sources are documented per-icon with a URL comment
 * so a rename or path-update upstream can be verified in one hop.
 *
 * Created by Task 3 (ZF0-1181) with the minimum icons AppearanceSection needs.
 * Task 4 (ZF0-1182) will extend this file with the rest of the Panel v2
 * iconography (section-icons, control icons, toolbar glyphs). Deliberately no
 * default export — named exports keep tree-shaking honest and make the
 * "add another icon" diff trivial.
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

// source: https://lucide.dev/icons/blend
export function Blend({ size = 16, class: cls }: IconProps = {}): JSX.Element {
  return (
    <svg {...svgProps(size, cls)}>
      <circle cx="9" cy="9" r="7" />
      <circle cx="15" cy="15" r="7" />
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
