import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { router } from "expo-router";
import { Brain, FileText, Pencil } from "lucide-react-native";
import { explainError, explainFailure } from "@cortex/shared";
import type { Turn } from "@/agent/reduce";
import { useTheme } from "@/theme/ThemeProvider";
import { font, type as ramp } from "@/theme/type";
import { Button, Press, Rule, Txt } from "@/ui/primitives";
import { Problem } from "@/ui/Problem";
import { ActionCard } from "./ActionCard";
import { Answer } from "./Answer";
import { AnswerActions, VersionSwitch } from "./AnswerActions";
import { citedIds } from "./answerText";
import { Readout } from "./Readout";
import { SourcesPill, SourcesSheet } from "./SourcesSheet";

export const MAX = 2000; // /api/ask's limit

interface Props {
  turn: Turn;
  chatId?: string;
  onDecide: (proposalId: string, d: "approve" | "reject", edits?: Record<string, unknown>) => Promise<unknown>;
  onRetry?: () => void;
  onEdit?: (q: string) => void;
  onVersion: (v: number) => void;
}

/** One question and its answer, laid out like the web: question heading, readout, answer, sources and actions. */
export const TurnView = memo(function TurnView({ turn, chatId, onDecide, onRetry, onEdit, onVersion }: Props) {
  const { c } = useTheme();
  const [sheetAt, setSheetAt] = useState<string | null>(null);
  const verified = turn.groundedness != null || (turn.done && !turn.claims.length);
  const cited = useMemo(() => citedIds(turn.answer, turn.evidence), [turn.answer, turn.evidence]);
  const failures = turn.error ? turn.failures.filter((f) => f.source !== "llm") : turn.failures;
  const jump = useCallback((id: string) => setSheetAt(id), []);
  const learned = turn.memoryWritten.filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);

  return (
    <Animated.View entering={FadeIn.duration(260)}>
      <Question question={turn.question} done={turn.done} onEdit={onEdit} />
      {turn.attachments && turn.attachments.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -4, marginBottom: 12 }}>
          {turn.attachments.map((f) => (
            <View key={f.id} style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: c.line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <FileText size={13} color={c.muted} />
              <Txt variant="note" tone="ink2" numberOfLines={1} style={{ maxWidth: 200 }}>
                {f.name}
              </Txt>
            </View>
          ))}
        </View>
      )}
      <Readout turn={turn} />

      {failures.length > 0 && (
        <View style={{ marginBottom: 16, gap: 4 }}>
          {failures.map((f) => (
            <Problem key={f.source} problem={explainFailure(f)} onRetry={onRetry} />
          ))}
        </View>
      )}

      {turn.answer ? (
        <Answer text={turn.answer} claims={turn.claims} evidence={turn.evidence} verified={verified} streaming={!turn.done && turn.steps.synthesize.status === "active"} onJump={jump} />
      ) : (
        !turn.done && !turn.error && <Skeleton />
      )}

      {!!turn.answer && (turn.evidence.length > 0 || (turn.done && !turn.error)) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 8, marginTop: 2, marginBottom: 12 }}>
          {turn.evidence.length > 0 && <SourcesPill evidence={turn.evidence} cited={cited} onOpen={() => setSheetAt("")} />}
          {turn.done && !turn.error && <AnswerActions turn={turn} chatId={chatId} onRetry={onRetry} onVersion={onVersion} />}
        </View>
      )}

      {turn.error && (
        <View style={{ marginBottom: 16, gap: 6 }}>
          <Problem problem={explainError(turn.error)} onRetry={onRetry} variant="card" />
          {turn.done && <VersionSwitch turn={turn} onVersion={onVersion} />}
        </View>
      )}

      {turn.conflicts.length > 0 && (
        <View style={{ marginVertical: 16 }}>
          <Rule strong />
          {turn.conflicts.map((x, i) => (
            <View key={i}>
              {i > 0 && <Rule />}
              <View style={{ paddingVertical: 12, gap: 4 }}>
                <Txt variant="small" tone="risk" style={{ fontFamily: font.sansSemi }}>
                  Conflict
                </Txt>
                <Txt variant="body" style={{ fontSize: 15.5 }}>
                  {x.summary}
                  {x.evidenceIds.map((id) => {
                    const n = turn.evidence.findIndex((e) => e.id === id) + 1;
                    return n ? (
                      <Txt key={id} variant="cite" tone="accentInk" onPress={() => jump(id)} style={{ backgroundColor: c.accentWash }}>
                        {` ${n} `}
                      </Txt>
                    ) : null;
                  })}
                </Txt>
              </View>
            </View>
          ))}
          <Rule />
        </View>
      )}

      {verified && turn.missing.length > 0 && (
        <View style={{ marginBottom: 16, gap: 4 }}>
          {turn.missing.map((m, i) => (
            <Txt key={i} variant="small" tone="muted">
              Not in your sources: {m}
            </Txt>
          ))}
        </View>
      )}

      {turn.actions.map((a) => (
        <ActionCard key={a.id} proposal={a} onDecide={(d, edits) => onDecide(a.id, d, edits)} />
      ))}

      {turn.done && (learned.length > 0 || turn.memoryUsed.length > 0) && (
        <View style={{ marginTop: 16, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 4 }}>
          <Brain size={12} color={c.accent} />
          {turn.memoryUsed.length > 0 && (
            <Txt variant="readout" tone="muted">
              Used {turn.memoryUsed.length} memor{turn.memoryUsed.length > 1 ? "ies" : "y"}
            </Txt>
          )}
          {learned.map((m) => (
            <Txt key={m.id} variant="small" tone="accentInk" onPress={() => router.navigate("/memory")} style={{ fontSize: 13 }}>
              Learned: “{m.content}”
            </Txt>
          ))}
        </View>
      )}

      {turn.evidence.length > 0 && <SourcesSheet evidence={turn.evidence} cited={cited} query={turn.question} at={sheetAt} onClose={() => setSheetAt(null)} />}
    </Animated.View>
  );
});

/** The question as a Fraunces heading; once answered, a pencil edits it and asks again as a new version. */
function Question({ question, done, onEdit }: { question: string; done: boolean; onEdit?: (q: string) => void }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const q = draft.trim();
  const canSend = !!onEdit && !!q && q !== question.trim();

  if (editing)
    return (
      <View style={{ marginBottom: 12, borderRadius: 14, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface, padding: 12 }}>
        <TextInput
          autoFocus
          multiline
          value={draft}
          maxLength={MAX}
          onChangeText={setDraft}
          accessibilityLabel="Edit your question"
          cursorColor={c.accent}
          selectionColor={c.accent}
          style={[ramp.headline, { color: c.ink, padding: 0, textAlignVertical: "top" }]}
        />
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
          <Button kind="ghost" label="Cancel" onPress={() => setEditing(false)} />
          <Button
            label="Send"
            disabled={!canSend}
            onPress={() => {
              setEditing(false);
              onEdit?.(q);
            }}
          />
        </View>
      </View>
    );

  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, marginBottom: 12 }}>
      <Txt variant="headline" accessibilityRole="header" selectable style={{ flex: 1 }}>
        {question}
      </Txt>
      {done && onEdit && (
        <Press
          accessibilityLabel="Edit question"
          onPress={() => {
            setDraft(question);
            setEditing(true);
          }}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", marginTop: -4, marginRight: -8 }}
        >
          <Pencil size={15} color={c.hair} strokeWidth={1.75} />
        </Press>
      )}
    </View>
  );
}

function Skeleton() {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
  }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View accessibilityLabel="Writing the answer" style={[{ gap: 10, marginBottom: 16 }, style]}>
      {[92, 78, 85].map((w) => (
        <View key={w} style={{ height: 14, width: `${w}%`, borderRadius: 4, backgroundColor: c.shell }} />
      ))}
    </Animated.View>
  );
}
