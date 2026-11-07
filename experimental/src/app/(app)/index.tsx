import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import { ArrowDown, ChevronRight, CornerDownRight, SquarePen } from "lucide-react-native";
import type { RunMode } from "@cortex/shared";
import type { Turn } from "@/agent/reduce";
import { normalizeTurn } from "@/agent/versions";
import { api } from "@/api/client";
import { Composer, type PendingFile } from "@/ask/Composer";
import { PlusSheet } from "@/ask/PlusSheet";
import { TurnView } from "@/ask/TurnView";
import { useBrief } from "@/brief/seen";
import { uploadFile } from "@/files/upload";
import { haptic } from "@/haptics";
import { agent, chats, useAgentState } from "@/state";
import { useWorkspace } from "@/state/workspace";
import { prefs } from "@/storage";
import { useTheme } from "@/theme/ThemeProvider";
import { raise } from "@/theme/tokens";
import { Press, Rule, Txt } from "@/ui/primitives";
import { toast } from "@/ui/toast";
import { IconButton, TopBar } from "@/ui/TopBar";

// The web's built-in starter questions, used until the person's own brief has written some.
const DEMO_SUGGESTIONS = ["What changed in Orbit this week, and what's at risk?", "What's due in the next 7 days?", "Is anything blocking the beta?", "Draft a Slack update about the new Demo Day date", "Who is waiting on me for a reply?", "Which pull requests need my review?"];
const LIVE_SUGGESTIONS = ["What changed in my projects this week?", "What's due in the next 7 days?", "Summarize unread emails that need a reply", "What meetings do I have tomorrow?", "Who is waiting on me for a reply?", "Which deadlines moved recently?"];
const pick = (list: string[]) => [...list].sort(() => Math.random() - 0.5).slice(0, 4);

export default function Ask() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLocalSearchParams<{ t?: string }>();
  const { turns, busy, serverThreadId } = useAgentState();
  const info = useWorkspace();
  const workspace = info?.workspace ?? "demo";
  const [localId, setLocalId] = useState<string>(() => crypto.randomUUID());
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [mode, setModeState] = useState<RunMode>(() => (prefs.getString("cortex.mode") === "fast" ? "fast" : "deep"));
  const [plus, setPlus] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const asked = useRef(false);
  const [saveTick, setSaveTick] = useState(0);
  const list = useRef<FlatList<Turn>>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const latest = turns.at(-1);

  const setMode = (m: RunMode) => {
    setModeState(m);
    prefs.set("cortex.mode", m);
  };

  // ?t=<id> opens a saved chat as it was; ?t=new (or nothing) starts a fresh one.
  useEffect(() => {
    if (t && t !== "new" && t !== localId) {
      const saved = chats.get(t);
      asked.current = false;
      agent.load(saved?.turns.map(normalizeTurn).map((x) => (x.done ? x : { ...x, done: true, error: x.error ?? "Stopped before it finished." })), saved?.serverThreadId);
      setLocalId(t);
      following.current = true;
      setAway(false);
    } else if ((!t || t === "new") && (turns.length || localId === t)) {
      asked.current = false;
      agent.load();
      setLocalId(crypto.randomUUID());
      setFiles([]);
    }
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saved when a question starts and when its answer (or a decision) finishes; just opening a chat doesn't reorder it.
  useEffect(() => {
    if (!asked.current || !turns.length) return;
    chats.save({ id: localId, title: turns[0]!.question, updatedAt: Date.now(), serverThreadId, turns });
    if (!busy) asked.current = false;
  }, [turns.length, busy, saveTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // A run just ended: a light tick for an answer, a buzz for an error, nothing for Stop.
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy && latest) {
      if (latest.error && latest.error !== "Stopped.") haptic.error();
      else if (latest.answer && !latest.error) haptic.success();
    }
    wasBusy.current = busy;
  }, [busy, latest]);

  useEffect(() => {
    if (!latest) void api<{ enabled: boolean }>("/api/voice/status").then((r) => setVoiceOn(r.enabled), () => setVoiceOn(false));
  }, [!latest]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useCallback(
    (q: string) => {
      const question = q.trim();
      if (!question || agent.get().busy) return;
      setDraft("");
      following.current = true;
      setAway(false);
      if (agent.get().turns.length === 0) {
        router.setParams({ t: localId });
        void api<{ title?: string | null }>("/api/title", { method: "POST", json: { question } }).then((b) => b.title && chats.setAutoTitle(localId, question, b.title), () => {});
      }
      asked.current = true;
      const ready = files.filter((f) => f.status === "ready" && f.id).map((f) => ({ id: f.id!, name: f.name, size: f.size }));
      setFiles([]);
      void agent.ask(question, { mode, attachments: ready });
    },
    [files, localId, mode],
  );

  const attach = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    for (const a of res.assets) {
      const key = crypto.randomUUID();
      setFiles((all) => [...all, { key, name: a.name, size: a.size ?? 0, status: "uploading", progress: 0 }]);
      uploadFile({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType }, (p) => setFiles((all) => all.map((f) => (f.key === key ? { ...f, progress: p } : f)))).then(
        (saved) => setFiles((all) => all.map((f) => (f.key === key ? { ...f, status: "ready", id: saved.id } : f))),
        (err: Error) => {
          setFiles((all) => all.map((f) => (f.key === key ? { ...f, status: "error" } : f)));
          toast(`Couldn't attach ${a.name}: ${err.message}`);
        },
      );
    }
  };

  const onDecide = (turnId: string) => async (id: string, d: "approve" | "reject", e?: Record<string, unknown>) => {
    await agent.decide(turnId, id, d, e);
    asked.current = true;
    setSaveTick((n) => n + 1);
  };
  const retry = (turnId: string, question?: string) => {
    if (busy) return;
    following.current = true;
    asked.current = true;
    haptic.tap();
    void agent.regenerate(turnId, question);
  };
  const switchVersion = (turnId: string, v: number) => {
    agent.selectVersion(turnId, v);
    asked.current = true;
    setSaveTick((n) => n + 1);
  };

  // Follow a streaming answer; scrolling up stops following and offers the way back.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const atEnd = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 48;
    if (atEnd !== following.current) {
      following.current = atEnd;
      setAway(!atEnd);
    }
  };
  const toLatest = () => {
    following.current = true;
    setAway(false);
    list.current?.scrollToEnd({ animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface }}>
      <TopBar
        center={latest ? undefined : <BriefPill />}
        title={latest ? chats.get(localId)?.title ?? latest.question : undefined}
        right={
          latest ? (
            <IconButton label="New chat" onPress={() => router.setParams({ t: "new" })}>
              <SquarePen size={20} color={c.ink2} strokeWidth={1.75} />
            </IconButton>
          ) : undefined
        }
      />

      {latest ? (
        <FlatList
          ref={list}
          data={turns}
          keyExtractor={(_, i) => String(i)} // by position: a regenerated turn keeps its place while its attempt id changes
          onScroll={onScroll}
          scrollEventThrottle={32}
          onContentSizeChange={() => following.current && list.current?.scrollToEnd({ animated: false })}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
          ItemSeparatorComponent={() => <Rule style={{ marginTop: 36, marginBottom: 28 }} />}
          renderItem={({ item }) => (
            <TurnView
              turn={item}
              chatId={localId}
              onDecide={onDecide(item.id)}
              onRetry={busy ? undefined : () => retry(item.id)}
              onEdit={busy ? undefined : (q) => retry(item.id, q)}
              onVersion={(v) => switchVersion(item.id, v)}
            />
          )}
        />
      ) : (
        <Empty workspace={workspace} onAsk={submit} />
      )}

      {away && (
        <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)} style={{ position: "absolute", alignSelf: "center", bottom: 150 + insets.bottom }}>
          <Press onPress={toLatest} style={[{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.surface, paddingHorizontal: 14, minHeight: 38 }, raise(scheme)]}>
            <ArrowDown size={14} color={c.ink2} />
            <Txt variant="small" tone="ink2" style={{ fontSize: 13 }}>
              {busy ? "Follow the answer" : "Jump to latest"}
            </Txt>
          </Press>
        </Animated.View>
      )}

      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 10, backgroundColor: c.surface }}>
          {latest?.done && latest.followups.length > 0 && !busy && (
            <Animated.ScrollView entering={FadeIn.duration(200)} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10, paddingHorizontal: 2 }}>
              {latest.followups.slice(0, 3).map((f) => (
                <Press key={f} onPress={() => submit(f)} style={{ flexDirection: "row", alignItems: "center", gap: 6, maxWidth: 280, borderRadius: 16, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingLeft: 10, paddingRight: 12, minHeight: 36 }}>
                  <CornerDownRight size={14} color={c.hair} />
                  <Txt variant="small" tone="ink2" numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
                    {f}
                  </Txt>
                </Press>
              ))}
            </Animated.ScrollView>
          )}
          <Composer
            value={draft}
            onChange={setDraft}
            onSubmit={() => submit(draft)}
            onStop={() => agent.stop()}
            busy={busy}
            mode={mode}
            onPlus={() => setPlus(true)}
            placeholder={latest ? "Ask a follow-up…" : "Ask anything about your work…"}
            files={files}
            onRemove={(key) => setFiles((all) => all.filter((f) => f.key !== key))}
          />
        </View>
      </KeyboardStickyView>

      <PlusSheet
        open={plus}
        onClose={() => setPlus(false)}
        mode={mode}
        onMode={setMode}
        onAttach={() => void attach()}
        voiceAvailable={voiceOn}
        onVoice={latest ? undefined : () => router.push({ pathname: "/voice", params: { t: localId } })}
      />
    </View>
  );
}

/** The opening: date and live apps, a Fraunces greeting, the brief's headline, and four starter questions as ruled rows. */
function Empty({ workspace, onAsk }: { workspace: "demo" | "live"; onAsk: (q: string) => void }) {
  const first = useUser().user?.firstName;
  const { state } = useBrief();
  const [starters, setStarters] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(prefs.getString(`cortex.starters.${workspace}`) ?? "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return pick(workspace === "demo" ? DEMO_SUGGESTIONS : LIVE_SUGGESTIONS);
  });
  useEffect(() => {
    // Fresh starters are fetched quietly for next time, so the list on screen never jumps while someone reads it.
    void api<{ questions: string[] | null }>("/api/suggestions")
      .then((d) => d.questions?.length && prefs.set(`cortex.starters.${workspace}`, JSON.stringify(d.questions)))
      .catch(() => {});
    setStarters((s) => s);
  }, [workspace]);
  const h = new Date().getHours();
  const part = h < 5 ? "Working late" : h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  const date = new Date().toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const headline = state?.brief?.cards.length ? state.brief.headline : null;

  return (
    <Animated.ScrollView entering={FadeIn.duration(240)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 16 }}>
      <Txt variant="readout" tone="muted">
        {date}
        {workspace === "demo" ? "  /  Sample" : ""}
      </Txt>
      <Txt variant="display" accessibilityRole="header" style={{ marginTop: 10 }}>
        {part}
        {first ? `, ${first}` : ""}.
      </Txt>
      {headline && (
        <Txt variant="body" tone="muted" style={{ marginTop: 8, fontSize: 16, lineHeight: 25 }}>
          {headline}
        </Txt>
      )}
      <View style={{ marginTop: 24 }}>
        {starters.map((s, i) => (
          <Animated.View key={s} entering={FadeInDown.delay(40 * Math.min(i, 8)).duration(220)}>
            <Press onPress={() => onAsk(s)} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 10 }}>
              <Txt variant="body" tone="ink2" style={{ flex: 1 }}>
                {s}
              </Txt>
              <ChevronRightIcon />
            </Press>
            <Rule />
          </Animated.View>
        ))}
      </View>
    </Animated.ScrollView>
  );
}

function ChevronRightIcon() {
  const { c } = useTheme();
  return <ChevronRight size={16} color={c.hair} />;
}

/** "Brief · 4 new" at the top of a new chat: the daily brief one tap away. Hidden when nothing is new. */
function BriefPill() {
  const { c } = useTheme();
  const { unseen } = useBrief();
  if (!unseen) return null;
  return (
    <Animated.View entering={FadeIn.duration(220)}>
      <Press accessibilityLabel={`Brief, ${unseen} new`} onPress={() => router.navigate("/brief")} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 16, backgroundColor: c.accentSoft, paddingHorizontal: 12, minHeight: 32 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
        <Txt variant="small" tone="accentInk" style={{ fontSize: 13 }}>
          Brief · {unseen} new
        </Txt>
      </Press>
    </Animated.View>
  );
}
