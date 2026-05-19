export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureEncryptionConfigured } = await import("@/lib/crypto/startup-check");
    ensureEncryptionConfigured();
  }
}
