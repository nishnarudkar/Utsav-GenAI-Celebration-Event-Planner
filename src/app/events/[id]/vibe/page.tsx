import { EventHeader } from "@/components/plan/EventHeader";
import { VibePanel } from "@/components/plan/VibePanel";
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata("Look & feel");

export default async function VibePage(props: EventPageProps) {
  const event = await loadEvent(props);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active={null} />
      <VibePanel eventId={event.id} vibe={event.vibe} demoMode={process.env.DEMO_MODE === "true"} />
    </main>
  );
}
