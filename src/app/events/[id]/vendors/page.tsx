import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventHeader } from "@/components/plan/EventHeader";
import { QuoteCard } from "@/components/plan/QuoteCard";
import { QuoteUploader } from "@/components/plan/QuoteUploader";
import { getEventRepository } from "@/lib/plan/event-repo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const event = await getEventRepository().get((await params).id);
  return { title: event ? `Vendors · ${event.title} — Utsav` : "Event not found — Utsav" };
}

export default async function VendorsPage({ params }: Props) {
  const { id } = await params;
  const event = await getEventRepository().get(id);
  if (!event) notFound();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
      <EventHeader event={event} active="vendors" />
      <QuoteUploader eventId={event.id} />
      {event.quotes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl text-maroon">Checked quotes</h2>
          {event.quotes.map((q) => (
            <QuoteCard key={q.id} quote={q} />
          ))}
        </section>
      )}
    </main>
  );
}
