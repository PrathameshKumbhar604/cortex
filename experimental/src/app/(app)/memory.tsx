import { useCallback, useEffect, useState } from "react";
import { Switch, TextInput, View } from "react-native";
import { Pin, PinOff, Plus, Trash2 } from "@/ui/icons";
import type { MemoryItem, MemoryKind } from "@cortex/shared";
import { api } from "@/api/client";
import { haptic } from "@/haptics";
import { relativeDays } from "@/lib/format";
import { prefs } from "@/storage";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Button, Notice, Press, Rule, Txt } from "@/ui/primitives";
import { Screen } from "@/ui/Screen";
import { Segmented } from "@/ui/Segmented";
import { toast } from "@/ui/toast";

const KIND_LABEL: Record<MemoryKind, string> = { priority: "Priorities", preference: "Preferences", decision: "Decisions", person: "People", fact: "Facts" };
const SINGULAR: Record<MemoryKind, string> = { priority: "Priority", preference: "Preference", decision: "Decision", person: "Person", fact: "Fact" };
const ORDER: MemoryKind[] = ["priority", "preference", "decision", "person", "fact"];

/** What Cortex remembers, grouped like the web, with pin, edit and forget, and "Teach Cortex something". */
export default function Memory() {
  const { c } = useTheme();
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("fact");
  const [otherChats, setOtherChats] = useState(() => prefs.getBool("cortex.useOtherChats", false));

  const load = useCallback(async () => {
    try {
      setItems((await api<{ items: MemoryItem[] }>("/api/memory")).items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load memories.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const mutate = async (path: string, init: { method: string; json?: unknown }) => {
    try {
      await api(path, init);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't save. Try again.");
    }
  };
  const add = async () => {
    if (draft.trim().length < 3) return;
    await mutate("/api/memory", { method: "POST", json: { content: draft, kind } });
    haptic.success();
    setDraft("");
    setAdding(false);
  };
  const groups = ORDER.map((k) => ({ k, list: (items ?? []).filter((m) => m.kind === k) })).filter((g) => g.list.length);

  return (
    <Screen
      title="What Cortex remembers"
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      refreshing={refreshing}
      kicker={
        <Txt variant="body" tone="muted">
          As you chat, Cortex saves what will still matter next week: your priorities, preferences, people and decisions. Small talk and anything that looks like a password are never saved. Pinned memories never fade.
        </Txt>
      }
    >
      <Rule />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
        <View style={{ flex: 1 }}>
          <Txt variant="item" style={{ fontFamily: font.sans550 }}>
            Use my other chats
          </Txt>
          <Txt variant="small" tone="muted">
            Cortex can look back at your past chats when they help, and says which chat it used.
          </Txt>
        </View>
        <Switch
          accessibilityLabel="Use my other chats"
          value={otherChats}
          trackColor={{ true: c.accent, false: c.lineStrong }}
          thumbColor={c.surface}
          onValueChange={(v) => {
            prefs.setBool("cortex.useOtherChats", v);
            setOtherChats(v);
          }}
        />
      </View>
      <Rule />

      {adding ? (
        <View style={{ marginTop: 20, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: c.accent, padding: 12 }}>
          <TextInput
            autoFocus
            value={draft}
            onChangeText={setDraft}
            maxLength={500}
            placeholder="Teach Cortex something…"
            placeholderTextColor={c.hair}
            cursorColor={c.accent}
            multiline
            accessibilityLabel="Teach Cortex something"
            style={{ fontFamily: font.sans, fontSize: 16, color: c.ink, minHeight: 44 }}
          />
          <Segmented<MemoryKind> label="Kind" value={kind} onChange={setKind} compact options={ORDER.map((k) => ({ value: k, label: SINGULAR[k] }))} />
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <Button kind="ghost" label="Cancel" onPress={() => setAdding(false)} />
            <Button label="Remember" onPress={() => void add()} disabled={draft.trim().length < 3} />
          </View>
        </View>
      ) : (
        <Press onPress={() => setAdding(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, minHeight: 44 }}>
          <Plus size={15} color={c.muted} />
          <Txt variant="small" tone="muted">
            Add a memory yourself
          </Txt>
        </Press>
      )}

      {error && (
        <View style={{ marginTop: 16 }}>
          <Notice text={error} />
        </View>
      )}
      {items && !items.length && !error && (
        <Txt variant="body" tone="muted" style={{ marginTop: 24 }}>
          Nothing yet. Cortex adds memories as you chat, or teach it something above.
        </Txt>
      )}
      {groups.map(({ k, list }) => (
        <View key={k} style={{ marginTop: 32 }}>
          <Rule strong />
          <Txt variant="title" accessibilityRole="header" style={{ paddingVertical: 10 }}>
            {KIND_LABEL[k]} <Txt variant="title" tone="muted" style={{ fontFamily: font.sans }}>{list.length}</Txt>
          </Txt>
          {list.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <Rule />}
              <Row
                m={m}
                onPin={() => mutate(`/api/memory/${m.id}`, { method: "PATCH", json: { pinned: !m.pinned } })}
                onEdit={(content) => mutate(`/api/memory/${m.id}`, { method: "PATCH", json: { content } })}
                onForget={() => mutate(`/api/memory/${m.id}`, { method: "DELETE" })}
              />
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}

function Row({ m, onPin, onEdit, onForget }: { m: MemoryItem; onPin: () => void; onEdit: (content: string) => void; onForget: () => void }) {
  const { c } = useTheme();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [confirm, setConfirm] = useState(false);
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingVertical: 14 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              accessibilityLabel="Edit memory"
              cursorColor={c.accent}
              onSubmitEditing={() => (setEditing(false), text.trim() && text !== m.content && onEdit(text.trim()))}
              style={{ flex: 1, borderRadius: 8, borderWidth: 1, borderColor: c.accent, paddingHorizontal: 10, minHeight: 44, fontFamily: font.sans, fontSize: 15.5, color: c.ink }}
            />
            <Button kind="ghost" label="Save" onPress={() => (setEditing(false), text.trim() && text !== m.content && onEdit(text.trim()))} />
          </View>
        ) : (
          <Txt variant="item" onPress={() => setEditing(true)} accessibilityHint="Tap to edit">
            {m.content}
          </Txt>
        )}
        <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
          {m.reason}
          {m.source && m.source !== "conversation" && m.source !== "you" ? ` · from ${m.source}` : ""}
        </Txt>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Txt variant="readout" tone="hair">
            {relativeDays(m.createdAt)}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLabel={`Salience ${Math.round(m.salience * 100)}`}>
            <View style={{ width: 56, height: 3, borderRadius: 2, backgroundColor: c.line, overflow: "hidden" }}>
              <View style={{ width: `${Math.round(m.salience * 100)}%`, height: 3, backgroundColor: c.accent }} />
            </View>
            <Txt variant="readout" tone="hair">
              {Math.round(m.salience * 100)}
            </Txt>
          </View>
          {m.expiresAt && !m.pinned && (
            <Txt variant="readout" tone="hair">
              fades {relativeDays(m.expiresAt)}
            </Txt>
          )}
          {m.pinned && (
            <Txt variant="readout" tone="accentInk">
              pinned
            </Txt>
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Press accessibilityLabel={m.pinned ? "Unpin" : "Pin"} onPress={() => (haptic.select(), onPin())} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
          {m.pinned ? <PinOff size={17} color={c.accent} /> : <Pin size={17} color={c.muted} />}
        </Press>
        {confirm ? (
          <Press accessibilityLabel="Forget this memory" onPress={onForget} style={{ paddingHorizontal: 10, minHeight: 40, justifyContent: "center", borderRadius: 8, backgroundColor: c.riskSoft }}>
            <Txt variant="small" tone="risk" style={{ fontFamily: font.sansMedium, fontSize: 13 }}>
              Forget
            </Txt>
          </Press>
        ) : (
          <Press accessibilityLabel="Forget" onPress={() => setConfirm(true)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Trash2 size={17} color={c.muted} />
          </Press>
        )}
      </View>
    </View>
  );
}
