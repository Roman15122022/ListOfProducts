import type { ThemePreference } from "../domain/types";

const THEME_PREFERENCE_KEY = "shopping-theme-preference";

export const saveThemePreference = (themePreference: ThemePreference): boolean => {
  try {
    localStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
    return true;
  } catch {
    return false;
  }
};
