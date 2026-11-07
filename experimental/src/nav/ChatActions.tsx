import { useEffect, useState } from "react";
import { View } from "react-native";
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react-native";
import { haptic } from "@/haptics";
import { chats } from "@/state";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Field } from "@/ui/primitives";
import { Sheet, SheetRow } from "@/ui/Sheet";
import { toast } from "@/ui/toast";

/** Long-press on a chat: pin, rename, delete (with Undo). */
export function ChatActions({ id, onClose, onDeleted }: { id: string | null; onClose: () => void; onDeleted: (id: string) => void }) {
  const { c } = useTheme();
  const chat = id ? chats.get(id) : undefined;
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");
  useEffect(() => {
    setRenaming(false);
    setTitle(chat?.title ?? "");
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const icon = (I: typeof Pin, color = c.muted) => <I size={18} color={color} strokeWidth={1.75} />;

  return (
    <Sheet open={!!chat} onClose={onClose} title={chat?.title}>
      {renaming ? (
        <View style={{ paddingHorizontal: 20, paddingVertical: 8, gap: 12 }}>
          <Field label="Name" autoFocus value={title} onChangeText={setTitle} maxLength={120} returnKeyType="done" onSubmitEditing={() => save()} />
          <Button label="Save" onPress={() => save()} disabled={!title.trim()} />
        </View>
      ) : (
        <>
          <SheetRow
            icon={icon(chat?.pinned ? PinOff : Pin)}
            label={chat?.pinned ? "Unpin" : "Pin"}
            onPress={() => {
              chats.update(id!, { pinned: !chat?.pinned });
              haptic.select();
              onClose();
            }}
          />
          <SheetRow icon={icon(Pencil)} label="Rename" onPress={() => setRenaming(true)} />
          <SheetRow
            icon={icon(Trash2, c.risk)}
            label="Delete"
            danger
            onPress={() => {
              const gone = chats.remove(id!);
              onDeleted(id!);
              onClose();
              if (gone) toast("Chat deleted", { label: "Undo", run: () => chats.restore(gone) });
            }}
          />
        </>
      )}
    </Sheet>
  );

  function save() {
    if (!title.trim() || !id) return;
    chats.update(id, { title: title.trim() });
    onClose();
  }
}
