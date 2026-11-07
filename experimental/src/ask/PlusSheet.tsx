import { View } from "react-native";
import { AudioLines, Paperclip } from "@/ui/icons";
import type { RunMode } from "@cortex/shared";
import { useTheme } from "@/theme/ThemeProvider";
import { Rule, Txt } from "@/ui/primitives";
import { Segmented } from "@/ui/Segmented";
import { Sheet, SheetRow } from "@/ui/Sheet";

/** Everything behind +: attach files, voice mode, and Fast or Deep. */
export function PlusSheet({ open, onClose, mode, onMode, onAttach, onVoice, voiceAvailable }: {
  open: boolean;
  onClose: () => void;
  mode: RunMode;
  onMode: (m: RunMode) => void;
  onAttach: () => void;
  onVoice?: () => void;
  voiceAvailable: boolean;
}) {
  const { c } = useTheme();
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetRow icon={<Paperclip size={18} color={c.muted} strokeWidth={1.75} />} label="Attach files" trailing={<Txt variant="note" tone="hair">Up to 10 MB</Txt>} onPress={() => (onClose(), onAttach())} />
      {onVoice && (
        <SheetRow
          icon={<AudioLines size={18} color={voiceAvailable ? c.accent : c.hair} strokeWidth={1.75} />}
          label="Voice mode"
          trailing={<Txt variant="note" tone="hair">{voiceAvailable ? "English · हिन्दी · मराठी" : "Not set up"}</Txt>}
          onPress={voiceAvailable ? () => (onClose(), onVoice()) : undefined}
        />
      )}
      <Rule style={{ marginVertical: 6 }} />
      <View style={{ paddingHorizontal: 20, paddingVertical: 8, gap: 10 }}>
        <Segmented<RunMode>
          label="Answer mode"
          value={mode}
          onChange={onMode}
          options={[
            { value: "fast", label: "Fast" },
            { value: "deep", label: "Deep" },
          ]}
        />
        <Txt variant="note" tone="muted">
          {mode === "fast" ? "One quick pass over your sources." : "Plans, searches your apps side by side and checks every claim."}
        </Txt>
      </View>
    </Sheet>
  );
}
