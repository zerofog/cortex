import type { JSX, RefObject } from 'preact'
import { Unlink } from '../icons.js'

export type TokenChipSwatch = { kind: 'color'; value: string } | { kind: 'pattern' }

export interface TokenChipProps {
  /** Display text for the pill body (e.g. `--bg-surface`, `body-md`, `text-gray-900`). */
  tokenName: string
  /**
   * Optional leading swatch. `color` renders a filled square from `value`;
   * `pattern` renders a diagonal stripe for non-color values (spacing, size).
   * Omit for text-only pills like TextComponentPill.
   */
  swatch?: TokenChipSwatch
  /**
   * When provided, the body becomes a clickable <button>. When omitted, the
   * body renders as a plain <span> — a button that does nothing is an a11y
   * trap, so absence of a handler is load-bearing here.
   */
  onBodyClick?: () => void
  /** When provided, an unlink button is rendered on the trailing edge. */
  onUnlink?: () => void
  /** Accessible label for the body button. Defaults to the tokenName. */
  ariaLabel?: string
  /** Attach a ref to the body element. Used by Typography v2 so a popover
   *  opened by clicking the pill body can exempt the body from its
   *  outside-dismiss boundary (prevents mousedown-dismiss /
   *  click-reopen race when re-clicking the pill to close). */
  bodyRef?: RefObject<HTMLButtonElement>
}

/** Diagonal-stripe background for non-color values (e.g. spacing, sizes). */
const PATTERN_BG =
  'repeating-linear-gradient(45deg, var(--cx-ink-ghost) 0, var(--cx-ink-ghost) 2px, transparent 2px, transparent 6px)'

/**
 * Pill-shaped chip with an optional leading swatch, clickable body, and
 * trailing unlink button. Pure display component — no internal state.
 *
 * Consumed by BackgroundSection, BorderSection, TypographySection, and
 * (via TextComponentPill/ColorChipPill) the new Typography v2 linked rows.
 */
export function TokenChip({
  tokenName,
  swatch,
  onBodyClick,
  onUnlink,
  ariaLabel,
  bodyRef,
}: TokenChipProps): JSX.Element {
  const swatchEl =
    swatch === undefined ? null : swatch.kind === 'color' ? (
      <span class="cortex-token-chip__swatch" style={{ backgroundColor: swatch.value }} />
    ) : (
      <span class="cortex-token-chip__swatch" style={{ background: PATTERN_BG }} />
    )

  const bodyChildren = (
    <>
      {swatchEl}
      <span class="cortex-token-chip__name">{tokenName}</span>
    </>
  )

  const body = onBodyClick ? (
    <button
      ref={bodyRef}
      type="button"
      class="cortex-token-chip__body"
      onClick={onBodyClick}
      aria-label={ariaLabel ?? tokenName}
    >
      {bodyChildren}
    </button>
  ) : (
    <span class="cortex-token-chip__body">{bodyChildren}</span>
  )

  return (
    <span class="cortex-token-chip">
      {body}
      {onUnlink && (
        <button
          type="button"
          class="cortex-token-chip__unlink"
          aria-label="Detach token"
          onClick={onUnlink}
        >
          <Unlink size={14} />
        </button>
      )}
    </span>
  )
}

/** Subset of CSS named colors — common ones only, kept in sync with browser keywords. */
const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'green', 'greenyellow', 'grey', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen', 'magenta',
  'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen',
  'mediumslateblue', 'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab',
  'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise',
  'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple',
  'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown',
  'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
  'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise',
  'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
])

const COLOR_RE = /^(#[\da-f]{3,8}|rgba?\s*\(|hsla?\s*\(|transparent|currentcolor|var\s*\(--)/i

/**
 * Heuristic: returns `true` when `value` looks like a CSS color.
 *
 * Matches hex (#abc, #aabbcc, #aabbccdd), rgb/rgba/hsl/hsla, `transparent`,
 * `currentColor`, `var(--…)`, and common named colors. Anything else
 * (e.g. "16px", "1rem", "auto") returns `false`.
 *
 * Callers use this to decide the `swatch` kind before rendering a TokenChip.
 */
export function isColorLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return COLOR_RE.test(trimmed) || NAMED_COLORS.has(trimmed)
}
