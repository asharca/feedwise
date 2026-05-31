import type { DigestArticle } from "@/lib/digest/types";
import { signClickToken } from "@/lib/email/click-token";

export type LinkFn = (article: DigestArticle) => string;

interface ClickBehavior {
  markReadOnClick?: boolean | null;
  autoSaveOnClick?: boolean | null;
}

/**
 * Pick the `href` builder for digest emails. If we have a public app URL AND
 * the user wants ANY click-time side-effect (mark-read or star), links go
 * through `/api/r?t=<signed token>` so the redirect handler can update the
 * article state on click. Otherwise the link is the article's raw URL.
 *
 * Both the daily digest worker and the "Send Test Email" route use this so
 * test sends honor the same click-behaviour settings as real sends.
 */
export function buildEmailLinkFn(
  userId: string,
  appUrl: string | undefined | null,
  behavior: ClickBehavior
): LinkFn {
  const cleanAppUrl = (appUrl ?? "").replace(/\/$/, "");
  // markReadOnClick defaults to true, autoSaveOnClick defaults to false.
  const markRead = behavior.markReadOnClick ?? true;
  const star = Boolean(behavior.autoSaveOnClick);
  const trackClicks = Boolean(cleanAppUrl) && (markRead || star);

  if (!trackClicks) {
    return (a) => a.url ?? "";
  }
  return (a) => `${cleanAppUrl}/api/r?t=${signClickToken(userId, a.id)}`;
}
