import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CouncilPanel } from "@/components/council/CouncilPanel";
import { EventHeader } from "@/components/plan/EventHeader";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Family Council · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function CouncilPage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="council" />
      <CouncilPanel eventId={event.id} version={event.version} stakeholders={event.stakeholders} council={event.council} />
    </main>
  );
}
