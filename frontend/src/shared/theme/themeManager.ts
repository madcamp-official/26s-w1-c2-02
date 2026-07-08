// Modeled on soundManager.ts, but the theme choice is persisted — unlike BGM,
// there's no autoplay-policy reason to forget it across a reload.

export type ThemeHue = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'navy' | 'purple';
export type ThemeTone = 'normal' | 'pastel';

export const THEME_IDS = [
  'red-normal',
  'red-pastel',
  'orange-normal',
  'orange-pastel',
  'yellow-normal',
  'yellow-pastel',
  'green-normal',
  'green-pastel',
  'blue-normal',
  'blue-pastel',
  'navy-normal',
  'navy-pastel',
  'purple-normal',
  'purple-pastel'
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = 'purple-normal';

const STORAGE_KEY = 'wakppuball.colorTheme';

function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

export function getStoredTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && isThemeId(stored)) {
    return stored;
  }
  return DEFAULT_THEME;
}

export function storeTheme(theme: ThemeId) {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
}
