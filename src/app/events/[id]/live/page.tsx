import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventHeader } from "@/components/plan/EventHeader";
import { LivePanel } from "@/components/plan/LivePanel";
import { formatDate } from "@/lib/format";
import { getEventRepository } from "@/lib/plan/event-repo";
import { liveDate, liveGroups } from "@/lib/plan/live-view";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Live · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function LivePage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  const today = toISTDate(new Date());
  const date = liveDate(event, today);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
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
