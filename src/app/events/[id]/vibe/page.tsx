import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventHeader } from "@/components/plan/EventHeader";
import { VibePanel } from "@/components/plan/VibePanel";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Look & feel · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function VibePage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active={null} />
      <VibePanel eventId={event.id} vibe={event.vibe} demoMode={process.env.DEMO_MODE === "true"} />
    </main>
  );
}
