export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'cortex-theme-preference'

let _onPreferenceChange: (() => void) | null = null

export function _registerPreferenceChangeHandler(handler: () => void): void {
  _onPreferenceChange = handler
}

export function _clearPreferenceChangeHandler(): void {
  _onPreferenceChange = null
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch { /* localStorage unavailable */ }
  return 'system'
}

export function setThemePreference(pref: ThemePreference): void {
  try { localStorage.setItem(THEME_STORAGE_KEY, pref) } catch { /* ignore */ }
  _onPreferenceChange?.()
}
