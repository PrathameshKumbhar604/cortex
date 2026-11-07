import { useOnboarding } from "@/auth/OnboardingProvider";
import { Pager, type Page } from "@/onboarding/Pager";

// The web tour's steps (apps/web/src/components/tour.tsx), plus how Cortex works on a phone.
const PAGES: Page[] = [
  {
    title: "Ask about your work",
    body: "Ask about your emails, meetings, files or projects in plain words. Fast answers in one pass; Deep plans, searches your apps side by side and checks every claim.",
  },
  {
    title: "Every claim shows its source",
    body: "Small numbers link each sentence to the email, file or message it came from. Tap one to see it. Cortex checks each claim and says how many it could verify.",
  },
  {
    title: "Nothing happens without you",
    body: "Ask Cortex to send an email or create an event and it drafts it on a card. Edit it if you like, then approve. Nothing is sent until you do.",
  },
  {
    title: "It remembers what matters",
    body: "Priorities, people and preferences you mention are kept, never passwords or small talk. Review, edit or forget them in Memory, under your name.",
  },
  {
    title: "Bring in your apps and files",
    body: "Connect Gmail, Calendar, Drive, Notion, Slack or GitHub, or attach files of up to 10 MB with +. Cortex only reads to answer, and acts only when you approve.",
  },
  {
    title: "Made for one hand",
    body: "Swipe right anywhere for your chats, Brief and Files. Tap + for files, voice and Fast or Deep. Talk to Cortex in English, Hindi or Marathi with voice mode.",
  },
];

export default function Tour() {
  const { finish } = useOnboarding();
  return <Pager pages={PAGES} kicker="Tour" finalLabel="Start asking" onDone={finish} />;
}
