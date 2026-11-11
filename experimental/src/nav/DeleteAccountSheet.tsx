import { useState } from "react";
import { View } from "react-native";
import { useClerk } from "@clerk/expo";
import { api } from "@/api/client";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { Trash2 } from "@/ui/icons";
import { Button, Field, Notice, Txt } from "@/ui/primitives";
import { Sheet } from "@/ui/Sheet";

/** Delete account and all its data (the web's /api/me DELETE). Type DELETE to confirm, so a stray tap can't do it. */
export function DeleteAccountSheet({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
  const { c } = useTheme();
  const { signOut } = useClerk();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api("/api/me", { method: "DELETE", json: { confirm: true }, timeoutMs: 60_000 });
      haptic.success();
      onClose();
      await signOut().catch(() => {});
    } catch (e) {
      haptic.error();
      setProblem(e instanceof Error ? e.message : "Your account couldn't be deleted just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Delete your account">
      <View style={{ paddingHorizontal: 20, paddingBottom: 12, gap: 12 }}>
        <Txt variant="body" tone="ink2">
          This deletes <Txt variant="body" style={{ fontFamily: font.sans550 }}>{email}</Txt> and everything Cortex keeps for it: chats and shared links, uploaded files,
          memories, connected apps and usage. It happens at once and can't be undone.
        </Txt>
        <Field label="Type DELETE to confirm" mono autoCapitalize="characters" autoCorrect={false} value={typed} onChangeText={setTyped} />
        {problem && <Notice text={problem} />}
        <Button kind="danger" label="Delete my account and data" icon={<Trash2 size={16} color="#ffffff" />} busy={busy} disabled={typed.trim() !== "DELETE"} onPress={() => void remove()} />
        <Button kind="ghost" label="Keep my account" onPress={onClose} style={{ alignSelf: "center" }} />
      </View>
    </Sheet>
  );
}
