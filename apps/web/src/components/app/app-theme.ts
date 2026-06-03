import type { ThemeMode } from './app-types'

export const themeStorageKey = 'patchlane-theme'
export const themeModes = ['light', 'dark', 'system'] satisfies ThemeMode[]

export const getStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const stored = window.localStorage.getItem(themeStorageKey)

  return themeModes.includes(stored as ThemeMode)
    ? (stored as ThemeMode)
    : 'system'
}

export const getNextThemeMode = (mode: ThemeMode): ThemeMode => {
  if (mode === 'light') {
    return 'dark'
  }

  if (mode === 'dark') {
    return 'system'
  }

  return 'light'
}

const getSystemPrefersDark = () => {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export const getInitialSupervisorChatOpen = () => {
  if (typeof window === 'undefined') {
    return true
  }

  return window.matchMedia('(min-width: 1280px)').matches
}

export const applyThemeMode = (mode: ThemeMode) => {
  const shouldUseDark =
    mode === 'dark' || (mode === 'system' && getSystemPrefersDark())

  document.documentElement.classList.toggle('dark', shouldUseDark)
  document.documentElement.dataset.theme = mode
}

