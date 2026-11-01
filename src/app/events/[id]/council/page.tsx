import { CouncilPanel } from "@/components/council/CouncilPanel";
import { EventHeader } from "@/components/plan/EventHeader";
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata("Family Council");

export default async function CouncilPage(props: EventPageProps) {
  const event = await loadEvent(props);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="council" />
      <CouncilPanel
        eventId={event.id}
        version={event.version}
        stakeholders={event.stakeholders}
        council={event.council}
      />
    </main>
  );
}
