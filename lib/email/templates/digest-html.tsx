import { render } from "@react-email/render";
import type { OrganizedDigest } from "@/lib/digest/types";
import { DigestEmail } from "./digest-email";
import type { LinkFn } from "./digest-email";

export type { LinkFn };

/**
 * Render the clustered digest email to a full HTML string suitable for SMTP.
 * Now built on react-email so the template can be authored as React JSX, share
 * design tokens with the in-app dashboard, and live-preview accurately.
 */
export async function renderDigestHtml(
  digest: OrganizedDigest,
  buildLink?: LinkFn,
): Promise<string> {
  return render(<DigestEmail digest={digest} buildLink={buildLink} />);
}
