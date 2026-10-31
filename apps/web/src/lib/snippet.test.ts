import { describe, expect, it } from "vitest";
import { cleanSnippet, clip, hostOf, plainText } from "./snippet";

describe("plainText", () => {
  it("drops a markdown image, even one cut off mid-URL", () => {
    expect(plainText("![](https://www.granola.ai/_next/image?url=%2FhomepageAssets%2Ffooter%2Ffooter-")).toBe("");
    expect(plainText("![](https://www.granola.ai/_next/image?url=%2Fa.png&w=64) Granola takes notes for you.")).toBe("Granola takes notes for you.");
  });

  it("keeps link text, drops the heading mark, escapes and the cut-off URL", () => {
    expect(plainText("# Granola - AI Meeting Notes - [15K Ratings\\ \\ 5.0](https://apps.apple.com/us/app/granola-ai-")).toBe(
      "Granola - AI Meeting Notes - 15K Ratings 5.0",
    );
  });

  it("strips HTML, entities, emphasis, list marks and bare URLs", () => {
    expect(plainText("<p>Notes &amp; <b>actions</b></p>\n- **Bold** and _soft_ `code`\n\nSee https://x.com/a?b=1 now")).toBe("Notes & actions Bold and soft code See now");
  });

  it("leaves ordinary prose alone", () => {
    expect(plainText("It produces meeting notes as enormous blocks of text without headers.")).toBe("It produces meeting notes as enormous blocks of text without headers.");
  });
});

describe("cleanSnippet", () => {
  it("starts at the sentence that matches the question", () => {
    const raw = "Welcome to our site. Cookies are used here. Granola pricing starts at $10 per month for teams.";
    expect(cleanSnippet(raw, "how much is granola pricing?")).toBe("Granola pricing starts at $10 per month for teams.");
  });

  it("keeps the opening when nothing matches, and is empty for image-only text", () => {
    expect(cleanSnippet("First line. Second line.", "unrelated query")).toBe("First line. Second line.");
    expect(cleanSnippet("![](https://a.com/x.png)", "x")).toBe("");
    expect(cleanSnippet(undefined)).toBe("");
  });

  it("cuts on a word boundary", () => {
    expect(cleanSnippet("alpha beta gamma delta epsilon", "", 20)).toBe("alpha beta gamma…");
    expect(clip("short", 20)).toBe("short");
  });
});

describe("hostOf", () => {
  it("reads the host without www, only for web links", () => {
    expect(hostOf("https://www.granola.ai/pricing")).toBe("granola.ai");
    expect(hostOf("mailto:a@b.com")).toBeUndefined();
    expect(hostOf("not a url")).toBeUndefined();
  });
});
