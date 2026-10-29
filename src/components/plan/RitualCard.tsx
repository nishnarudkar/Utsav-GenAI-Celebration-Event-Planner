import { BookOpen, Clock, Users } from "lucide-react";
import { RitualChecklist } from "@/components/plan/RitualChecklist";
import type { RitualCardData } from "@/lib/plan/timeline-view";

const duration = (min: number) => (min < 60 ? `${min} min` : min % 60 === 0 ? `${min / 60} hr` : `${Math.floor(min / 60)} hr ${min % 60} min`);

export function RitualCard({ eventId, ritual }: { eventId: string; ritual: RitualCardData }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <h4 className="font-display text-lg leading-snug text-maroon">
          <span className="mr-1.5 text-sm text-muted tabular-nums">{ritual.order}.</span>
          {ritual.name}
        </h4>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted">
          <Clock className="size-3.5" aria-hidden /> {duration(ritual.durationMinutes)}
        </span>
      </header>
      <p className="text-sm text-ink">{ritual.significance}</p>
      {ritual.participants.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Participants: </span>
            {ritual.participants.join(", ")}
          </span>
        </p>
      )}
      {ritual.items.length > 0 && <RitualChecklist eventId={eventId} items={ritual.items} />}
      {ritual.citation && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <BookOpen className="size-3.5 shrink-0" aria-hidden />
          <span>Source: {ritual.citation}</span>
        </p>
      )}
    </article>
  );
}
