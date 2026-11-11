jest.mock("react-native", () => ({ Linking: { openURL: jest.fn(() => Promise.resolve()) } }));
import { Linking } from "react-native";
import { openLink, outsideLink } from "./links";

describe("outsideLink", () => {
  it("lets the sign-in return through", () => {
    expect(outsideLink("cortex://sso-callback?code=1", false)).toBe("cortex://sso-callback?code=1");
    expect(outsideLink("/sso-callback", true)).toBe("/sso-callback");
  });
  it("opens home, never a screen or a question an outside link names", () => {
    for (const p of ["cortex://?q=send%20my%20mail", "cortex://voice?t=x", "/voice", "cortex://sso-callback-evil", "clerk://app.cortex.android.hosted-callback/x"]) {
      expect(outsideLink(p, true)).toBe("/");
      expect(outsideLink(p, false)).toBeNull();
    }
  });
});

describe("openLink", () => {
  it("opens web and mail links only", () => {
    for (const u of ["tel:123", "intent://x", "javascript:alert(1)", "file:///a", "cortex://voice", undefined]) openLink(u);
    expect(Linking.openURL).not.toHaveBeenCalled();
    openLink("https://example.com/a");
    openLink("mailto:a@example.com");
    expect(Linking.openURL).toHaveBeenCalledTimes(2);
  });
});
