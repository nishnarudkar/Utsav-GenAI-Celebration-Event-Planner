import { notFound } from "next/navigation";
import { CrowdEstimator } from "@/components/plan/CrowdEstimator";
import { EventHeader } from "@/components/plan/EventHeader";
import { PermitChecklist } from "@/components/plan/PermitChecklist";
import { SponsorshipPitch } from "@/components/plan/SponsorshipPitch";
import { VolunteerRoster } from "@/components/plan/VolunteerRoster";
import { getPermits, permitRows } from "@/lib/kb/permits";
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";
import { peakCrowdOf } from "@/lib/rules/crowd";
import { toISTDate } from "@/lib/rules/dates";
import { pitchFor } from "@/lib/rules/sponsorship";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata("Community");

export default async function CommunityPage(props: EventPageProps) {
  const event = await loadEvent(props);
  if (event.answers.eventType !== "community") notFound();

  const { items, disclaimer } = getPermits();

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active={null} />
      <CrowdEstimator peakCrowd={peakCrowdOf(event.plan.functions)} />
      <PermitChecklist
        eventId={event.id}
        rows={permitRows(items, event.answers.startDate, toISTDate(new Date()), event.permitsDone)}
        disclaimer={disclaimer}
      />
      <VolunteerRoster
        eventId={event.id}
        title={event.title}
        functions={event.plan.functions}
        volunteers={event.volunteers}
      />
      <SponsorshipPitch
        eventId={event.id}
        saved={event.sponsorship?.input ?? null}
        pitch={event.sponsorship ? pitchFor(event, event.sponsorship) : null}
        demoMode={process.env.DEMO_MODE === "true"}
      />
    </main>
  );
}
