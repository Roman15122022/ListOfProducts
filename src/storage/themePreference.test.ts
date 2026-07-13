import { afterEach, describe, expect, it, vi } from "vitest";

import { saveThemePreference } from "./themePreference";

describe("theme preference storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a supported preference", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });

    expect(saveThemePreference("dark")).toBe(true);
    expect(setItem).toHaveBeenCalledWith("shopping-theme-preference", "dark");
  });

  it("fails gracefully when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("Storage is blocked", "SecurityError");
      },
    });

    expect(saveThemePreference("light")).toBe(false);
  });
});
