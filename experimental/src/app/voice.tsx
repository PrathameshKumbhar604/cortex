import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Mic, MicOff, Square, X } from "lucide-react-native";
import { api } from "@/api/client";
import { postForm } from "@/api/multipart";
import { ActionCard } from "@/ask/ActionCard";
import { haptic } from "@/haptics";
import { readVoice } from "@/nav/AccountSheet";
import { agent, chats, useAgentState } from "@/state";
import { prefs } from "@/storage";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Press, Rule, Txt } from "@/ui/primitives";
import { Segmented } from "@/ui/Segmented";
import { toast } from "@/ui/toast";
import { NativeVoiceEngine } from "@/voice/engine";
import { Fold, type FoldState } from "@/voice/Fold";
import { LANGS, PERSONAS, PHRASES, persona, SpokenReply, voiceQuestion, type VoiceGender, type VoiceLang } from "@/voice/personas";

type Phase = "starting" | "listening" | "hearing" | "transcribing" | "thinking" | "speaking" | "approval";
const LABEL: Record<Phase, string> = {
  starting: "Starting",
  listening: "Listening",
  hearing: "Hearing you",
  transcribing: "Got it",
  thinking: "Thinking",
  speaking: "Speaking",
  approval: "Waiting for your approval",
};

/**
 * Voice mode: a hands-free conversation. Listen → you talk → a pause ends the turn → think → speak → listen. Talking
 * over Cortex interrupts it. Every turn is a normal chat turn, so ending the conversation leaves the chat behind.
 */
export default function Voice() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t: chatId } = useLocalSearchParams<{ t: string }>();
  const { turns, busy } = useAgentState();
  const engine = useMemo(() => new NativeVoiceEngine(), []);
  const [phase, setPhase] = useState<Phase>("starting");
  const [muted, setMuted] = useState(false);
  const [voice, setVoice] = useState(readVoice);
  const [replyVoice, setReplyVoice] = useState(voice);
  const [userText, setUserText] = useState("");
  const [said, setSaid] = useState<string[]>([]);
  const [turnIndex, setTurnIndex] = useState<number | null>(null);

  const s = useRef({ phase, muted, voice, turnIndex, turns, busy, reply: null as SpokenReply | null, replyLang: "en" as VoiceLang, silenced: false, doneFor: "", queued: null as string | null, decided: "", warned: false });
  useLayoutEffect(() => void Object.assign(s.current, { phase, muted, voice, turnIndex, turns, busy }));
  const turn = turnIndex === null ? undefined : turns[turnIndex];
  const pending = turn?.actions.find((a) => a.status === "pending" || a.status === "approved");
  const p = persona(voice.lang, voice.gender);
  const tint = p.color[scheme === "dark" ? 1 : 0];

  const say = useCallback((text: string) => engine.speak(text), [engine]);
  const toListening = useCallback(() => {
    engine.setListening(!s.current.muted);
    setPhase("listening");
  }, [engine]);

  // ---- asking: each question is a normal chat turn, in Fast mode, answered in the language spoken ----
  const ask = useCallback(
    (q: string) => {
      const st = s.current;
      if (st.busy) return void (st.queued = q);
      st.queued = null;
      st.reply = new SpokenReply(st.voice.lang);
      st.replyLang = st.voice.lang;
      st.silenced = false;
      st.doneFor = "";
      engine.setVoice(st.voice.lang, st.voice.gender);
      setTurnIndex(st.turns.length);
      setReplyVoice(st.voice);
      setSaid([]);
      setPhase("thinking");
      if (!st.turns.length) void api<{ title?: string | null }>("/api/title", { method: "POST", json: { question: q } }).then((b) => b.title && chats.setAutoTitle(chatId, q, b.title), () => {});
      void agent.ask(q, { mode: "fast", language: st.voice.lang });
    },
    [engine, chatId],
  );
  useEffect(() => {
    if (!busy && s.current.queued) ask(s.current.queued);
  }, [busy, ask]);

  // The conversation is this chat: saved as each answer lands.
  useEffect(() => {
    if (!turns.length) return;
    chats.save({ id: chatId, title: turns[0]!.question, updatedAt: Date.now(), serverThreadId: agent.get().serverThreadId, turns });
  }, [turns.length, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- engine events ----
  useEffect(() => {
    const st = s.current;
    engine.setHandlers({
      onSpeechStart(bargeIn) {
        if (bargeIn || st.phase === "speaking" || st.phase === "thinking") st.silenced = true;
        haptic.tap();
        setPhase("hearing");
      },
      onDiscard() {
        if (st.busy) setPhase("thinking");
        else toListening();
      },
      async onUtterance(uri) {
        setPhase("transcribing");
        const body = await postForm<{ text?: string; exhausted?: boolean }>("/api/voice/stt", { audio: { uri, name: "turn.wav", type: "audio/wav" }, lang: st.voice.lang }, { timeoutMs: 45_000 }).catch((e: Error) => ({ error: e.message }) as { text?: string; error?: string });
        const q = voiceQuestion(body.text ?? "");
        if (!q) {
          setUserText("error" in body && body.error ? body.error : "Sorry, I didn't catch that.");
          if (st.busy) setPhase("thinking");
          else toListening();
          return;
        }
        setUserText(q);
        ask(q);
      },
      onSentence(text) {
        if (st.phase !== "approval" && st.phase !== "hearing") setPhase("speaking");
        setSaid((all) => [...all, text]);
      },
      onIdle() {
        const t = st.turnIndex === null ? undefined : st.turns[st.turnIndex];
        if (st.phase === "approval" || st.phase === "hearing" || st.phase === "transcribing") return;
        if (!t || t.done) toListening();
        else setPhase("thinking");
      },
      onFallback(why) {
        if (why !== "exhausted" || st.warned) return;
        st.warned = true;
        toast("Voice mode is using a backup voice. The usual voices aren't available right now.");
      },
    });
  }, [engine, ask, toListening]);

  // Open the mic; a refusal ends the session with a note on how to allow it. Leaving closes it.
  useEffect(() => {
    let gone = false;
    engine.start().then(
      () => !gone && toListening(),
      () => {
        if (gone) return;
        toast("Voice mode needs the microphone. Allow it in Android Settings › Apps › Cortex, then try again.");
        router.back();
      },
    );
    return () => {
      gone = true;
      engine.close();
    };
  }, [engine, toListening]);

  // ---- following the answer as it streams: speak each settled sentence ----
  useEffect(() => {
    const st = s.current;
    const t = turn;
    if (!t || !st.reply) return;
    const action = t.route?.route === "action";
    if (!st.silenced && !action) for (const line of st.reply.next(t.answer, t.done)) say(line);
    if (!t.done || st.doneFor === t.id) return;
    st.doneFor = t.id;
    if (t.actions.some((a) => a.status === "pending")) {
      engine.setListening(false);
      setPhase("approval");
      haptic.tap();
      if (!st.silenced) say(PHRASES.approval[st.replyLang]);
      return;
    }
    if (action && !st.silenced && t.answer) for (const line of st.reply.next(t.answer, true)) say(line);
    if (t.error && !t.answer && !st.silenced) say(PHRASES.sorry[st.replyLang]);
    if (!engine.speaking && st.phase !== "hearing" && st.phase !== "transcribing") toListening();
  }, [turn, engine, say, toListening]);

  // An approval was decided: say how it went, then listen again.
  useEffect(() => {
    const st = s.current;
    if (phase !== "approval" || !turn || pending) return;
    const decided = turn.actions.find((a) => a.status === "executed" || a.status === "failed" || a.status === "rejected");
    if (!decided || st.decided === decided.id + decided.status) return;
    st.decided = decided.id + decided.status;
    st.silenced = false;
    say(PHRASES[decided.status === "executed" ? "done" : decided.status === "failed" ? "failed" : "declined"][st.replyLang]);
    toListening();
  }, [phase, turn, pending, say, toListening]);

  const interrupt = () => {
    s.current.silenced = true;
    engine.stopSpeaking();
    agent.stop();
    toListening();
  };
  const toggleMute = () => {
    const next = !muted;
    haptic.select();
    setMuted(next);
    s.current.muted = next;
    if (next) engine.cancelTurn();
    if (phase !== "approval") engine.setListening(!next);
    if (next && phase === "hearing") toListening();
  };
  const pickVoice = (lang: VoiceLang, gender: VoiceGender) => {
    prefs.set("cortex.voice", `${lang}:${gender}`);
    setVoice({ lang, gender });
  };
  const levels = useCallback(() => engine.levels(), [engine]);
  const fold: FoldState = phase === "starting" ? "starting" : phase === "approval" || muted ? "paused" : phase === "transcribing" ? "thinking" : phase;
  const status = muted && phase !== "approval" ? "Mic off" : LABEL[phase];
  const hint =
    phase === "listening" && !muted ? "Talk whenever you're ready. A pause sends it." : phase === "hearing" ? "Take your time. A pause sends it." : phase === "speaking" ? "Start talking to interrupt." : phase === "approval" ? "Nothing happens until you choose." : "";
  const rp = persona(replyVoice.lang, replyVoice.gender);
  const transcript = useRef<React.ComponentRef<typeof ScrollView>>(null);

  return (
    <View style={{ flex: 1, backgroundColor: c.shell, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 56 }}>
        <Txt variant="wordmark" accessibilityRole="header" style={{ fontSize: 22 }}>
          Voice
        </Txt>
        <View style={{ marginLeft: 10, borderRadius: 10, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Txt variant="readout" tone="muted" style={{ fontSize: 11 }}>
            Experimental
          </Txt>
        </View>
        <View style={{ flex: 1 }} />
        <Press accessibilityLabel="End voice conversation" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <X size={20} color={c.muted} />
        </Press>
      </View>
      <View style={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}>
        <Segmented<VoiceLang> label="Language" value={voice.lang} onChange={(l) => pickVoice(l, voice.gender)} options={LANGS.map((l) => ({ value: l.id, label: l.native }))} />
        <Segmented<VoiceGender> label="Voice" value={voice.gender} onChange={(g) => pickVoice(voice.lang, g)} options={PERSONAS.filter((x) => x.lang === voice.lang).map((x) => ({ value: x.gender, label: x.name }))} />
        <Txt variant="note" tone="muted" style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
          {p.character}
        </Txt>
      </View>

      <View style={{ alignItems: "center", marginTop: 24, gap: 14 }}>
        <Fold state={fold} levels={levels} color={tint} />
        <View style={{ alignItems: "center", gap: 4 }} accessibilityLiveRegion="polite">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
            <Animated.View key={status} entering={FadeIn.duration(200)}>
              <Txt variant="readout" tone="ink2">
                {status}
              </Txt>
            </Animated.View>
            <Txt variant="readout" tone="hair">
              · {LANGS.find((l) => l.id === voice.lang)!.label} · {p.name}
            </Txt>
          </View>
          <Txt variant="note" tone="muted" style={{ minHeight: 18 }}>
            {hint}
          </Txt>
        </View>
      </View>

      <ScrollView ref={transcript} onContentSizeChange={() => transcript.current?.scrollToEnd({ animated: true })} style={{ flex: 1, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        {!!userText && (
          <View>
            <Rule />
            <Txt variant="readout" tone="hair" style={{ marginTop: 10 }}>
              You
            </Txt>
            <Txt variant="body" tone={phase === "hearing" ? "ink2" : "muted"} style={{ marginTop: 4 }}>
              {userText}
            </Txt>
          </View>
        )}
        {phase !== "hearing" && said.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Rule />
            <Txt variant="readout" style={{ marginTop: 10, color: rp.color[scheme === "dark" ? 1 : 0] }}>
              {rp.name}
            </Txt>
            <Txt variant="body" style={{ marginTop: 4, fontSize: 18, lineHeight: 29 }}>
              {said.map((line, i) => (
                <Txt key={i} variant="body" tone={i < said.length - 1 ? "muted" : "ink"} style={{ fontSize: 18, lineHeight: 29 }}>
                  {line}{" "}
                </Txt>
              ))}
            </Txt>
          </View>
        )}
      </ScrollView>

      {phase === "approval" && pending && turn && (
        <Animated.View entering={FadeInDown.duration(280)} exiting={FadeOut.duration(180)} style={{ paddingHorizontal: 12 }}>
          <Txt variant="readout" tone="muted" style={{ paddingHorizontal: 4 }}>
            Needs your approval
          </Txt>
          <ActionCard proposal={pending} onDecide={(d, edits) => agent.decide(turn.id, pending.id, d, edits)} />
        </Animated.View>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 14, paddingBottom: insets.bottom + 16, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface, marginTop: 12 }}>
        <Press accessibilityLabel={muted ? "Turn the mic on" : "Turn the mic off"} accessibilityState={{ selected: muted }} onPress={toggleMute} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: muted ? c.ink : c.lineStrong, backgroundColor: muted ? c.ink : c.surface, alignItems: "center", justifyContent: "center" }}>
          {muted ? <MicOff size={19} color={c.onInk} /> : <Mic size={19} color={c.ink2} />}
        </Press>
        <TalkButton phase={phase} muted={muted} onHold={(on) => engine.hold(on)} onSend={() => engine.finish()} onInterrupt={interrupt} />
        <Press accessibilityLabel="End" onPress={() => router.back()} style={{ height: 48, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, justifyContent: "center" }}>
          <Txt variant="small" style={{ fontFamily: font.sans550 }}>
            End
          </Txt>
        </Press>
      </View>
    </View>
  );
}

/** One control for the moment: hold to talk while listening, send while you talk, interrupt while Cortex speaks. */
function TalkButton({ phase, muted, onHold, onSend, onInterrupt }: { phase: Phase; muted: boolean; onHold: (on: boolean) => void; onSend: () => void; onInterrupt: () => void }) {
  const { c } = useTheme();
  const speaking = phase === "speaking" || phase === "thinking";
  const hearing = phase === "hearing";
  const label = speaking ? "Interrupt" : hearing ? "Send now" : phase === "listening" ? "Hold to talk" : phase === "approval" ? "Waiting for approval" : "Working";
  const disabled = muted || phase === "approval" || phase === "starting" || phase === "transcribing";
  return (
    <Press
      accessibilityLabel={label}
      disabled={disabled}
      onLongPress={() => phase === "listening" && (haptic.tap(), onHold(true))}
      delayLongPress={180}
      onPressOut={() => phase === "hearing" && onHold(false)}
      onPress={() => (speaking ? onInterrupt() : hearing ? onSend() : undefined)}
      style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: c.ink, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1 }}
    >
      {speaking ? <Square size={20} color={c.onInk} fill={c.onInk} /> : hearing ? <ArrowUp size={24} color={c.onInk} /> : <Mic size={24} color={c.onInk} />}
    </Press>
  );
}
