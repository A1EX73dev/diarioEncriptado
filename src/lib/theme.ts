/**
 * Preferencia de tema. Se guarda en una cookie no sensible para que el
 * servidor pinte <html data-theme> sin necesidad de un script inline
 * (que la CSP estricta no permitiría sin nonce) y sin parpadeo.
 */
export const THEME_COOKIE = "theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "system";
}
