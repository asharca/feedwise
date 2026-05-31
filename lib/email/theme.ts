/**
 * Hex equivalents of the app's CSS-variable theme tokens (light mode).
 * Used by the email templates so the digest looks visually consistent with
 * the in-app dashboard. Email clients largely ignore CSS variables/oklch, so
 * we resolve them to plain hex values here.
 */
export const emailTheme = {
  background: "#ffffff",
  pageBackground: "#f5f5f5",
  foreground: "#1f1f1f",
  mutedForeground: "#6b6b6b",
  border: "#e3e3e3",
  muted: "#f5f5f5",
  accent: "#f0f0f0",
  primary: "#2563eb",
  primarySubtle: "#eff6ff",
  destructive: "#dc2626",
  amber: "#d97706",
} as const;

export const emailFont = {
  family:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Ubuntu,Helvetica,Arial,sans-serif',
} as const;
