import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, useSignIn, useSignUp } from "@clerk/expo";
import { useSSO } from "@clerk/expo/experimental"; // the Core 3 flow, like the rest of this screen: it finalizes the session itself
import { ArrowRight, MailCheck } from "@/ui/icons";
import { API_URL, OAUTH_ENABLED } from "@/config";
import { explainClerk, type Mode } from "@/auth/explain";
import { haptic } from "@/haptics";
import { openLink } from "@/lib/links";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Button, Field, Notice, Press, Rule, Txt, Wordmark } from "@/ui/primitives";

type Step = "form" | "verify-signup" | "verify-device" | "reset";
const EMAIL = /^\S+@\S+\.\S+$/;

/**
 * The web's own sign-in, on the phone: email + password, an emailed 6-digit code for new accounts, new devices and
 * password resets. Google / GitHub appear once the Clerk dashboard allows the app (EXPO_PUBLIC_OAUTH_ENABLED).
 */
export default function SignIn() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { isLoaded } = useAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { startSSOFlow } = useSSO();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const fail = (err: unknown, m: Mode) => {
    haptic.error();
    setProblem(explainClerk(err, m));
  };
  // finalize() makes the new session active; the root layout's guards then move on by themselves.
  const finish = async (resource: typeof signIn | typeof signUp) => {
    const { error } = await resource.finalize();
    if (error) fail(error, mode);
    else haptic.success();
  };
  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setProblem(null);
    try {
      await fn();
    } catch {
      setProblem("We can't reach Cortex right now. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const signInWithPassword = () =>
    run("email", async () => {
      const { error } = await signIn.password({ emailAddress: email.trim(), password });
      if (error) return fail(error, "sign-in");
      if (signIn.status === "complete") return finish(signIn);
      if (signIn.status === "needs_client_trust" || signIn.status === "needs_second_factor") {
        const sent = await signIn.mfa.sendEmailCode();
        if (sent.error) return fail(sent.error, "sign-in");
        setCode("");
        return setStep("verify-device");
      }
      fail(null, "sign-in");
    });

  const createAccount = () =>
    run("email", async () => {
      const check = await fetch(`${API_URL}/api/email-check`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim() }) }).catch(() => null);
      if (check?.status === 429) return fail({ status: 429 }, "create");
      if (check?.ok && ((await check.json()) as { disposable: boolean }).disposable)
        return setProblem("Temporary or throwaway email addresses can't be used. Use your personal or work email.");
      const { error } = await signUp.password({ emailAddress: email.trim(), password });
      if (error) return fail(error, "create");
      if (signUp.status === "complete") return finish(signUp);
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) return fail(sent.error, "create");
      setCode("");
      setStep("verify-signup");
    });

  const verify = () =>
    run("code", async () => {
      if (step === "verify-signup") {
        const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
        if (error) return fail(error, "create");
        if (signUp.status === "complete") return finish(signUp);
      } else if (step === "verify-device") {
        const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
        if (error) return fail(error, "sign-in");
        if (signIn.status === "complete") return finish(signIn);
      } else {
        const checked = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
        if (checked.error) return fail(checked.error, "sign-in");
        const { error } = await signIn.resetPasswordEmailCode.submitPassword({ password });
        if (error) return fail(error, "sign-in");
        if (signIn.status === "complete") return finish(signIn);
      }
      fail(null, mode);
    });

  const forgot = () => {
    if (!EMAIL.test(email.trim())) return setProblem("Type your email address first, then tap Forgot password.");
    void run("reset", async () => {
      const created = await signIn.create({ identifier: email.trim() });
      if (created.error) return fail(created.error, "sign-in");
      const { error } = await signIn.resetPasswordEmailCode.sendCode();
      if (error) return fail(error, "sign-in");
      setCode("");
      setPassword("");
      setStep("reset");
    });
  };

  const resend = () =>
    run("resend", async () => {
      const r = step === "verify-signup" ? await signUp.verifications.sendEmailCode() : step === "verify-device" ? await signIn.mfa.sendEmailCode() : await signIn.resetPasswordEmailCode.sendCode();
      if (r.error) fail(r.error, mode);
    });

  const sso = (provider: "google" | "github") =>
    run(provider, async () => {
      try {
        const { createdSessionId, authSessionResult } = await startSSOFlow({ strategy: `oauth_${provider}` });
        if (createdSessionId) haptic.success();
        else if (authSessionResult?.type === "success") fail(null, mode); // signed in at Google/GitHub, but no session came back
        // closed the browser sheet: nothing to say
      } catch (err) {
        fail(err, mode); // a Clerk refusal is not a network problem
      }
    });

  const back = () => {
    setStep("form");
    setProblem(null);
    void signIn.reset();
  };

  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: c.surface }}
      contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}
    >
      <Wordmark size={26} />
      <Txt variant="small" tone="muted" style={{ marginTop: 6 }}>
        Answers from your work, with every claim cited and checked.
      </Txt>

      {step !== "form" ? (
        <View style={{ marginTop: 40, gap: 14 }}>
          <MailCheck size={24} color={c.accent} strokeWidth={1.75} />
          <Txt variant="headline" accessibilityRole="header">
            {step === "verify-signup" ? "Confirm your email" : step === "verify-device" ? "Confirm it's you" : "Choose a new password"}
          </Txt>
          <Txt variant="body" tone="muted">
            We emailed a 6-digit code to <Txt variant="body" tone="ink2" style={{ fontFamily: font.sans550 }}>{email.trim()}</Txt>
            {step === "verify-device" ? " because this is a new device for your account." : "."}
          </Txt>
          <Field
            label="Code"
            mono
            autoFocus
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={8}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ""))}
            placeholder="000000"
          />
          {step === "reset" && (
            <Field label="New password" hint={<Txt variant="note" tone="hair">8 characters or more</Txt>} secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          )}
          {problem && <Notice text={problem} />}
          <Button label={step === "reset" ? "Save and sign in" : "Continue"} icon={<ArrowRight size={16} color={c.onInk} />} busy={busy === "code"} disabled={!!busy || code.length < 6} onPress={() => void verify()} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Button kind="ghost" label="Back" onPress={back} />
            <Button kind="ghost" label={busy === "resend" ? "Sending…" : "Send a new code"} onPress={() => void resend()} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 40 }}>
          <Txt variant="headline" accessibilityRole="header">
            {mode === "sign-in" ? "Welcome back" : "Create your account"}
          </Txt>
          <Txt variant="body" tone="muted" style={{ marginTop: 4 }}>
            {mode === "sign-in" ? "Sign in to pick up where you left off." : "Free. Takes ten seconds."}
          </Txt>

          {OAUTH_ENABLED && (
            <View style={{ marginTop: 24, gap: 10 }}>
              <Button kind="secondary" label="Continue with Google" busy={busy === "google"} disabled={!isLoaded || !!busy} onPress={() => void sso("google")} />
              <Button kind="secondary" label="Continue with GitHub" busy={busy === "github"} disabled={!isLoaded || !!busy} onPress={() => void sso("github")} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 6 }}>
                <Rule style={{ flex: 1 }} />
                <Txt variant="note" tone="hair">or continue with email</Txt>
                <Rule style={{ flex: 1 }} />
              </View>
            </View>
          )}

          <View accessibilityRole="tablist" style={{ marginTop: 24, flexDirection: "row", backgroundColor: c.shell, borderRadius: 12, padding: 4 }}>
            {(["sign-in", "create"] as const).map((m) => (
              <Press
                key={m}
                accessibilityRole="tab"
                accessibilityState={{ selected: mode === m }}
                onPress={() => {
                  haptic.select();
                  setMode(m);
                  setProblem(null);
                }}
                style={[
                  { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
                  mode === m && { backgroundColor: c.surface, shadowColor: "#1a1916", shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
                ]}
              >
                <Txt variant="small" tone={mode === m ? "ink" : "muted"} style={mode === m ? { fontFamily: font.sans550 } : undefined}>
                  {m === "sign-in" ? "Sign in" : "Create account"}
                </Txt>
              </Press>
            ))}
          </View>

          <View style={{ marginTop: 18, gap: 14 }}>
            <Field label="Email" autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" value={email} onChangeText={setEmail} placeholder="you@example.com" />
            <Field
              label="Password"
              secureTextEntry
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => !busy && void (mode === "sign-in" ? signInWithPassword() : createAccount())}
              hint={
                mode === "sign-in" ? (
                  <Press onPress={forgot} accessibilityLabel="Forgot password">
                    <Txt variant="note" tone="muted">{busy === "reset" ? "Sending a code…" : "Forgot password?"}</Txt>
                  </Press>
                ) : (
                  <Txt variant="note" tone="hair">8 characters or more</Txt>
                )
              }
            />
            {problem && (
              <Notice
                text={problem}
                action={
                  /(Sign in|Create one) instead/.test(problem) ? (
                    <Press onPress={() => setMode(mode === "create" ? "sign-in" : "create")}>
                      <Txt variant="small" tone="warnInk" style={{ fontFamily: font.sans550, textDecorationLine: "underline" }}>
                        {mode === "create" ? "Sign in" : "Create account"}
                      </Txt>
                    </Press>
                  ) : undefined
                }
              />
            )}
            <Button
              label={mode === "sign-in" ? "Sign in" : "Create account"}
              icon={<ArrowRight size={16} color={c.onInk} />}
              busy={busy === "email"}
              disabled={!isLoaded || !!busy}
              onPress={() => void (mode === "sign-in" ? signInWithPassword() : createAccount())}
              style={{ marginTop: 4 }}
            />
          </View>

          <Txt variant="note" tone="hair" style={{ marginTop: 32 }}>
            By continuing you agree that Cortex reads your connected apps only to answer you, and acts only when you approve.{" "}
            <Txt variant="note" tone="muted" accessibilityRole="link" onPress={() => openLink(`${API_URL}/privacy`)} style={{ textDecorationLine: "underline" }}>
              Privacy policy
            </Txt>
          </Txt>
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}
