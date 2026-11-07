// Copied from apps/web/src/lib/voice.test.ts (vitest → jest globals).
import { chunkSentences, PERSONAS, PHRASES, persona, SPOKEN_CAP, SpokenReply, stablePrefix, toSpeakable, voiceQuestion } from "./personas";

describe("toSpeakable", () => {
  it("drops citations, links, URLs and emphasis", () => {
    const md = "The **beta** moves to *Nov 14* [2][5]. See [the doc](https://x.com/a) or https://example.com/page now.";
    expect(toSpeakable(md)).toEqual({ text: "The beta moves to Nov 14. See the doc or now.", details: false });
  });

  it("reads list items and headings as sentences", () => {
    expect(toSpeakable("### Due soon\n- Thesis outline [1]\n- Demo video\n1. Pay fees").text).toBe("Due soon. Thesis outline. Demo video. Pay fees.");
  });

  it("skips code blocks and tables but says they were there", () => {
    const md = "Run this:\n```bash\nnpm test\n```\n| a | b |\n|---|---|\n| 1 | 2 |\nThat's it.";
    expect(toSpeakable(md)).toEqual({ text: "Run this: That's it.", details: true });
  });

  it("ends Devanagari lines with a danda", () => {
    expect(toSpeakable("- थीसिस की रूपरेखा [1]\n- डेमो वीडियो").text).toBe("थीसिस की रूपरेखा। डेमो वीडियो।");
  });

  it("keeps snake_case words intact", () => expect(toSpeakable("Use send_email now.").text).toBe("Use send_email now."));
});

describe("chunkSentences", () => {
  it("splits on full stops and the danda, but not inside numbers", () => {
    expect(chunkSentences("It takes 3.5 hours to finish the whole thing. आज बैठक है। कल डेमो है। Ready?", 1)).toEqual([
      "It takes 3.5 hours to finish the whole thing.",
      "आज बैठक है।",
      "कल डेमो है।",
      "Ready?",
    ]);
  });

  it("merges tiny sentences and breaks long ones at a comma", () => {
    expect(chunkSentences("Yes. It moved to Thursday.")).toEqual(["Yes. It moved to Thursday."]);
    const long = `${"word ".repeat(30)}and then, ${"more ".repeat(30)}end.`;
    const out = chunkSentences(long, 24, 220);
    expect(out.length).toBe(2);
    expect(out.every((s) => s.length <= 220)).toBe(true);
    expect(out.join(" ")).toBe(long.replace(/\s+/g, " ").trim());
  });
});

describe("stablePrefix", () => {
  it("stops at the last finished sentence or line", () => {
    expect(stablePrefix("One done. Two is still go", false)).toBe("One done.");
    expect(stablePrefix("- item one\n- item tw", false)).toBe("- item one\n");
    expect(stablePrefix("no stop yet", false)).toBe("");
    expect(stablePrefix("all of it", true)).toBe("all of it");
  });

  it("never cuts inside an open code block", () => expect(stablePrefix("Try this.\n```\nconst a = 1.\nmore", false)).toBe("Try this.\n"));
});

describe("SpokenReply", () => {
  it("hands out each sentence once as the answer streams", () => {
    const r = new SpokenReply("en");
    expect(r.next("The launch moved", false)).toEqual([]);
    expect(r.next("The launch moved to Thursday [1]. Priya", false)).toEqual(["The launch moved to Thursday."]);
    // A stop at the very end may still be "3." of "3.5": it is said once more text (or the end) confirms it.
    expect(r.next("The launch moved to Thursday [1]. Priya sends the deck by Monday [2].", false)).toEqual([]);
    expect(r.next("The launch moved to Thursday [1]. Priya sends the deck by Monday [2].", true)).toEqual(["Priya sends the deck by Monday."]);
    expect(r.next("anything", true)).toEqual([]);
  });

  it("caps a long reply and points to the screen once", () => {
    const r = new SpokenReply("hi");
    const md = Array.from({ length: 40 }, (_, i) => `यह वाक्य संख्या ${i} है और इसमें कुछ शब्द हैं।`).join(" ");
    const said = r.next(md, true);
    expect(said.at(-1)).toBe(PHRASES.rest.hi);
    expect(r.spokenChars).toBeLessThanOrEqual(SPOKEN_CAP);
  });

  it("mentions details left on screen for code", () => {
    expect(new SpokenReply("mr").next("हे करा:\n```\nnpm i\n```", true)).toEqual(["हे करा:", PHRASES.details.mr]);
  });
});

describe("voice personas", () => {
  it("has a male and a female voice per language, with the requested speakers", () => {
    expect(persona("hi", "male").speaker).toBe("ashutosh_hi_conversational");
    expect(persona("hi", "female").speaker).toBe("roopa_hi_conversational");
    expect(persona("mr", "female").speaker).toBe("ishita_mr_conversational");
    expect(persona("mr", "male").speaker).toBe("nilesh_mr_conversation");
    expect(new Set(PERSONAS.map((p) => p.color[1])).size).toBe(PERSONAS.length);
  });
});

describe("voiceQuestion", () => {
  it("turns a transcript into a chat question", () => {
    expect(voiceQuestion("  what's   due\nthis week ")).toBe("what's due this week");
    expect(voiceQuestion(" . ")).toBeNull();
    expect(voiceQuestion("a".repeat(2500))!.length).toBe(2000);
  });
});

describe("abbreviations and repeats", () => {
  it("keeps 'Dr. Ruiz' in one sentence", () => {
    expect(chunkSentences("Submit it to Dr. Ruiz by Monday. Then rest.", 1)).toEqual(["Submit it to Dr. Ruiz by Monday.", "Then rest."]);
    expect(stablePrefix("Send it to Dr. Ruiz now", false)).toBe("");
  });

  it("never says the same sentence twice when the final answer re-flows", () => {
    const r = new SpokenReply("en");
    expect(r.next("The beta is blocked by the push credentials [1]. More", false)).toEqual(["The beta is blocked by the push credentials."]);
    expect(r.next("**Status**\nThe beta is blocked by the push credentials [1].", true)).toEqual(["Status."]);
  });
});
