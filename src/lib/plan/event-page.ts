import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEventRepository } from "@/lib/plan/event-repo";
import type { StoredEvent } from "@/lib/plan/types";

/** What every page under /events/[id] shares: its props, its title and loading its event. */

export type EventPageProps = { params: Promise<{ id: string }> };

export function eventMetadata(section?: string) {
  return async ({ params }: EventPageProps): Promise<Metadata> => {
    const event = await getEventRepository().get((await params).id);
    if (!event) return { title: "Event not found — Utsav" };
    return { title: `${section ? `${section} · ` : ""}${event.title} — Utsav` };
  };
}

/** The page's event, or Next's not-found page. */
export async function loadEvent({ params }: EventPageProps): Promise<StoredEvent> {
  const event = await getEventRepository().get((await params).id);
  if (!event) notFound();
  return event;
}
