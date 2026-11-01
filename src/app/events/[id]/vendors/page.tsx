import { EventHeader } from "@/components/plan/EventHeader";
import { QuoteCard } from "@/components/plan/QuoteCard";
import { QuoteUploader } from "@/components/plan/QuoteUploader";
import { eventMetadata, loadEvent, type EventPageProps } from "@/lib/plan/event-page";

export const dynamic = "force-dynamic";

export const generateMetadata = eventMetadata("Vendors");

export default async function VendorsPage(props: EventPageProps) {
  const event = await loadEvent(props);

  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 px-4 py-6">
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
