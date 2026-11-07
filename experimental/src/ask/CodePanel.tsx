import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Check, Copy } from "lucide-react-native";
import { haptic } from "@/haptics";
import { terminal } from "@/theme/tokens";
import { font, type as ramp } from "@/theme/type";
import { Press } from "@/ui/primitives";

const SHELL = new Set(["bash", "sh", "shell", "zsh", "console", "powershell", "ps1", "pwsh", "cmd", "bat", "terminal"]);

/** Code always renders in a terminal panel, dark in both themes, with Copy. Long lines scroll sideways; code never wraps. */
export function CodePanel({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <View style={{ marginBottom: 18, borderRadius: 10, borderWidth: 1, borderColor: terminal.line, backgroundColor: terminal.bg, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: terminal.line, paddingLeft: 12, paddingRight: 4, minHeight: 40 }}>
        <Text style={{ fontFamily: font.mono, fontSize: 11.5, color: "#8b919c" }}>{!lang ? "code" : SHELL.has(lang.toLowerCase()) ? "terminal" : lang}</Text>
        <Press accessibilityLabel="Copy code" onPress={() => void copy()} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, minHeight: 36 }}>
          {copied ? <Check size={14} color="#3dd68c" /> : <Copy size={14} color="#a9aeb8" />}
          <Text style={{ fontFamily: font.sans, fontSize: 12.5, color: "#a9aeb8" }}>{copied ? "Copied" : "Copy"}</Text>
        </Press>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}>
        <Text selectable style={[ramp.code, { color: terminal.text }]}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}
