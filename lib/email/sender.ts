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

export interface EmailArticle {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  feedTitle: string | null;
  publishedAt: Date | null;
}

export interface DailyDigestEmail {
  to: string;
  subject: string;
  articles: EmailArticle[];
  smtpConfig?: SMTPConfig | null;
}

export async function sendDailyDigest(email: DailyDigestEmail): Promise<void> {
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

  const articlesHtml = email.articles
    .map(
      (a) => `
      <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
        <h3 style="margin: 0 0 8px 0;">
          <a href="${a.url}" style="color: #2563eb; text-decoration: none;">${a.title}</a>
        </h3>
        <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
          ${a.feedTitle} · ${a.publishedAt ? formatDate(a.publishedAt) : ""}
        </p>
        ${a.summary ? `<p style="margin: 0; color: #444; font-size: 14px; line-height: 1.5;">${limitEmailImageSize(a.summary)}</p>` : ""}
      </div>
    `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <tr>
                <td style="padding: 20px 30px; background-color: #1e293b; color: #ffffff;">
                  <h1 style="margin: 0; font-size: 24px; font-weight: 600;">📰 Today's Feedwise Digest</h1>
                </td>
              </tr>
              <tr>
                <td style="padding: 30px;">
                  ${email.articles.length > 0 ? articlesHtml : '<p style="color: #666;">No articles today. Happy reading!</p>'}
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
                    You're receiving this because you subscribed to Feedwise daily digest.
                    <a href="#" style="color: #2563eb;">Manage preferences</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from,
    ...(useStrictFrom && smtpUser.includes("@")
      ? { envelope: { from: smtpUser, to: email.to } }
      : {}),
    to: email.to,
    subject: email.subject,
    html,
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

function limitEmailImageSize(html: string): string {
  const imageStyle = "max-width:100%;width:auto;height:auto;max-height:280px;object-fit:contain;display:block;border-radius:8px;margin:8px 0;";
  return html.replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => {
    const styleMatch = attrs.match(/\sstyle\s*=\s*(['"])(.*?)\1/i);
    if (styleMatch) {
      const mergedStyle = `${styleMatch[2].trim().replace(/;?$/, ";")} ${imageStyle}`;
      const updatedAttrs = attrs.replace(styleMatch[0], ` style="${mergedStyle}"`);
      return `<img${updatedAttrs}>`;
    }
    return `<img${attrs} style="${imageStyle}">`;
  });
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
