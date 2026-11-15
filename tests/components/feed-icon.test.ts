import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { FeedIcon } from "@/components/layout/sidebar/feed-icon";

afterEach(cleanup);

const props = {
  url: "https://cdn.example.com/logo.png",
  siteUrl: "https://example.com/news",
  feedUrl: "https://feeds.example.org/rss",
  name: "Example",
};

describe("FeedIcon", () => {
  it("falls back from a failed metadata icon to the site favicon, then a letter for a proxy placeholder", () => {
    const { container } = render(createElement(FeedIcon, props));
    fireEvent.error(container.querySelector("img")!);
    const favicon = container.querySelector("img")!;
    expect(new URL(favicon.src).searchParams.get("url")).toBe("https://example.com/favicon.ico");
    Object.defineProperties(favicon, {
      naturalWidth: { value: 1 },
      naturalHeight: { value: 1 },
    });
    fireEvent.load(favicon);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("E");
  });

  it("keeps a successfully decoded icon and tries a new URL after metadata changes", () => {
    const { container, rerender } = render(createElement(FeedIcon, props));
    fireEvent.error(container.querySelector("img")!);
    fireEvent.error(container.querySelector("img")!);
    rerender(createElement(FeedIcon, { ...props, url: "https://example.com/new.png" }));
    const image = container.querySelector("img")!;
    Object.defineProperties(image, {
      naturalWidth: { value: 32 },
      naturalHeight: { value: 16 },
    });
    fireEvent.load(image);
    expect(container.querySelector("img")).toBe(image);
    expect(new URL(image.src).searchParams.get("url")).toBe("https://example.com/new.png");
  });

  it("does not retry duplicate candidates or request the RSS service's unrelated icon", () => {
    const { container } = render(
      createElement(FeedIcon, { ...props, url: "https://example.com/favicon.ico" }),
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("E");
  });

  it("uses the feed origin when metadata is invalid and preserves a full Unicode fallback character", () => {
    const { container } = render(
      createElement(FeedIcon, {
        ...props,
        url: "javascript:alert(1)",
        siteUrl: "not a URL",
        name: "😀 Feed",
      }),
    );
    const image = container.querySelector("img")!;
    expect(new URL(image.src).searchParams.get("url")).toBe(
      "https://feeds.example.org/favicon.ico",
    );
    fireEvent.error(image);
    expect(container.textContent).toBe("😀");
  });
});
