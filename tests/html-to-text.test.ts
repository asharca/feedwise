import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/utils";

describe("htmlToText", () => {
  it("drops tags and decodes named and numeric entities", () => {
    expect(htmlToText("<p>A&nbsp;&amp;&nbsp;B</p><p>&#39;x&#x27; &ldquo;y&rdquo;</p>")).toBe(
      "A & B 'x' “y”",
    );
  });

  it("leaves unknown or out-of-range entities untouched", () => {
    expect(htmlToText("&bogus; &#99999999;")).toBe("&bogus; &#99999999;");
  });

  it("does not turn decoded markup back into tags", () => {
    expect(htmlToText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
  });
});
