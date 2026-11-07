import { useOnboarding } from "@/auth/OnboardingProvider";
import { Pager, type Page } from "@/onboarding/Pager";

// Someone who already uses Cortex on the web: everything is already here; just show what's different on the phone.
const PAGES: Page[] = [
  {
    title: "Welcome back",
    body: "Your chats, memory, files and connected apps came with you. Pick up any conversation from the web right where you left it.",
  },
  {
    title: "Made for one hand",
    body: "Swipe right anywhere for your chats, Brief and Files. Tap + for files, voice and Fast or Deep. Approve actions with a tap.",
  },
];

export default function Welcome() {
  const { finish } = useOnboarding();
  return <Pager pages={PAGES} kicker="Cortex on Android" finalLabel="Open Cortex" onDone={finish} />;
}
