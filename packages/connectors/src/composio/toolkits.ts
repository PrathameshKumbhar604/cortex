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
  search: { slug: string; toArgs(input: SearchInput): Record<string, unknown> };
  actions: ComposioActionSpec[];
}

const day = (iso?: string) => iso?.slice(0, 10);
const s = (v: unknown) => (v == null ? "" : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : s(v).split(",").map((x) => x.trim()).filter(Boolean));

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
        query: [i.query, i.since && `after:${day(i.since)!.replaceAll("-", "/")}`, i.until && `before:${day(i.until)!.replaceAll("-", "/")}`]
          .filter(Boolean)
          .join(" "),
        max_results: i.limit ?? 8,
      }),
    },
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
      slug: "GOOGLECALENDAR_EVENTS_LIST",
      toArgs: (i) => ({
        calendarId: "primary",
        q: i.query || undefined,
        timeMin: i.since,
        timeMax: i.until,
        maxResults: i.limit ?? 10,
        singleEvents: true,
        orderBy: "startTime",
      }),
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
          { name: "start", type: "string", description: "ISO start datetime", required: true },
          { name: "durationMinutes", type: "number", description: "length in minutes" },
          { name: "attendees", type: "string[]", description: "attendee emails" },
          { name: "description", type: "string", description: "event notes" },
        ],
        preview: (a) =>
          `${s(a.title)}\n${new Date(s(a.start)).toLocaleString()} · ${Number(a.durationMinutes ?? 30)} min` +
          (list(a.attendees).length ? `\nInvite: ${list(a.attendees).join(", ")}` : ""),
        toArgs: (a) => ({
          summary: s(a.title),
          start_datetime: s(a.start),
          event_duration_hour: Math.floor(Number(a.durationMinutes ?? 30) / 60),
          event_duration_minutes: Number(a.durationMinutes ?? 30) % 60,
          attendees: list(a.attendees),
          description: s(a.description),
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
        q: `fullText contains '${i.query.replaceAll("'", "\\'")}'` + (i.since ? ` and modifiedTime > '${i.since}'` : ""),
        page_size: i.limit ?? 8,
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
      toArgs: (i) => ({ query: i.query, page_size: i.limit ?? 8 }),
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
        query: [i.query, i.since && `after:${day(i.since)}`, i.until && `before:${day(i.until)}`].filter(Boolean).join(" "),
        count: i.limit ?? 10,
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
        q: [i.query, "involves:@me", i.since && `updated:>=${day(i.since)}`].filter(Boolean).join(" "),
        per_page: i.limit ?? 10,
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
