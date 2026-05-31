import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function getEmailTransporter(userSmtp?: SMTPConfig | null): Transporter {
  const host = userSmtp?.host || process.env.SMTP_HOST;
  const port = userSmtp?.port || parseInt(process.env.SMTP_PORT || "587");
  const user = userSmtp?.user || process.env.SMTP_USER;
  const pass = userSmtp?.pass || process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (!userSmtp) {
      console.warn("Email not configured. SMTP_HOST, SMTP_USER, SMTP_PASS required.");
    }
    // Return a mock transporter that doesn't send emails
    return {
      sendMail: async () => {
        console.log("Email not configured - would send email");
        return { messageId: "mock" };
      }
    } as unknown as Transporter;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
    // Add connection timeout
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
}

export function getUserSMTPConfig(userId: string): SMTPConfig | null {
  // This function is deprecated, use getUserSMTPConfig from queries.ts instead
  return null;
}

export interface EmailArticleTag {
  id: string;
  name: string;
}

export interface EmailArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  /** LLM-generated summary; when null the article is excluded from digests. */
  aiSummary: string | null;
  importance: "high" | "med" | "low" | null;
  feedTitle: string | null;
  feedId: string;
  publishedAt: Date | null;
  tags: EmailArticleTag[];
}

export interface DailyDigestSend {
  to: string;
  subject: string;
  html: string;
  smtpConfig?: SMTPConfig | null;
}

export async function sendDailyDigest(email: DailyDigestSend): Promise<void> {
  const transporter = getEmailTransporter(email.smtpConfig);
  const smtpUser = email.smtpConfig?.user || process.env.SMTP_USER || "";
  const useStrictFrom = requiresStrictEnvelopeFrom(smtpUser);
  const from = useStrictFrom
    ? smtpUser
    : normalizeFromAddress(
        email.smtpConfig?.from || process.env.SMTP_FROM,
        smtpUser,
        "Feedwise <noreply@feedwise.app>"
      );

  await transporter.sendMail({
    from,
    ...(useStrictFrom && smtpUser.includes("@")
      ? { envelope: { from: smtpUser, to: email.to } }
      : {}),
    to: email.to,
    subject: email.subject,
    html: email.html,
  });
}

function requiresStrictEnvelopeFrom(smtpUser: string): boolean {
  if (!smtpUser.includes("@")) return false;
  const domain = smtpUser.split("@")[1]?.toLowerCase();
  return domain === "qq.com" || domain === "foxmail.com";
}

function normalizeFromAddress(
  fromInput: string | undefined,
  smtpUser: string,
  fallback: string
): string {
  if (!fromInput || fromInput.trim().length === 0) {
    return fallback;
  }

  const value = fromInput.trim();
  if (value.includes("<") && value.includes(">")) {
    return value;
  }

  // If input already looks like an email address, use it directly.
  if (value.includes("@")) {
    return value;
  }

  // Support "From Name" only input by constructing a valid mailbox.
  if (smtpUser && smtpUser.includes("@")) {
    return `${value} <${smtpUser}>`;
  }

  return fallback;
}

