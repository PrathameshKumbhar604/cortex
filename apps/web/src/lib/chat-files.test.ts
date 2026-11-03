import { describe, expect, it } from "vitest";
import { attachmentIds } from "./chat-files";

describe("attachmentIds", () => {
  it("finds files in turns and in other versions, once each", () => {
    const chat = {
      turns: [
        { attachments: [{ id: "a" }], versions: [null, { attachments: [{ id: "b" }, { id: "a" }] }] },
        { question: "no files" },
        { attachments: [{ id: 3 }, { id: "c" }] },
      ],
    };
    expect(attachmentIds(chat)).toEqual(["a", "b", "c"]);
  });
  it("tolerates chats with no turns", () => {
    expect(attachmentIds({})).toEqual([]);
  });
});
