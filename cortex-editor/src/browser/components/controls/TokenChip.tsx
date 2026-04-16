import type { JSX } from 'preact'
import { Unlink } from '../icons.js'

export interface TokenChipProps {
  /** CSS variable name, e.g. "--bg-surface". Displayed as-is. */
  tokenName: string
  /** Resolved CSS value — used as the swatch background-color when it
   *  looks like a color. Non-color values get a diagonal stripe pattern. */
  resolvedValue: string
  /** When provided, an unlink button is rendered. Fires on click. */
  onUnlink?: () => void
}

/**
 * Heuristic: returns `true` when `value` looks like a CSS color.
 * Matches hex (#abc, #aabbcc, #aabbccdd), rgb/rgba/hsl/hsla functions,
 * `transparent`, `currentColor`, `var(--…)`, and common named colors.
 * Anything else (e.g. "16px", "1rem", "auto") returns `false`.
 */
const COLOR_RE =
  /^(#[\da-f]{3,8}|rgba?\s*\(|hsla?\s*\(|transparent|currentcolor|var\s*\(--)/i

/** Subset of CSS named colors — not exhaustive, but covers the common ones. */
const NAMED_COLORS = new Set([
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
])

function isColorLike(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return COLOR_RE.test(trimmed) || NAMED_COLORS.has(trimmed)
}

/**
 * Pill-shaped chip displaying a CSS variable name with a color swatch
 * and an optional unlink button. Pure display component — no internal
 * state. Consumed by TypographySection, BackgroundSection, and
 * BorderSection.
 */
export function TokenChip({
  tokenName,
  resolvedValue,
  onUnlink,
}: TokenChipProps): JSX.Element {
  const colorLike = isColorLike(resolvedValue)

  const swatchStyle: Record<string, string> = colorLike
    ? { backgroundColor: resolvedValue }
    : {
        background:
          'repeating-linear-gradient(45deg, var(--cx-ink-ghost) 0, var(--cx-ink-ghost) 2px, transparent 2px, transparent 6px)',
      }

  return (
    <span class="cortex-token-chip">
      <span class="cortex-token-chip__swatch" style={swatchStyle} />
      <span class="cortex-token-chip__name">{tokenName}</span>
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
