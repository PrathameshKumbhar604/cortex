import { useRef, useState } from "react";
import { FlatList, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Button, Rule, Txt, Wordmark } from "@/ui/primitives";

export interface Page {
  title: string;
  body: string;
}

/** Swipeable pages with story-style progress bars, a Skip, and a final button. Used by the tour and the welcome back. */
export function Pager({ pages, kicker, finalLabel, onDone }: { pages: Page[]; kicker: string; finalLabel: string; onDone: () => void }) {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Page>>(null);
  const [i, setI] = useState(0);
  const last = i === pages.length - 1;

  const go = (n: number) => {
    list.current?.scrollToIndex({ index: n, animated: true });
    setI(n);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}>
      <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 24 }} accessibilityLabel={`Step ${i + 1} of ${pages.length}`}>
        {pages.map((_, n) => (
          <View key={n} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: n <= i ? c.accent : c.line }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, marginTop: 20 }}>
        <Wordmark />
        {!last && <Button kind="ghost" label="Skip" onPress={onDone} />}
      </View>

      <FlatList
        ref={list}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.title}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={(e) => {
          const n = Math.round(e.nativeEvent.contentOffset.x / width);
          if (n !== i) haptic.select();
          setI(n);
        }}
        renderItem={({ item, index }) => (
          <View style={{ width, paddingHorizontal: 24, justifyContent: "center" }}>
            <Txt variant="readout" tone="muted">
              {kicker} · {String(index + 1).padStart(2, "0")} / {String(pages.length).padStart(2, "0")}
            </Txt>
            <Rule strong style={{ marginTop: 12, marginBottom: 20 }} />
            <Txt variant="display" accessibilityRole="header">
              {item.title}
            </Txt>
            <Txt variant="body" tone="ink2" style={{ marginTop: 16, fontSize: 16, lineHeight: 26 }}>
              {item.body}
            </Txt>
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24 }}>
        <Button label={last ? finalLabel : "Next"} onPress={() => (last ? (haptic.success(), onDone()) : go(i + 1))} />
      </View>
    </View>
  );
}
