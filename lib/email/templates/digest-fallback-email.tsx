import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { DigestArticle, OrganizedDigest } from "@/lib/digest/types";
import { briefText } from "@/lib/email/brief";
import type { LinkFn } from "./digest-email";
import { emailFont, emailTheme } from "@/lib/email/theme";

const FALLBACK_BRIEF_MAX = 280;

const defaultLink: LinkFn = (a) => a.url ?? "";

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FallbackEmailProps {
  digest: OrganizedDigest;
  buildLink?: LinkFn;
}

export function DigestFallbackEmail({ digest, buildLink = defaultLink }: FallbackEmailProps) {
  const dateStr = digest.date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`Feedwise · ${dateStr} · ${digest.ungrouped.length} article${digest.ungrouped.length === 1 ? "" : "s"}`}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading as="h1" style={styles.h1}>
              Today&rsquo;s Feedwise Digest
            </Heading>
            <Text style={styles.headerMeta}>{dateStr}</Text>
          </Section>

          <Section style={styles.body2}>
            {digest.ungrouped.length === 0 ? (
              <Text style={styles.empty}>No articles today.</Text>
            ) : (
              digest.ungrouped.map((a, idx) => (
                <ArticleBlock key={idx} article={a} link={buildLink} />
              ))
            )}
          </Section>

          <Hr style={styles.hr} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>Feedwise daily digest.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function ArticleBlock({ article, link }: { article: DigestArticle; link: LinkFn }) {
  const brief = briefText(article.summary, FALLBACK_BRIEF_MAX);
  return (
    <Section style={styles.item}>
      <Link href={link(article)} style={styles.itemTitle}>
        {article.title ?? "(untitled)"}
      </Link>
      <Text style={styles.itemMeta}>
        {article.feedTitle} · {fmtDate(article.publishedAt)}
      </Text>
      {brief && <Text style={styles.itemBrief}>{brief}</Text>}
    </Section>
  );
}

const styles = {
  body: {
    margin: 0,
    padding: 0,
    backgroundColor: emailTheme.pageBackground,
    fontFamily: emailFont.family,
    color: emailTheme.foreground,
  } as React.CSSProperties,
  container: {
    width: "100%",
    maxWidth: 640,
    margin: "0 auto",
    backgroundColor: emailTheme.background,
    borderRadius: 8,
    overflow: "hidden",
  } as React.CSSProperties,
  header: {
    padding: "20px 28px",
    borderBottom: `1px solid ${emailTheme.border}`,
  } as React.CSSProperties,
  h1: {
    margin: 0,
    fontSize: 20,
    fontWeight: 600,
    color: emailTheme.foreground,
  } as React.CSSProperties,
  headerMeta: {
    margin: "4px 0 0 0",
    color: emailTheme.mutedForeground,
    fontSize: 12,
  } as React.CSSProperties,
  body2: {
    padding: "24px 28px",
  } as React.CSSProperties,
  empty: {
    margin: 0,
    color: emailTheme.mutedForeground,
    fontSize: 14,
  } as React.CSSProperties,
  item: {
    marginBottom: 18,
    paddingBottom: 14,
    borderBottom: `1px solid ${emailTheme.border}`,
  } as React.CSSProperties,
  itemTitle: {
    color: emailTheme.primary,
    textDecoration: "none",
    fontSize: 16,
    fontWeight: 500,
    display: "block",
  } as React.CSSProperties,
  itemMeta: {
    margin: "4px 0 0 0",
    color: emailTheme.mutedForeground,
    fontSize: 13,
  } as React.CSSProperties,
  itemBrief: {
    marginTop: 8,
    color: emailTheme.foreground,
    fontSize: 14,
    lineHeight: 1.6,
  } as React.CSSProperties,
  hr: {
    border: "none",
    borderTop: `1px solid ${emailTheme.border}`,
    margin: 0,
  } as React.CSSProperties,
  footer: {
    padding: "14px 28px",
    backgroundColor: emailTheme.muted,
  } as React.CSSProperties,
  footerText: {
    margin: 0,
    color: emailTheme.mutedForeground,
    fontSize: 12,
    textAlign: "center",
  } as React.CSSProperties,
};
