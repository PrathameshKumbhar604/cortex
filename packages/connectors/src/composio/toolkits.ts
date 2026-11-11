import { htmlToText } from "../extract";
import type { ActionDef, SearchInput } from "../types";

export interface ComposioActionSpec extends ActionDef {
  slug: string;
  toArgs(args: Record<string, unknown>): Record<string, unknown>;
}

export interface ComposioToolkitSpec {
  id: string; // Cortex source id
  name: string;
  toolkit: string; // Composio toolkit slug
  describes: string;
  impact: string;
  search: {
    slug: string;
    toArgs(input: SearchInput): Record<string, unknown>;
    /** Where the results are in the response, when it also holds other lists (extraction takes the largest array). */
    records?(data: unknown, input: SearchInput): unknown;
  };
  /** Optional second stage: fetch full content for the best few hits only. */
  detail?: { slug: string; toArgs(ref: string): Record<string, unknown>; top: number; text?(data: unknown): string };
  actions: ComposioActionSpec[];
}

const day = (iso?: string) => iso?.slice(0, 10);

// Filler and words that name the source itself; as search terms they match everything (Gmail) or nothing (Calendar).
const GENERIC = new Set(
  ("email emails mail mails inbox message messages meeting meetings event events calendar schedule drive doc docs file files notion page pages " +
    "slack channel channels github issue issues pr prs pull request requests me my our the from in on of for to and with any all about").split(" "),
);
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
// Words about when, not what: an event's text rarely contains them, so as a Calendar filter they hide every event.
const WHEN = new Set("today tomorrow tonight yesterday upcoming coming next this week weeks weekend month day days agenda plans plan scheduled whats what left soon".split(" "));
type Row = Record<string, unknown>;
const SUBSCRIBED = /@group\.v\.calendar\.google\.com$/;
const SUBSCRIBED_ASK = /\b(holidays?|festivals?|birthdays?|bank holiday|public holiday|vacation days?)\b/i;
const terms = (q: string) =>
  q
    .split(/\s+/)
    .map((t) => t.replace(/[^\w@.#:/-]/g, ""))
    .filter((t) => t.length > 1 && !GENERIC.has(t.toLowerCase()))
    .slice(0, 6);

/**
 * Gmail search pushed to the server: operators the planner wrote (from:, label:, is:unread) as-is,
 * any of the other keywords ({a b} is OR in Gmail), the time window (last 30 days by default),
 * and no promotions, social, spam or trash.
 */
export function gmailQuery(i: SearchInput): string {
  const all = terms(i.query);
  const ops = all.filter((t) => /^-?\w+:./.test(t));
  const words = all.filter((t) => !ops.includes(t));
  const since = i.since ?? daysAgo(30);
  return [
    ...ops,
    words.length > 1 ? `{${words.join(" ")}}` : words[0],
    `after:${day(since)!.replaceAll("-", "/")}`,
    i.until && `before:${day(i.until)!.replaceAll("-", "/")}`,
    "-category:promotions -category:social -in:spam -in:trash",
  ]
    .filter(Boolean)
    .join(" ");
}
/** Drive: files containing any keyword, changed in the window; with no keywords, recent files. */
export function driveQuery(i: SearchInput): string {
  const words = terms(i.query).filter((t) => !RECENCY.has(t.toLowerCase()));
  const types = words.map((t) => FILE_TYPES[t.toLowerCase()]).filter(Boolean);
  const any = words.filter((t) => !FILE_TYPES[t.toLowerCase()]).map((t) => `fullText contains '${t}'`); // terms() already strips quotes
  return [
    any.length && `(${any.join(" or ")})`,
    types.length && `(${types.map((m) => `mimeType = '${m}'`).join(" or ")})`,
    i.since && `modifiedTime > '${i.since}'`,
    i.until && `modifiedTime < '${i.until}'`,
    "trashed = false",
  ]
    .filter(Boolean)
    .join(" and ");
}
// "latest pdf" = newest first (orderBy), restricted to PDFs, not files containing the words "latest" and "pdf".
const RECENCY = new Set("latest newest recent recently last new fetch get find show open".split(" "));
const FILE_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pdfs: "application/pdf",
  sheet: "application/vnd.google-apps.spreadsheet",
  sheets: "application/vnd.google-apps.spreadsheet",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
  presentation: "application/vnd.google-apps.presentation",
  folder: "application/vnd.google-apps.folder",
};

const s = (v: unknown) => (v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : s(v).split(",").map((x) => x.trim()).filter(Boolean));

/** A date or date-time as written ("2026-11-17", "2026-11-17T10:30:00Z"): its date and HH:MM, ignoring any zone. */
function wallTime(v: unknown): { iso: string; date: string; time?: string } {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(s(v).trim());
  const iso = m?.[1] ?? new Date().toISOString().slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return { iso, date, time: m?.[2] };
}
const nextDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
// shortcut: one zone for everyone (CORTEX_TIMEZONE on the server); pass the browser's zone once users span regions.
const userTimeZone = () => process.env.CORTEX_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Composio tool slugs per app. Slugs are data, not code: if Composio renames
 * one, change it here (verify with `npm run composio:inspect`).
 */
export const TOOLKITS: ComposioToolkitSpec[] = [
  {
    id: "gmail",
    name: "Gmail",
    toolkit: "gmail",
    describes: "emails: requests, deadlines, replies from advisors, recruiters, teammates",
    impact: "Requests and deadlines that arrived by email may be missing.",
    search: {
      slug: "GMAIL_FETCH_EMAILS",
      toArgs: (i) => ({
        query: gmailQuery(i),
        max_results: Math.min(i.limit ?? 8, 10),
        verbose: false, // metadata + short body only; full bodies of ~200 emails/week would blow the budget
        include_payload: false,
      }),
    },
    detail: { slug: "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", toArgs: (ref) => ({ message_id: ref, format: "full" }), top: 2, text: gmailText },
    actions: [
      {
        id: "send_email",
        slug: "GMAIL_SEND_EMAIL",
        title: "Send email",
        description: "Send an email from the user's Gmail",
        risk: "high",
        params: [
          { name: "to", type: "string", description: "recipient email", required: true },
          { name: "subject", type: "string", description: "subject line", required: true },
          { name: "body", type: "string", description: "plain-text body", required: true },
        ],
        preview: (a) => `To: ${s(a.to)}\nSubject: ${s(a.subject)}\n\n${s(a.body)}`,
        toArgs: (a) => ({ recipient_email: s(a.to), subject: s(a.subject), body: s(a.body) }),
      },
      {
        id: "draft_email",
        slug: "GMAIL_CREATE_EMAIL_DRAFT",
        title: "Create draft",
        description: "Save an email draft without sending it",
        risk: "low",
        params: [
          { name: "to", type: "string", description: "recipient email", required: true },
          { name: "subject", type: "string", description: "subject line", required: true },
          { name: "body", type: "string", description: "plain-text body", required: true },
        ],
        preview: (a) => `Draft to ${s(a.to)}\nSubject: ${s(a.subject)}\n\n${s(a.body)}`,
        toArgs: (a) => ({ recipient_email: s(a.to), subject: s(a.subject), body: s(a.body) }),
      },
    ],
  },
  {
    id: "calendar",
    name: "Google Calendar",
    toolkit: "googlecalendar",
    describes: "meetings, deadlines, events and their dates",
    impact: "Meeting times and scheduled deadlines may be missing.",
    search: {
      // Every calendar the person sees in Google Calendar (shared, work, holidays), not just the primary one.
      slug: "GOOGLECALENDAR_EVENTS_LIST_ALL_CALENDARS",
      toArgs: (i) => {
        // No dates in the question: from yesterday to a month ahead (with no start, Google returns the oldest events first).
        const from = i.since ?? daysAgo(1);
        return {
          q: terms(i.query).filter((t) => !WHEN.has(t.toLowerCase())).join(" ") || undefined,
          time_min: from,
          time_max: i.until ?? new Date(Date.parse(from) + 31 * DAY).toISOString(),
          single_events: true,
          max_results_per_calendar: Math.min(i.limit ?? 10, 25),
        };
      },
      // The response also lists the calendars it searched; the events are in summary_view (title, start, end, calendar).
      // Only the person's own calendars count: subscribed ones (public holidays, birthdays: Google gives them
      // @group.v.calendar.google.com ids) join in only when the question asks for them.
      records: (data, input) => {
        const d = data as { summary_view?: Row[]; events?: Row[]; calendars_queried?: Row[] } | null;
        const rows = d?.summary_view?.length ? d.summary_view : d?.events;
        if (!rows) return data;
        const subscribed = new Set((d?.calendars_queried ?? []).filter((c) => SUBSCRIBED.test(s(c.id))).map((c) => s(c.summary)));
        const wanted = SUBSCRIBED_ASK.test(input.query);
        return rows.filter((r) => wanted || !subscribed.has(s(r.calendar))).map((r) =>
          r.calendar === undefined
            ? r
            : {
                title: r.title,
                description: `${s(r.start)}${r.end ? ` to ${s(r.end)}` : ""}${r.is_all_day ? " (all day)" : ""} · ${s(r.calendar)}`,
                start: r.start,
                htmlLink: r.display_url,
                id: r.event_id,
              },
        );
      },
    },
    actions: [
      {
        id: "create_event",
        slug: "GOOGLECALENDAR_CREATE_EVENT",
        title: "Create event",
        description: "Create a calendar event",
        risk: "high",
        params: [
          { name: "title", type: "string", description: "event title", required: true },
          { name: "start", type: "string", description: "start as the user said it: YYYY-MM-DDTHH:MM:SS local time, or YYYY-MM-DD for an all-day event", required: true },
          { name: "durationMinutes", type: "number", description: "length in minutes" },
          { name: "attendees", type: "string[]", description: "attendee emails" },
          { name: "description", type: "string", description: "event notes" },
        ],
        preview: (a) => {
          const w = wallTime(a.start);
          return (
            `${s(a.title)}\n${w.time ? `${w.date}, ${w.time} · ${Number(a.durationMinutes ?? 30)} min` : `${w.date} · all day`}` +
            (list(a.attendees).length ? `\nInvite: ${list(a.attendees).join(", ")}` : "")
          );
        },
        toArgs: (a) => {
          const w = wallTime(a.start);
          const minutes = Number(a.durationMinutes ?? 30);
          const when = w.time
            ? {
                // The time as the person said it, in their time zone (a trailing Z or offset from the model is dropped).
                start_datetime: `${w.iso}T${w.time}:00`,
                timezone: userTimeZone(),
                event_duration_hour: Math.floor(minutes / 60),
                event_duration_minutes: minutes % 60,
              }
            : { start_date: w.iso, end_date: nextDay(w.iso) }; // a date alone is an all-day event
          return {
            summary: s(a.title),
            ...when,
            attendees: list(a.attendees),
            description: s(a.description),
            create_meeting_room: list(a.attendees).length > 0, // a Meet link only when someone else is invited
          };
        },
      },
    ],
  },
  {
    id: "tasks",
    name: "Google Tasks",
    toolkit: "googletasks",
    describes: "to-dos and tasks with their due dates",
    impact: "Your to-dos and their due dates may be missing.",
    search: {
      slug: "GOOGLETASKS_LIST_ALL_TASKS",
      // Open tasks across every list; few enough that Cortex reads them all and the answer picks what matters.
      toArgs: () => ({ showCompleted: false, showHidden: false, max_tasks_total: 50 }),
      records: (data) => (data as { tasks?: unknown } | null)?.tasks ?? data,
    },
    actions: [
      {
        id: "create_task",
        slug: "GOOGLETASKS_INSERT_TASK",
        title: "Create task",
        description: "Add a to-do to Google Tasks",
        risk: "low",
        params: [
          { name: "title", type: "string", description: "what to do", required: true },
          { name: "due", type: "string", description: "due date YYYY-MM-DD (Google Tasks keeps the date only)" },
          { name: "notes", type: "string", description: "details" },
        ],
        preview: (a) => `${s(a.title)}${a.due ? `\nDue ${wallTime(a.due).date}` : ""}${a.notes ? `\n${s(a.notes)}` : ""}`,
        toArgs: (a) => ({
          title: s(a.title),
          tasklist_id: "@default",
          ...(a.due ? { due: `${wallTime(a.due).iso}T00:00:00.000Z` } : {}),
          ...(a.notes ? { notes: s(a.notes) } : {}),
        }),
      },
    ],
  },
  {
    id: "drive",
    name: "Google Drive",
    toolkit: "googledrive",
    describes: "documents, reports, slides and shared files",
    impact: "Documents such as reports and specs may be missing.",
    search: {
      slug: "GOOGLEDRIVE_FIND_FILE",
      toArgs: (i) => ({
        q: driveQuery(i),
        orderBy: "modifiedTime desc",
        pageSize: Math.min(i.limit ?? 8, 10),
      }),
    },
    actions: [
      {
        id: "create_doc",
        slug: "GOOGLEDRIVE_CREATE_FILE_FROM_TEXT",
        title: "Create document",
        description: "Create a text document in Drive",
        risk: "low",
        params: [
          { name: "name", type: "string", description: "file name", required: true },
          { name: "content", type: "string", description: "document text", required: true },
        ],
        preview: (a) => `New file "${s(a.name)}"\n\n${s(a.content).slice(0, 400)}`,
        toArgs: (a) => ({ file_name: s(a.name), text_content: s(a.content) }),
      },
    ],
  },
  {
    id: "notion",
    name: "Notion",
    toolkit: "notion",
    describes: "project specs, goals, notes, roadmaps and task databases",
    impact: "Project goals and specs may be missing, so changes can't be compared to the plan.",
    search: {
      slug: "NOTION_SEARCH_NOTION_PAGE",
      toArgs: (i) => ({ query: terms(i.query).join(" "), page_size: Math.min(i.limit ?? 8, 10) }),
    },
    actions: [
      {
        id: "create_page",
        slug: "NOTION_CREATE_NOTION_PAGE",
        title: "Create page",
        description: "Create a Notion page under a parent page",
        risk: "low",
        params: [
          { name: "parentId", type: "string", description: "parent page id", required: true },
          { name: "title", type: "string", description: "page title", required: true },
          { name: "content", type: "string", description: "page body (markdown)" },
        ],
        preview: (a) => `New page "${s(a.title)}"\n\n${s(a.content).slice(0, 400)}`,
        toArgs: (a) => ({ parent_id: s(a.parentId), title: s(a.title), markdown: s(a.content) }),
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    toolkit: "slack",
    describes: "team discussions, blockers, decisions and status updates",
    impact: "Blockers and decisions discussed in chat may be missing.",
    search: {
      slug: "SLACK_SEARCH_MESSAGES",
      toArgs: (i) => ({
        // Slack ANDs every word, so keep only the distinctive ones; last 30 days unless the question says otherwise.
        query: [...terms(i.query).slice(0, 3), `after:${day(i.since ?? daysAgo(30))}`, i.until && `before:${day(i.until)}`].filter(Boolean).join(" "),
        count: Math.min(i.limit ?? 10, 10),
        sort: "timestamp",
      }),
    },
    actions: [
      {
        id: "send_message",
        slug: "SLACK_SEND_MESSAGE",
        title: "Post message",
        description: "Post a message to a Slack channel or DM",
        risk: "high",
        params: [
          { name: "channel", type: "string", description: "channel name or id", required: true },
          { name: "text", type: "string", description: "message text", required: true },
        ],
        preview: (a) => `#${s(a.channel).replace(/^#/, "")}\n\n${s(a.text)}`,
        toArgs: (a) => ({ channel: s(a.channel), markdown_text: s(a.text) }),
      },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    toolkit: "github",
    describes: "issues, pull requests, milestones, code review and bugs",
    impact: "Open issues, PRs and milestone dates may be missing.",
    search: {
      slug: "GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS",
      toArgs: (i) => ({
        q: [...terms(i.query).slice(0, 4), "involves:@me", i.since && `updated:>=${day(i.since)}`, i.until && `updated:<=${day(i.until)}`]
          .filter(Boolean)
          .join(" "),
        per_page: Math.min(i.limit ?? 10, 10),
        sort: "updated",
      }),
    },
    actions: [
      {
        id: "create_issue",
        slug: "GITHUB_CREATE_AN_ISSUE",
        title: "Create issue",
        description: "Open a GitHub issue",
        risk: "low",
        params: [
          { name: "repo", type: "string", description: "owner/repo", required: true },
          { name: "title", type: "string", description: "issue title", required: true },
          { name: "body", type: "string", description: "issue body" },
        ],
        preview: (a) => `${s(a.repo)}\n${s(a.title)}\n\n${s(a.body)}`,
        toArgs: (a) => {
          const [owner, repo] = s(a.repo).split("/");
          return { owner, repo, title: s(a.title), body: s(a.body) };
        },
      },
      {
        id: "comment_issue",
        slug: "GITHUB_CREATE_AN_ISSUE_COMMENT",
        title: "Comment on issue",
        description: "Comment on an existing issue or PR",
        risk: "low",
        params: [
          { name: "repo", type: "string", description: "owner/repo", required: true },
          { name: "number", type: "number", description: "issue or PR number", required: true },
          { name: "body", type: "string", description: "comment text", required: true },
        ],
        preview: (a) => `${s(a.repo)} #${s(a.number)}\n\n${s(a.body)}`,
        toArgs: (a) => {
          const [owner, repo] = s(a.repo).split("/");
          return { owner, repo, issue_number: Number(a.number), body: s(a.body) };
        },
      },
    ],
  },
];

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };

/** The longer of the decoded payload and Composio's own `messageText`: either can come back partial depending on the route. */
export function gmailText(data: unknown): string {
  const own = String((data as { messageText?: unknown })?.messageText ?? "");
  const decoded = gmailBody(data);
  return decoded.length >= own.length ? decoded : own;
}

/** Gmail's full message: decode the text/plain part (or text/html as a fallback) from base64url. */
export function gmailBody(data: unknown): string {
  const payload = (data as { payload?: Part })?.payload;
  if (!payload) return "";
  const flat: Part[] = [];
  const walk = (p: Part) => {
    flat.push(p);
    p.parts?.forEach(walk);
  };
  walk(payload);
  const pick = flat.find((p) => p.mimeType === "text/plain" && p.body?.data) ?? flat.find((p) => p.mimeType === "text/html" && p.body?.data);
  if (!pick?.body?.data) return "";
  const text = Buffer.from(pick.body.data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return pick.mimeType === "text/html" ? htmlToText(text) : text;
}
