import { EventHeader } from "@/components/plan/EventHeader";
import { LivePanel } from "@/components/plan/LivePanel";
import { formatDate } from "@/lib/format";
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";
import { liveDate, liveGroups } from "@/lib/plan/live-view";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata("Live");

export default async function LivePage(props: EventPageProps) {
  const event = await loadEvent(props);

  const today = toISTDate(new Date());
  const date = liveDate(event, today);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="live" />
      <LivePanel
        eventId={event.id}
        dayLabel={formatDate(date, { weekday: true })}
        isToday={date === today}
        groups={liveGroups(event, date)}
        notifications={event.live.notifications}
      />
    </main>
  );
}
