import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CrowdEstimator } from "@/components/plan/CrowdEstimator";
import { EventHeader } from "@/components/plan/EventHeader";
import { PermitChecklist } from "@/components/plan/PermitChecklist";
import { getPermits, permitRows } from "@/lib/kb/permits";
import { getEventRepository } from "@/lib/plan/event-repo";
import { toISTDate } from "@/lib/rules/dates";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Community · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function CommunityPage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event || event.answers.eventType !== "community") notFound();

  const { items, disclaimer } = getPermits();
  const peakCrowd = Math.max(...event.plan.functions.map((f) => f.expectedGuests));

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active={null} />
      <CrowdEstimator peakCrowd={peakCrowd} />
      <PermitChecklist eventId={event.id} rows={permitRows(items, event.answers.startDate, toISTDate(new Date()), event.permitsDone)} disclaimer={disclaimer} />
    </main>
  );
}
