import { describe, expect, it } from "vitest";
import { isDisposableEmail } from "./disposable";

describe("isDisposableEmail", () => {
  it("blocks throwaway inboxes, including subdomains and odd casing", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail(" A@Sub.Mailinator.COM ")).toBe(true);
    expect(isDisposableEmail("a@10minutemail.com")).toBe(true);
  });
  it("lets real providers through", () => {
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
    expect(isDisposableEmail("a@company.co.in")).toBe(false);
    expect(isDisposableEmail("not-an-email")).toBe(false);
  });
});
