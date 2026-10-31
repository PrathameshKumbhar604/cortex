import type { SourceId } from "@cortex/shared";

export interface DemoItem {
  source: SourceId;
  title: string;
  body: string;
  author?: string;
  /** Days from now; negative = past. Keeps the sample workspace fresh forever. */
  offset: number;
  url?: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dateAt(offset: number, hour = 10): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d;
}

/** "Wed, Nov 12" for a day offset. */
export function fmt(offset: number): string {
  const d = dateAt(offset);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Key dates in the sample story, relative to today.
const DEMO_DAY_NEW = 18;
const DEMO_DAY_OLD = 20;
const REPORT_DUE = 6;
const OA_DUE = 4;

/**
 * Fictional sample workspace: a 4-person student team building "Orbit", a
 * campus events app, plus an internship search and an open-source PR.
 * Deliberate cross-source conflicts: the demo-day date differs between the
 * department email + Slack (new) and the GitHub milestone + calendar (stale).
 */
export const DEMO_ITEMS: DemoItem[] = [
  // Notion
  {
    source: "notion",
    title: "Orbit: Project spec",
    author: "You",
    offset: -40,
    body: `Goal: ship a beta of Orbit (campus events app) to 200 students by Demo Day (${fmt(DEMO_DAY_OLD)}). Core features: event feed, one-tap RSVP, push reminders. Stretch: group chat. Owners: Maya (backend), Jordan (mobile), Priya (design), You (PM + full-stack). Success: 200 beta users, SUS ≥ 75.`,
  },
  {
    source: "notion",
    title: "Orbit: Sprint 6 plan",
    author: "You",
    offset: -9,
    body: `Sprint 6 goals (due ${fmt(13)}): 1) finish push notifications (Jordan), 2) fix login loop #42 (Maya), 3) RSVP redesign from user testing (Priya), 4) draft the Demo Day script (You). Chat feature is explicitly out of scope for this sprint.`,
  },
  {
    source: "notion",
    title: "Advisor sync notes: Dr. Ruiz",
    author: "You",
    offset: -11,
    body: `Dr. Ruiz wants a progress report with user-testing results and an updated timeline. Flagged scope creep: the chat feature risks the beta. Suggested cutting it if push notifications slip again.`,
  },
  {
    source: "notion",
    title: "Internship tracker",
    author: "You",
    offset: -3,
    body: `Northbeam: SWE intern, online assessment due ${fmt(OA_DUE)} 11:59pm. Kestrel Labs: applied, waiting to hear back. Arcadia: rejected. Next: ask Prof. Lin for a reference letter.`,
  },
  // Slack
  {
    source: "slack",
    title: "#orbit-dev: Jordan",
    author: "Jordan",
    offset: -6,
    body: "Push notifications are blocked: the FCM/APNs credentials from university IT still haven't arrived, so I can't test on iOS at all.",
  },
  {
    source: "slack",
    title: "#orbit-dev: Maya",
    author: "Maya",
    offset: -4,
    body: `Heads up: Demo Day moved to ${fmt(DEMO_DAY_NEW)} per the department email. We lose two days, so the milestone needs updating.`,
  },
  {
    source: "slack",
    title: "#orbit-dev: Priya",
    author: "Priya",
    offset: -2,
    body: "RSVP flow redesign is done based on the user-testing round. Figma link is in Notion. Needs a dev to pick it up.",
  },
  {
    source: "slack",
    title: "#orbit-dev: Maya",
    author: "Maya",
    offset: -1,
    body: "Login loop #42 still reproduces on Android 15. Pretty sure it's the token refresh racing the session restore.",
  },
  {
    source: "slack",
    title: "#orbit-dev: Jordan",
    author: "Jordan",
    offset: -1,
    body: "Honestly, should we cut group chat? It's eating time and it isn't in the sprint.",
  },
  // GitHub
  {
    source: "github",
    title: "orbit-team/orbit #42: Login loop on Android 15 after token refresh",
    author: "maya",
    offset: -1,
    body: "Open · bug · priority:high · assigned to maya. Users get bounced back to the login screen after ~1h. Repro on Android 15 only.",
    url: "https://github.com/orbit-team/orbit/issues/42",
  },
  {
    source: "github",
    title: "orbit-team/orbit milestone: Beta (Demo Day)",
    author: "orbit-team",
    offset: -12,
    body: `Due ${fmt(DEMO_DAY_OLD)} · 11 of 19 issues closed (58%).`,
    url: "https://github.com/orbit-team/orbit/milestone/3",
  },
  {
    source: "github",
    title: "orbit-team/orbit PR #57: Push notification service (FCM)",
    author: "jordan",
    offset: -5,
    body: "Open · waiting for review for 5 days · blocked on credentials for end-to-end testing.",
    url: "https://github.com/orbit-team/orbit/pull/57",
  },
  {
    source: "github",
    title: "orbit-team/orbit #49: Group chat MVP",
    author: "jordan",
    offset: -3,
    body: "Open · 0 of 6 tasks done · not in Sprint 6.",
    url: "https://github.com/orbit-team/orbit/issues/49",
  },
  {
    source: "github",
    title: "lumen-ui/lumen PR #612: Fix focus trap in Dialog",
    author: "you",
    offset: -2,
    body: "Maintainer requested changes: add a test for nested dialogs and update the changelog.",
    url: "https://github.com/lumen-ui/lumen/pull/612",
  },
  // Gmail
  {
    source: "gmail",
    title: "Progress report due Friday",
    author: "Dr. Elena Ruiz <e.ruiz@university.edu>",
    offset: -2,
    body: `Hi team, a reminder that the capstone progress report is due ${fmt(REPORT_DUE)}. Please include the user-testing results and an updated timeline that reflects the new Demo Day date.`,
  },
  {
    source: "gmail",
    title: "Capstone Demo Day: schedule change",
    author: "Engineering Dept. <capstone@university.edu>",
    offset: -5,
    body: `Demo Day has moved to ${fmt(DEMO_DAY_NEW)}, 2–5pm, Engineering Hall. Booth assignments will follow.`,
  },
  {
    source: "gmail",
    title: "Your Northbeam online assessment",
    author: "Northbeam Recruiting <careers@northbeam.example>",
    offset: -1,
    body: `Thanks for applying to the SWE Intern role. Please complete the online assessment by ${fmt(OA_DUE)}, 11:59pm. It takes about 90 minutes.`,
  },
  {
    source: "gmail",
    title: "Re: FCM/APNs credentials request (ticket #8812)",
    author: "University IT <it-help@university.edu>",
    offset: -3,
    body: "Your request is in the queue. Expected turnaround is 5–7 business days.",
  },
  // Calendar (future events use positive offsets)
  { source: "calendar", title: "Orbit standup", author: "You", offset: 1, body: `Daily standup · ${fmt(1)} 9:30am · Maya, Jordan, Priya` },
  { source: "calendar", title: "Advisor sync: Dr. Ruiz", author: "Dr. Ruiz", offset: 3, body: `${fmt(3)} 3:00pm · Office 214 · Agenda: progress report, timeline` },
  { source: "calendar", title: "Northbeam OA (focus block)", author: "You", offset: 3, body: `${fmt(3)} 7:00–8:30pm · Self-scheduled` },
  { source: "calendar", title: "Progress report due", author: "You", offset: REPORT_DUE, body: `${fmt(REPORT_DUE)} 11:59pm · Submit to Dr. Ruiz` },
  { source: "calendar", title: "Capstone Demo Day", author: "You", offset: DEMO_DAY_OLD, body: `${fmt(DEMO_DAY_OLD)} 2:00pm · Engineering Hall` },
  // Drive
  {
    source: "drive",
    title: "Orbit user testing: round 1 results",
    author: "Priya",
    offset: -8,
    body: "12 participants. SUS score 71 (target 75). 5 of 12 were confused by the RSVP flow; 9 of 12 want event reminders. Top request: calendar sync.",
  },
  {
    source: "drive",
    title: "Progress report: draft v1",
    author: "You",
    offset: -10,
    body: "Sections done: overview, architecture. TODO: user-testing results, updated timeline, risks.",
  },
];
