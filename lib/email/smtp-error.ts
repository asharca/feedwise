export function mapSmtpError(err: unknown): string {
  if (!(err instanceof Error)) {
    return typeof err === "string" ? `Failed to send email: ${err}` : "Failed to send email";
  }
  const m = err.message;
  if (m.includes("ENETUNREACH")) {
    return "Cannot connect to SMTP server. Please check your SMTP host and port settings.";
  }
  if (m.includes("EAUTH")) {
    return "SMTP authentication failed. Please check your username and password.";
  }
  if (m.includes("Mail from address must be same as authorization user")) {
    return "QQ Mail requires the sender address to match the SMTP username. Please set both to the same QQ email address.";
  }
  if (m.includes("ETIMEDOUT")) {
    return "SMTP connection timed out. Please check your SMTP server settings.";
  }
  return `SMTP Error: ${m}`;
}
