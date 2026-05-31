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
import type {
  DigestArticle,
  OrganizedDigest,
  TopHeadline,
  TopicGroup,
} from "@/lib/digest/types";
import { briefText } from "@/lib/email/brief";
import { emailFont, emailTheme } from "@/lib/email/theme";

export type LinkFn = (article: DigestArticle) => string;
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

interface DigestEmailProps {
  digest: OrganizedDigest;
  buildLink?: LinkFn;
}

/**
 * Clustered digest email. Designed with `@react-email/components` so the
 * markup is email-client-safe (tables under the hood, inlined CSS via the
 * render() call) while reading like normal React on the app side.
 */
export function DigestEmail({ digest, buildLink = defaultLink }: DigestEmailProps) {
  const dateStr = digest.date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {`Feedwise · ${dateStr} · ${digest.totalArticles} article${digest.totalArticles === 1 ? "" : "s"}`}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading as="h1" style={styles.h1}>
              Feedwise Digest
            </Heading>
            <Text style={styles.headerMeta}>
              {dateStr} · {digest.totalArticles} article{digest.totalArticles === 1 ? "" : "s"} · {digest.topicCount} topic
              {digest.topicCount === 1 ? "" : "s"}
            </Text>
          </Section>

          <Section style={styles.body2}>
            {digest.topHeadlines.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>TOP STORIES</Text>
                {digest.topHeadlines.map((h, i) => (
                  <HeadlineRow key={i} index={i} headline={h} link={buildLink} />
                ))}
              </>
            )}

            {digest.topicGroups.map((g) => (
              <TopicSection key={g.topic} group={g} link={buildLink} />
            ))}

            <Ungrouped articles={digest.ungrouped} link={buildLink} />
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

function HeadlineRow({
  index,
  headline,
  link,
}: {
  index: number;
  headline: TopHeadline;
  link: LinkFn;
}) {
  return (
    <Text style={styles.headlineRow}>
      <span style={styles.headlineNumber}>({index + 1})</span>{" "}
      <Link href={link(headline.primaryArticle)} style={styles.headlineLink}>
        {headline.cluster.headline}
      </Link>{" "}
      <span style={styles.headlineMeta}>
        · {headline.cluster.topic} · {headline.sourceCount} source
        {headline.sourceCount === 1 ? "" : "s"} · ★ {headline.cluster.importance}
      </span>
    </Text>
  );
}

function TopicSection({ group, link }: { group: TopicGroup; link: LinkFn }) {
  return (
    <Section style={styles.group}>
      <Heading as="h2" style={styles.h2}>
        {group.topic}{" "}
        <span style={styles.h2Count}>({group.totalCount})</span>
      </Heading>
      {group.clusters.map((c, idx) => (
        <ArticleItem
          key={idx}
          article={c.primary}
          dupCount={c.duplicates.length}
          link={link}
        />
      ))}
    </Section>
  );
}

function Ungrouped({
  articles,
  link,
}: {
  articles: DigestArticle[];
  link: LinkFn;
}) {
  if (articles.length === 0) return null;
  return (
    <Section style={styles.group}>
      <Heading as="h2" style={styles.h2}>
        More <span style={styles.h2Count}>({articles.length})</span>
      </Heading>
      {articles.map((a, idx) => (
        <ArticleItem key={idx} article={a} dupCount={0} link={link} />
      ))}
    </Section>
  );
}

function ArticleItem({
  article,
  dupCount,
  link,
}: {
  article: DigestArticle;
  dupCount: number;
  link: LinkFn;
}) {
  // Prefer the LLM-generated summary when the background worker has produced
  // one; fall back to the (often messy) raw RSS summary otherwise.
  const brief = briefText(article.aiSummary ?? article.summary, 200);
  const sources = dupCount > 0 ? ` · ${dupCount + 1} sources` : "";
  return (
    <Section style={styles.item}>
      <Link href={link(article)} style={styles.itemTitle}>
        {article.title ?? "(untitled)"}
      </Link>
      <Text style={styles.itemMeta}>
        {article.feedTitle} · {fmtDate(article.publishedAt)}
        {sources}
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
    padding: 0,
  } as React.CSSProperties,
  header: {
    padding: "18px 28px",
    borderBottom: `1px solid ${emailTheme.border}`,
  } as React.CSSProperties,
  h1: {
    margin: 0,
    fontSize: 18,
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
  sectionLabel: {
    margin: "0 0 14px 0",
    fontSize: 12,
    color: emailTheme.mutedForeground,
    letterSpacing: "0.08em",
    fontWeight: 600,
    textTransform: "uppercase",
  } as React.CSSProperties,
  headlineRow: {
    margin: "0 0 10px 0",
    fontSize: 14,
    lineHeight: 1.5,
  } as React.CSSProperties,
  headlineNumber: {
    color: emailTheme.mutedForeground,
    fontVariantNumeric: "tabular-nums",
  } as React.CSSProperties,
  headlineLink: {
    color: emailTheme.primary,
    textDecoration: "none",
    fontWeight: 500,
  } as React.CSSProperties,
  headlineMeta: {
    color: emailTheme.mutedForeground,
    fontSize: 12,
  } as React.CSSProperties,
  group: {
    marginTop: 24,
  } as React.CSSProperties,
  h2: {
    margin: "0 0 12px 0",
    fontSize: 15,
    fontWeight: 600,
    color: emailTheme.foreground,
    borderBottom: `1px solid ${emailTheme.border}`,
    paddingBottom: 6,
  } as React.CSSProperties,
  h2Count: {
    color: emailTheme.mutedForeground,
    fontSize: 12,
    fontWeight: 400,
  } as React.CSSProperties,
  item: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottom: `1px solid ${emailTheme.border}`,
  } as React.CSSProperties,
  itemTitle: {
    color: emailTheme.foreground,
    textDecoration: "none",
    fontWeight: 500,
    fontSize: 15,
    display: "block",
    marginBottom: 2,
  } as React.CSSProperties,
  itemMeta: {
    margin: "2px 0 0 0",
    color: emailTheme.mutedForeground,
    fontSize: 12,
  } as React.CSSProperties,
  itemBrief: {
    margin: "6px 0 0 0",
    color: emailTheme.foreground,
    fontSize: 13,
    lineHeight: 1.55,
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
