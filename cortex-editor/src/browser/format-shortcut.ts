// src/browser/format-shortcut.ts
const isMac = typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const MODIFIER_DISPLAY: Record<string, string> = isMac
  ? { '$mod': '\u2318', 'Shift': '\u21E7', 'Alt': '\u2325' }
  : { '$mod': 'Ctrl', 'Shift': 'Shift', 'Alt': 'Alt' }

const KEY_DISPLAY: Record<string, string> = {
  Period: '.', Comma: ',', Slash: '/', Minus: '-', Equal: '=',
}

export function formatShortcut(binding: string): string {
  const parts = binding.split('+')
  return parts
    .map(p => MODIFIER_DISPLAY[p] ?? KEY_DISPLAY[p] ?? p.replace('Key', ''))
    .join(isMac ? '' : '+')
}
