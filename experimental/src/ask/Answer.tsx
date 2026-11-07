import { memo, useEffect, useMemo } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import Markdown, { type ASTNode, type RenderRules } from "react-native-markdown-display";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import type { Claim, Evidence } from "@cortex/shared";
import { haptic } from "@/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { ease, type Palette } from "@/theme/tokens";
import { claimFont, font } from "@/theme/type";
import { CodePanel } from "./CodePanel";
import { CARET, plain, splitPartial, withCitationLinks } from "./answerText";

interface Props {
  text: string;
  claims: Claim[];
  evidence: Evidence[];
  verified: boolean;
  streaming: boolean;
  onJump: (evidenceId: string) => void;
}

/**
 * The answer as full markdown. Its weight is its verification state, like the web: hairline while it is being
 * checked, full weight once checked; sentences only partly backed by their source read lighter on an indigo wash
 * (Android can't draw the web's dotted underline).
 */
export const Answer = memo(function Answer({ text, claims, evidence, verified, streaming, onJump }: Props) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const partial = useMemo(() => claims.filter((x) => x.status === "partial").map((x) => plain(x.text)).filter((t) => t.length > 12), [claims]);
  const styles = useMemo(() => mdStyles(c, verified), [c, verified]);
  const rules = useMemo(() => makeRules(c, partial, evidence, onJump), [c, partial, evidence, onJump]);

  // Settling from hairline to full weight: a short ease on the claim curve (900ms on the web; weight can't tween here).
  const settle = useSharedValue(verified ? 1 : 0.7);
  useEffect(() => {
    settle.value = verified ? withTiming(1, { duration: reduced ? 0 : 600, easing: Easing.bezier(...ease.claim) }) : 0.7;
  }, [verified]); // eslint-disable-line react-hooks/exhaustive-deps
  const anim = useAnimatedStyle(() => ({ opacity: verified ? settle.value : 1 }));

  return (
    <Animated.View style={anim} accessibilityLabel={verified ? undefined : "Answer, still being checked"}>
      <Markdown style={styles} rules={rules} mergeStyle onLinkPress={() => false}>
        {withCitationLinks(text) + (streaming ? CARET : "")}
      </Markdown>
    </Animated.View>
  );
});

function makeRules(c: Palette, partial: string[], evidence: Evidence[], onJump: (id: string) => void): RenderRules {
  return {
    text: (node: ASTNode, _children, _parents, styles, inheritedStyles = {}) => {
      const raw = node.content;
      const caretAt = raw.indexOf(CARET);
      const body = caretAt >= 0 ? raw.slice(0, caretAt) : raw;
      return (
        <Text key={node.key} style={[inheritedStyles, styles.text]}>
          {(partial.length ? splitPartial(body, partial) : [{ text: body, partial: false }]).map((p, i) =>
            p.partial ? (
              <Text key={i} accessibilityHint="Only partly supported by the cited source" style={{ fontFamily: claimFont.partial, color: c.ink2, backgroundColor: c.accentWash }}>
                {p.text}
              </Text>
            ) : (
              p.text
            ),
          )}
          {caretAt >= 0 && <Text style={{ color: c.accent }}>▍</Text>}
        </Text>
      );
    },
    link: (node: ASTNode, children) => {
      const href: string = node.attributes.href ?? "";
      const n = href.startsWith("#cite-") ? Number(href.slice(6)) : 0;
      if (n) {
        const ev = evidence[n - 1];
        if (!ev) return null; // a citation to nothing is dropped
        return (
          <Text
            key={node.key}
            accessibilityRole="button"
            accessibilityLabel={`Source ${n}: ${ev.title}`}
            onPress={() => (haptic.tap(), onJump(ev.id))}
            suppressHighlighting
            style={{ fontFamily: font.monoMedium, fontSize: 11.5, color: c.accentInk, backgroundColor: c.accentWash }}
          >
            {" "}
            {n}
            {" "}
          </Text>
        );
      }
      return (
        <Text key={node.key} accessibilityRole="link" onPress={() => void Linking.openURL(href)} style={{ color: c.accentInk, textDecorationLine: "underline" }}>
          {children}
        </Text>
      );
    },
    fence: (node: ASTNode) => <CodePanel key={node.key} code={node.content.replace(/\n$/, "").replace(CARET, "")} lang={(node as ASTNode & { sourceInfo?: string }).sourceInfo?.trim() || undefined} />,
    code_block: (node: ASTNode) => <CodePanel key={node.key} code={node.content.replace(/\n$/, "").replace(CARET, "")} />,
    table: (node: ASTNode, children, _p, styles) => (
      <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
        <View style={styles.table}>{children}</View>
      </ScrollView>
    ),
  };
}

function mdStyles(c: Palette, verified: boolean) {
  const weight = verified ? claimFont.supported : claimFont.pending;
  return {
    body: { fontFamily: weight, fontSize: 17, lineHeight: 28.9, color: verified ? c.ink : c.hair },
    text: {},
    paragraph: { marginTop: 0, marginBottom: 16 },
    heading1: { fontFamily: font.sansSemi, fontSize: 20, lineHeight: 26, color: c.ink, marginTop: 24, marginBottom: 8 },
    heading2: { fontFamily: font.sansSemi, fontSize: 17, lineHeight: 24, color: c.ink, marginTop: 20, marginBottom: 8 },
    heading3: { fontFamily: font.sansSemi, fontSize: 15.5, lineHeight: 22, color: c.ink, marginTop: 18, marginBottom: 6 },
    heading4: { fontFamily: font.sansSemi, fontSize: 15, lineHeight: 22, color: c.ink2, marginTop: 14, marginBottom: 6 },
    strong: { fontFamily: verified ? font.sansSemi : font.sans330 },
    em: { fontStyle: "italic" as const },
    bullet_list: { marginBottom: 16 },
    ordered_list: { marginBottom: 16 },
    list_item: { marginBottom: 6 },
    bullet_list_icon: { color: c.hair, marginLeft: 2, marginRight: 10, lineHeight: 28.9 },
    ordered_list_icon: { color: c.muted, marginRight: 8, lineHeight: 28.9, fontFamily: font.mono, fontSize: 14 },
    blockquote: { backgroundColor: "transparent", borderLeftWidth: 2, borderLeftColor: c.lineStrong, paddingLeft: 14, marginLeft: 0, marginBottom: 16 },
    hr: { backgroundColor: c.line, height: 1, marginVertical: 22 },
    code_inline: { fontFamily: font.mono, fontSize: 14.5, backgroundColor: c.shell, color: c.ink2, borderRadius: 4, borderWidth: 0, paddingHorizontal: 4 },
    table: { borderWidth: 1, borderColor: c.line, borderRadius: 10, overflow: "hidden" as const, minWidth: 320 },
    thead: { backgroundColor: c.shell },
    th: { padding: 10, minWidth: 110, fontFamily: font.sansSemi },
    tr: { borderBottomWidth: 1, borderColor: c.line, flexDirection: "row" as const },
    td: { padding: 10, minWidth: 110 },
    link: { color: c.accentInk },
  };
}
