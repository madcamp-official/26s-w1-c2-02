import { useEffect, useState } from 'react';
import { applyTheme, getStoredTheme, storeTheme, type ThemeId } from './themeManager';

export function useColorTheme() {
  const [theme, setThemeState] = useState<ThemeId>(() => getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function setTheme(next: ThemeId) {
    setThemeState(next);
    storeTheme(next);
  }

  return { theme, setTheme };
}
