import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { FileText, Trash2, Upload } from "@/ui/icons";
import { api } from "@/api/client";
import { formatSize, uploadFile, type FileInfo } from "@/files/upload";
import { haptic } from "@/haptics";
import { relativeDays } from "@/lib/format";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Notice, Press, Rule, Txt } from "@/ui/primitives";
import { Screen } from "@/ui/Screen";
import { toast } from "@/ui/toast";

/** Your uploaded files: Cortex searches them like any other source. */
export default function Files() {
  const { c } = useTheme();
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setFiles((await api<{ files: FileInfo[] }>("/api/files")).files);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your files.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  const pick = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    setUploading(res.assets.map((a) => a.name));
    const results = await Promise.allSettled(res.assets.map((a) => uploadFile({ uri: a.uri, name: a.name, size: a.size, mimeType: a.mimeType })));
    results.forEach((r, i) => toast(r.status === "rejected" ? `Couldn't upload ${res.assets[i].name}: ${(r.reason as Error).message}` : `${res.assets[i].name} uploaded`));
    if (results.some((r) => r.status === "fulfilled")) haptic.success();
    setUploading([]);
    await load();
  };

  const remove = async (f: FileInfo) => {
    try {
      await api(`/api/files/${f.id}`, { method: "DELETE" });
      haptic.tap();
      setFiles((all) => all?.filter((x) => x.id !== f.id) ?? null);
      toast(`${f.name} deleted`);
    } catch {
      toast("Couldn't delete that file. Try again in a moment.");
    }
  };

  return (
    <Screen
      title="Your files"
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      refreshing={refreshing}
      kicker={
        <Txt variant="body" tone="muted">
          Cortex searches these like any other source. PDF, text, Markdown, CSV, JSON or code are searchable; other files are stored but not read. Up to 10 MB each.
        </Txt>
      }
    >
      <Button label={uploading.length ? `Uploading ${uploading.length}…` : "Upload files"} icon={<Upload size={16} color={c.onInk} />} busy={uploading.length > 0} onPress={() => void pick()} style={{ alignSelf: "flex-start" }} />
      {error && (
        <View style={{ marginTop: 16 }}>
          <Notice text={error} />
        </View>
      )}
      <View style={{ marginTop: 24 }}>
        {files === null && !error && <ActivityIndicator color={c.accent} />}
        {files?.length === 0 && (
          <Txt variant="body" tone="muted">
            No files yet. Upload one here, or attach it to a question with +.
          </Txt>
        )}
        {!!files?.length && <Rule strong />}
        {files?.map((f, i) => (
          <View key={f.id}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
              <FileText size={18} color={c.muted} strokeWidth={1.75} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="item" numberOfLines={1}>
                  {f.name}
                </Txt>
                <Txt variant="readout" tone="hair" style={{ marginTop: 4 }} numberOfLines={1}>
                  {formatSize(f.size)} · added {relativeDays(f.createdAt)} · {f.searchable ? "searchable" : "stored only"}
                </Txt>
              </View>
              <Press accessibilityLabel={`Delete ${f.name}`} onPress={() => void remove(f)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <Trash2 size={17} color={c.muted} />
              </Press>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
