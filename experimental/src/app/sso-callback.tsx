import { Redirect } from "expo-router";

/** Google / GitHub sign-in returns to cortex://sso-callback; the sign-in screen finishes it, so just go home. */
export default function SsoCallback() {
  return <Redirect href="/" />;
}
