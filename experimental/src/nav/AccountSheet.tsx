import { useState } from "react";
import { ScrollView, Switch, View } from "react-native";
import type { Href } from "expo-router";
import { useClerk, useUser } from "@clerk/expo";
import { Brain, Cable, Compass, LogOut, Trash2 } from "@/ui/icons";
import { DeleteAccountSheet } from "./DeleteAccountSheet";
import { useOnboarding } from "@/auth/OnboardingProvider";
import { haptic } from "@/haptics";
import { useWorkspace } from "@/state/workspace";
import { prefs } from "@/storage";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { font } from "@/theme/type";
import { LANGS, PERSONAS, isGender, isLang, type VoiceGender, type VoiceLang } from "@/voice/personas";
import { Rule, Txt } from "@/ui/primitives";
import { Segmented } from "@/ui/Segmented";
import { Sheet, SheetRow } from "@/ui/Sheet";
import { Avatar } from "./DrawerContent";

export function readVoice(): { lang: VoiceLang; gender: VoiceGender } {
  const [lang, gender] = (prefs.getString("cortex.voice") ?? "").split(":");
  return { lang: isLang(lang) ? lang : "en", gender: isGender(gender) ? gender : "female" };
}

/** The web's account menu, as a sheet: who you are, Sources, Memory, the tour, theme, haptics, voice, sign out. */
export function AccountSheet({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (href: Href) => void }) {
  const { c, pref, setPref } = useTheme();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { replay } = useOnboarding();
  const info = useWorkspace();
  const [haptics, setHaptics] = useState(() => prefs.getBool("cortex.haptics", true));
  const [deleting, setDeleting] = useState(false);
  const [otherChats, setOtherChats] = useState(() => prefs.getBool("cortex.useOtherChats", false));
  const [voice, setVoice] = useState(readVoice);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name = user?.fullName || email.split("@")[0] || "You";
  const icon = (I: typeof Cable) => <I size={18} color={c.muted} strokeWidth={1.75} />;
  const count = info?.connectors.filter((s) => s.connected).length;
  const pickVoice = (lang: VoiceLang, gender: VoiceGender) => {
    prefs.set("cortex.voice", `${lang}:${gender}`);
    setVoice({ lang, gender });
  };
  const persona = PERSONAS.find((p) => p.lang === voice.lang && p.gender === voice.gender);

  return (
    <>
    <Sheet open={open} onClose={onClose} maxHeight={0.9}>
      <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Avatar letter={name.charAt(0)} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="item" numberOfLines={1} style={{ fontFamily: font.sans550 }}>
              {name}
            </Txt>
            <Txt variant="note" tone="muted" numberOfLines={1}>
              {email}
            </Txt>
          </View>
        </View>
        <Rule />
        <SheetRow
          icon={icon(Cable)}
          label="Sources"
          onPress={() => onNavigate("/connections")}
          trailing={count != null ? <Txt variant="readout" tone="muted">{info?.workspace === "demo" ? "Sample" : `${count} on`}</Txt> : undefined}
        />
        <SheetRow icon={icon(Brain)} label="Memory" onPress={() => onNavigate("/memory")} />
        <SheetRow
          icon={icon(Compass)}
          label="Take the tour"
          onPress={() => {
            onClose();
            replay();
          }}
        />
        <Rule />
        <Setting label="Theme">
          <Segmented<ThemePref>
            label="Theme"
            compact
            value={pref}
            onChange={setPref}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Setting>
        <Setting label="Haptics">
          <Switch
            accessibilityLabel="Haptics"
            value={haptics}
            trackColor={{ true: c.accent, false: c.lineStrong }}
            thumbColor={c.surface}
            onValueChange={(v) => {
              prefs.setBool("cortex.haptics", v);
              setHaptics(v);
              if (v) haptic.tap();
            }}
          />
        </Setting>
        <Setting label="Use my other chats" note="Let Cortex look at your earlier chats when it answers.">
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
        </Setting>
        <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 10 }}>
          <Txt variant="item">Voice</Txt>
          <Segmented<VoiceLang> label="Voice language" value={voice.lang} onChange={(l) => pickVoice(l, voice.gender)} options={LANGS.map((l) => ({ value: l.id, label: l.native }))} />
          <Segmented<VoiceGender>
            label="Voice"
            value={voice.gender}
            onChange={(g) => pickVoice(voice.lang, g)}
            options={(["female", "male"] as const).map((g) => ({ value: g, label: PERSONAS.find((p) => p.lang === voice.lang && p.gender === g)!.name }))}
          />
          {persona && (
            <Txt variant="note" tone="muted">
              {persona.character}
            </Txt>
          )}
        </View>
        <Rule style={{ marginTop: 14 }} />
        <SheetRow
          icon={<LogOut size={18} color={c.risk} strokeWidth={1.75} />}
          label="Sign out"
          danger
          onPress={() => {
            onClose();
            prefs.delete("cortex.workspace");
            void signOut();
          }}
        />
        <SheetRow
          icon={<Trash2 size={18} color={c.muted} strokeWidth={1.75} />}
          label="Delete account"
          onPress={() => {
            onClose();
            setDeleting(true);
          }}
        />
      </ScrollView>
    </Sheet>
    {/* Beside the account sheet, not inside it: that one closes as this one opens. */}
    <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} email={email} />
    </>
  );
}

function Setting({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 20 }}>
      <View style={{ flex: 1 }}>
        <Txt variant="item">{label}</Txt>
        {note && (
          <Txt variant="note" tone="muted">
            {note}
          </Txt>
        )}
      </View>
      {children}
    </View>
  );
}
