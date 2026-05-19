/**
 * One-time idempotent migration: encrypt smtp_pass + email_api_key + llm_api_key
 * for any rows storing plaintext (no v1: prefix). Safe to re-run.
 *
 * Usage: pnpm tsx --env-file=.env drizzle/scripts/encrypt-existing-secrets.ts
 */
import { ensureEncryptionConfigured } from "@/lib/crypto/startup-check";
ensureEncryptionConfigured();

import { db } from "@/lib/db";
import { emailSubscriptions } from "@/lib/db/schema";
import { encryptSecret, isEncrypted } from "@/lib/crypto/secrets";
import { eq } from "drizzle-orm";

async function main() {
  const rows = await db
    .select({
      id: emailSubscriptions.id,
      smtpPass: emailSubscriptions.smtpPass,
      emailApiKey: emailSubscriptions.emailApiKey,
      llmApiKey: emailSubscriptions.llmApiKey,
    })
    .from(emailSubscriptions);

  let updated = 0;
  for (const row of rows) {
    const update: Partial<{ smtpPass: string; emailApiKey: string; llmApiKey: string }> = {};
    if (row.smtpPass && !isEncrypted(row.smtpPass)) {
      update.smtpPass = encryptSecret(row.smtpPass);
    }
    if (row.emailApiKey && !isEncrypted(row.emailApiKey)) {
      update.emailApiKey = encryptSecret(row.emailApiKey);
    }
    if (row.llmApiKey && !isEncrypted(row.llmApiKey)) {
      update.llmApiKey = encryptSecret(row.llmApiKey);
    }
    if (Object.keys(update).length > 0) {
      await db.update(emailSubscriptions).set(update).where(eq(emailSubscriptions.id, row.id));
      updated++;
    }
  }

  console.log(`[encrypt-existing-secrets] scanned ${rows.length} rows, encrypted ${updated}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[encrypt-existing-secrets] failed:", err);
  process.exit(1);
});
