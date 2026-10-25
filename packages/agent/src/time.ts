import type { TimeWindow } from "@cortex/shared";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Cheap, LLM-free time window detection. Used by Fast Mode and as a sanity
 * check on the planner's window.
 */
export function parseWindow(text: string, now = new Date()): TimeWindow | undefined {
  const t = text.toLowerCase();
  const today = startOfDay(now);
  const days = (n: number) => new Date(today.getTime() + n * 86_400_000);

  if (/\btoday\b/.test(t)) return { since: iso(today), until: iso(days(1)), label: "today" };
  if (/\byesterday\b/.test(t)) return { since: iso(days(-1)), until: iso(today), label: "yesterday" };
  if (/\b(this|past|last) week\b|\blast 7 days\b/.test(t)) return { since: iso(days(-7)), until: iso(days(1)), label: "last 7 days" };
  if (/\b(next|coming|upcoming) (week|7 days)\b/.test(t)) return { since: iso(today), until: iso(days(8)), label: "next 7 days" };
  const lastN = t.match(/\b(?:last|past) (\d{1,3}) days\b/);
  if (lastN) return { since: iso(days(-Number(lastN[1]))), until: iso(days(1)), label: `last ${lastN[1]} days` };
  if (/\bthis month\b/.test(t)) return { since: iso(new Date(today.getFullYear(), today.getMonth(), 1)), until: iso(days(1)), label: "this month" };
  if (/\blast month\b/.test(t)) {
    return {
      since: iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      until: iso(new Date(today.getFullYear(), today.getMonth(), 1)),
      label: "last month",
    };
  }
  if (/\bthis (quarter|semester|term)\b/.test(t)) {
    const q = Math.floor(today.getMonth() / 3) * 3;
    return { since: iso(new Date(today.getFullYear(), q, 1)), until: iso(new Date(today.getFullYear(), q + 3, 1)), label: "this quarter" };
  }
  if (/\b(upcoming|deadlines?|due|next)\b/.test(t)) return { since: iso(today), until: iso(days(30)), label: "next 30 days" };
  return undefined;
}

export function keywords(text: string, max = 6): string {
  const stop = new Set(
    "a an the and or of to in on for with at by from is are was were be been what which who when where why how did do does this that these those my our your me i we you it its any all about since last week month quarter today yesterday please tell show give summarize summary changed change happen happened anything there can could would should will".split(" "),
  );
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, (m) => ` ${m} `)
    .replace(/[^a-z0-9#:/._-]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !stop.has(w))
    .slice(0, max)
    .join(" ");
}
