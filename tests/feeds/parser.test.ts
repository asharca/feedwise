import { expect, it } from "vitest";
import { parseFeed } from "@/lib/feeds/parser";

const base = "https://example.org/news/feed";
const rss = `<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>A podcast</title><item><guid isPermaLink="false">ep-1</guid><title>One</title><link>https://example.org/episodes/1</link>
<enclosure url="https://cdn.example.org/1.mp3" type="audio/mpeg" length="42"/>
<itunes:duration>00:01:30</itunes:duration><itunes:image href="https://cdn.example.org/cover.png"/></item>
<item><title>Film</title><media:group><media:content url="https://cdn.example.org/film.mp4" type="video/mp4" width="640"/>
<media:thumbnail url="https://cdn.example.org/poster.jpg"/></media:group></item></channel></rss>`;

it("maps enclosures, iTunes metadata and grouped Media RSS", () => {
  const feed = parseFeed(rss, base);
  expect(feed).toMatchObject({ feedType: "rss", title: "A podcast" });
  expect(feed.articles[0]).toMatchObject({
    guid: "ep-1",
    imageUrl: "https://cdn.example.org/cover.png",
    media: [{ type: "audio", mimeType: "audio/mpeg", duration: 90 }, { type: "image" }],
  });
  expect(feed.articles[1]).toMatchObject({
    media: [
      { type: "video", width: 640, previewUrl: "https://cdn.example.org/poster.jpg" },
      { type: "image" },
    ],
  });
});

it("uses Atom id rather than the alternate link; recognizes a video permalink", () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Videos</title><entry>
    <id>tag:example.org,2026:1</id><title>Film</title><updated>2026-11-01T12:00:00Z</updated>
    <link rel="alternate" href="https://www.youtube.com/watch?v=1"/><summary>Hello</summary></entry></feed>`;
  expect(parseFeed(atom).articles[0]).toMatchObject({
    guid: "tag:example.org,2026:1",
    title: "Film",
    contentText: "Hello",
    publishedAt: new Date("2026-11-01T12:00:00Z"),
    media: [{ type: "video" }],
  });
});

it("maps RDF (RSS 1.0) and Dublin Core", () => {
  const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel rdf:about="https://example.org/feed"><title>News</title></channel>
    <item rdf:about="https://example.org/1"><title>Hello</title><link>https://example.org/1</link><dc:creator>Ada</dc:creator></item></rdf:RDF>`;
  expect(parseFeed(rdf)).toMatchObject({
    feedType: "rss",
    articles: [{ title: "Hello", author: "Ada", guid: "https://example.org/1" }],
  });
});

it("maps JSON Feed attachments and the first image in the HTML", () => {
  const body = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "Feed",
    items: [
      {
        id: "42",
        url: "https://example.org/post",
        content_html: '<p>Hello<img src="/pic.jpg"></p>',
        attachments: [
          { url: "https://example.org/film.mp4", mime_type: "video/mp4", duration_in_seconds: 12 },
        ],
      },
    ],
  });
  expect(parseFeed(body, base)).toMatchObject({
    feedType: "json",
    articles: [
      {
        guid: "42",
        contentText: "Hello",
        imageUrl: "https://example.org/pic.jpg",
        media: [{ type: "video", duration: 12 }],
      },
    ],
  });
});

it("prefers a link, then hashes missing identifiers deterministically", () => {
  const body =
    '<rss version="2.0"><channel><title>T</title><item><link>https://example.org/x</link></item><item><title>A</title><description>B</description></item></channel></rss>';
  const ids = (s: string) => parseFeed(s).articles.map((a) => a.guid);
  expect(ids(body)).toEqual(["https://example.org/x", expect.stringMatching(/^[a-f0-9]{40}$/)]);
  expect(ids(body)).toEqual(ids(body));
  expect(ids(body)[1]).not.toEqual(ids(body.replace(">B<", ">C<"))[1]);
  expect(() => parseFeed("not a feed")).toThrow(expect.objectContaining({ code: "parse" }));
});
