import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type Accent = "blue" | "red" | "green";
export type MotionPreference = "full" | "reduced" | "off" | "system";
export type Density = "comfortable" | "compact";
export type SidebarState = "expanded" | "collapsed";
export interface Appearance {
  theme: ThemePreference;
  accent: Accent;
  motion: MotionPreference;
  density: Density;
  sidebar: SidebarState;
}

export const defaultAppearance: Appearance = {
  theme: "system",
  accent: "blue",
  motion: "system",
  density: "comfortable",
  sidebar: "expanded",
};

const options = {
  theme: ["light", "dark", "system"],
  accent: ["blue", "red", "green"],
  motion: ["full", "reduced", "off", "system"],
  density: ["comfortable", "compact"],
  sidebar: ["expanded", "collapsed"],
} as const;

/** The last applied preferences, used for the first paint before sign-in. */
export const LAST_APPEARANCE_KEY = "kit.appearance.last";
/** Earlier releases stored only the theme under this key. Kept in sync. */
const LEGACY_THEME_KEY = "kit.theme";

export function appearanceKey(mode: string, userId?: string | null) {
  return `kit.appearance:${mode}:${userId || "sample"}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Reads saved preferences, ignoring unknown values. */
export function readAppearance(key: string): Appearance {
  const store = storage();
  const result: Appearance = { ...defaultAppearance };
  let saved: Partial<Record<keyof Appearance, unknown>> = {};
  try {
    saved = JSON.parse(store?.getItem(key) || "{}") ?? {};
  } catch {
    saved = {};
  }
  const legacy = store?.getItem(LEGACY_THEME_KEY);
  if (!saved.theme && legacy) saved.theme = legacy;
  for (const field of Object.keys(options) as (keyof Appearance)[]) {
    const value = saved[field];
    if ((options[field] as readonly unknown[]).includes(value))
      (result as unknown as Record<string, unknown>)[field] = value;
  }
  return result;
}

const media = (query: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(query)
    : null;

export function resolveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme !== "system") return theme;
  return media("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function resolveMotion(
  motion: MotionPreference,
): "full" | "reduced" | "off" {
  if (motion !== "system") return motion;
  return media("(prefers-reduced-motion: reduce)")?.matches
    ? "reduced"
    : "full";
}

/**
 * Writes the resolved attributes on <html>. Color changes never animate:
 * transitions are paused for two frames while the theme or accent switches.
 */
export function applyAppearance(
  appearance: Appearance,
  root: HTMLElement = document.documentElement,
) {
  const theme = resolveTheme(appearance.theme);
  const changing =
    root.dataset.theme !== theme || root.dataset.accent !== appearance.accent;
  if (changing && typeof requestAnimationFrame === "function") {
    root.classList.add("appearance-switching");
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        root.classList.remove("appearance-switching"),
      ),
    );
  }
  root.dataset.theme = theme;
  root.dataset.accent = appearance.accent;
  root.dataset.motion = resolveMotion(appearance.motion);
  root.dataset.density = appearance.density;
}

/** The preferences to paint before React starts. */
export function initialAppearance(): Appearance {
  try {
    // The demo has a single, known profile; company users use the last one.
    if (localStorage.getItem("kit.mode") === "sample")
      return readAppearance(appearanceKey("sample", null));
  } catch {
    /* Fall back to the last applied preferences. */
  }
  return readAppearance(LAST_APPEARANCE_KEY);
}

export interface AppearanceState {
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
}

export const AppearanceContext = createContext<AppearanceState | null>(null);

/** Owns the per-user preferences for one workspace mode and user. */
export function useAppearanceState(
  mode: string,
  userId?: string | null,
): AppearanceState {
  const key = appearanceKey(mode, userId);
  const [state, setState] = useState(() => ({
    key,
    appearance: readAppearance(key),
  }));
  // Switching user or mode loads that person's saved preferences.
  const appearance = state.key === key ? state.appearance : readAppearance(key);
  useEffect(() => {
    if (state.key !== key) setState({ key, appearance: readAppearance(key) });
  }, [key, state.key]);
  useEffect(() => {
    applyAppearance(appearance);
    const store = storage();
    try {
      store?.setItem(LAST_APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* Preferences still apply for this session. */
    }
    if (appearance.theme !== "system" && appearance.motion !== "system") return;
    const scheme = media("(prefers-color-scheme: dark)");
    const motion = media("(prefers-reduced-motion: reduce)");
    const follow = () => applyAppearance(appearance);
    scheme?.addEventListener("change", follow);
    motion?.addEventListener("change", follow);
    return () => {
      scheme?.removeEventListener("change", follow);
      motion?.removeEventListener("change", follow);
    };
  }, [appearance]);
  const setAppearance = useCallback(
    (patch: Partial<Appearance>) =>
      setState((current) => {
        const base =
          current.key === key ? current.appearance : readAppearance(key);
        const next = { ...base, ...patch };
        const store = storage();
        try {
          store?.setItem(key, JSON.stringify(next));
          store?.setItem(LEGACY_THEME_KEY, next.theme);
        } catch {
          /* Keep the change for this session even if storage is blocked. */
        }
        return { key, appearance: next };
      }),
    [key],
  );
  return useMemo(
    () => ({ appearance, setAppearance }),
    [appearance, setAppearance],
  );
}

export function useAppearance(): AppearanceState {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("AppearanceContext is missing.");
  return context;
}
