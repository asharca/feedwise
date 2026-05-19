import { assertKeyConfigured } from "./secrets";

/**
 * Call once at process entry (web server boot, worker boot).
 * Fail-fast: throws synchronously if ENCRYPTION_KEY missing or wrong size.
 */
export function ensureEncryptionConfigured(): void {
  try {
    assertKeyConfigured();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] FATAL: ${msg}`);
    throw err;
  }
}
