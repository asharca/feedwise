import { describe, it, expect } from "vitest";
import { mapSmtpError } from "@/lib/email/smtp-error";

describe("mapSmtpError", () => {
  it("returns a generic message for non-Error inputs", () => {
    expect(mapSmtpError("boom")).toBe("Failed to send email: boom");
    expect(mapSmtpError(null)).toBe("Failed to send email");
  });

  it("maps ENETUNREACH to a network guidance message", () => {
    const msg = mapSmtpError(new Error("connect ENETUNREACH 1.2.3.4:587"));
    expect(msg).toMatch(/Cannot connect to SMTP server/);
  });

  it("maps EAUTH to a credentials guidance message", () => {
    const msg = mapSmtpError(new Error("Error: EAUTH bad creds"));
    expect(msg).toMatch(/SMTP authentication failed/);
  });

  it("maps ETIMEDOUT to a timeout message", () => {
    const msg = mapSmtpError(new Error("connect ETIMEDOUT"));
    expect(msg).toMatch(/timed out/);
  });

  it("maps QQ mail's strict-envelope requirement", () => {
    const msg = mapSmtpError(new Error("Mail from address must be same as authorization user"));
    expect(msg).toMatch(/QQ Mail/);
  });

  it("falls back to raw error message for unknown errors", () => {
    const msg = mapSmtpError(new Error("something weird happened"));
    expect(msg).toBe("SMTP Error: something weird happened");
  });
});
