import { render } from "@react-email/render";
import type { OrganizedDigest } from "@/lib/digest/types";
import { DigestFallbackEmail } from "./digest-fallback-email";
import type { LinkFn } from "./digest-email";

export async function renderFallbackHtml(
  digest: OrganizedDigest,
  buildLink?: LinkFn,
): Promise<string> {
  return render(<DigestFallbackEmail digest={digest} buildLink={buildLink} />);
}
