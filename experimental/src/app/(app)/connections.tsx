import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Check } from "@/ui/icons";
import type { ConnectorStatus } from "@cortex/shared";
import { api } from "@/api/client";
import { Logo } from "@/ask/Logo";
import { connectApp, onForeground } from "@/connections/connect";
import { haptic } from "@/haptics";
import { refreshWorkspace, switchWorkspace, useWorkspace } from "@/state/workspace";
import { useTheme } from "@/theme/ThemeProvider";
import { raise } from "@/theme/tokens";
import { font } from "@/theme/type";
import { Button, Press, Rule, Txt } from "@/ui/primitives";
import { Screen } from "@/ui/Screen";
import { toast } from "@/ui/toast";

const WHAT: Record<string, string> = {
  gmail: "Emails, requests and replies",
  calendar: "Meetings and deadlines",
  tasks: "To-dos and due dates",
  drive: "Docs, reports and files",
  notion: "Specs, goals and notes",
  slack: "Team discussions and blockers",
  github: "Issues, pull requests, milestones",
  web: "Public web pages and search",
};

/** Where Cortex looks: Sample or your own accounts, and each app to connect or disconnect. */
export default function Connections() {
  const { c, scheme } = useTheme();
  const info = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => onForeground(() => void refreshWorkspace()), []);

  const switchTo = async (w: "demo" | "live") => {
    if (info?.workspace === w) return;
    haptic.select();
    try {
      await switchWorkspace(w);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't switch workspace.");
    }
  };
  const connect = async (x: ConnectorStatus) => {
    setBusy(x.id);
    try {
      const ok = await connectApp(x.id, async () => !!(await refreshWorkspace())?.connectors.find((y) => y.id === x.id)?.connected);
      if (ok) {
        haptic.success();
        toast(`${x.name} is connected`);
      } else toast(`${x.name} isn't connected yet. If you finished signing in, pull down to check again.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Couldn't start ${x.name} sign-in.`);
    } finally {
      setBusy(null);
    }
  };
  const disconnect = async (x: ConnectorStatus) => {
    setBusy(x.id);
    try {
      await api(`/api/connections/${x.id}`, { method: "DELETE" });
      await refreshWorkspace();
      toast(`${x.name} is disconnected. Cortex no longer reads it.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't disconnect.");
    } finally {
      setBusy(null);
      setConfirmOff(null);
    }
  };

  return (
    <Screen
      title="Where Cortex looks"
      onRefresh={async () => {
        setRefreshing(true);
        await refreshWorkspace();
        setRefreshing(false);
      }}
      refreshing={refreshing}
      kicker={
        <Txt variant="body" tone="muted">
          Connect an app once. You sign in with that app directly, and Cortex never sees your password. It reads to answer questions and acts only after you approve each action.
        </Txt>
      }
    >
      <View accessibilityRole="radiogroup" accessibilityLabel="Workspace" style={{ gap: 10 }}>
        {(
          [
            { id: "demo", label: "Sample workspace", note: "Fictional student team data. Nothing leaves Cortex." },
            { id: "live", label: "Your accounts", note: info?.liveAvailable ? "Your own Gmail, Slack, GitHub and more." : "Not available on this Cortex yet." },
          ] as const
        ).map((w) => {
          const on = info?.workspace === w.id;
          const off = w.id === "live" && info ? !info.liveAvailable : false;
          return (
            <Press
              key={w.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: off }}
              disabled={off}
              onPress={() => void switchTo(w.id)}
              style={[{ borderRadius: 12, borderWidth: 1, padding: 16, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentWash : c.surface, opacity: off ? 0.6 : 1 }, raise(scheme)]}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Txt variant="item" style={{ fontFamily: font.sans550 }}>
                  {w.label}
                </Txt>
                {on && <Check size={16} color={c.accent} />}
              </View>
              <Txt variant="small" tone="muted" style={{ marginTop: 4 }}>
                {w.note}
              </Txt>
            </Press>
          );
        })}
      </View>

      <View style={{ marginTop: 32 }}>
        {info?.workspace === "demo" && info.liveAvailable && (
          <Txt variant="small" tone="muted" style={{ marginBottom: 12 }}>
            Choose Your accounts above to connect your own apps.
          </Txt>
        )}
        <Rule strong />
        {!info && <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />}
        {(info?.connectors ?? [])
          .filter((x) => x.kind !== "upload")
          .map((x, i) => (
            <View key={x.id}>
              {i > 0 && <Rule />}
              <View style={{ paddingVertical: 16, gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Logo source={x.id} size={20} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="item">{x.name}</Txt>
                    <Txt variant="small" tone="muted">
                      {WHAT[x.id] ?? "Connected through MCP"}
                      {x.canAct ? " · can act with your approval" : " · read-only"}
                    </Txt>
                  </View>
                </View>
                {!x.connected && x.detail && busy !== x.id && (
                  <Txt variant="note" tone="warn">
                    {x.detail}
                  </Txt>
                )}
                {busy === x.id && !x.connected && (
                  <Txt variant="note" tone="ink2" accessibilityLiveRegion="polite">
                    Finish signing in to {x.name}, then close the sheet. This page updates by itself.
                  </Txt>
                )}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                  {x.connected ? (
                    confirmOff === x.id ? (
                      <>
                        <Button kind="ghost" label="Cancel" onPress={() => setConfirmOff(null)} />
                        <Button kind="danger" label={`Disconnect ${x.name}`} busy={busy === x.id} onPress={() => void disconnect(x)} />
                      </>
                    ) : (
                      <>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginRight: "auto" }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.ok }} />
                          <Txt variant="small" tone="ok" style={{ fontSize: 13 }}>
                            {x.kind === "demo" ? "Sample data" : "Connected"}
                          </Txt>
                        </View>
                        {x.kind === "composio" && <Button kind="ghost" label="Disconnect" onPress={() => setConfirmOff(x.id)} />}
                      </>
                    )
                  ) : (
                    <Button
                      label={busy === x.id ? "Waiting…" : x.detail ? "Reconnect" : "Connect"}
                      busy={busy === x.id}
                      disabled={!!busy || info?.workspace !== "live"}
                      onPress={() => void connect(x)}
                    />
                  )}
                </View>
              </View>
            </View>
          ))}
      </View>
    </Screen>
  );
}
