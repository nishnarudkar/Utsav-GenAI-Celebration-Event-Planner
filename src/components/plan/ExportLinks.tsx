import { CalendarPlus, FileDown } from "lucide-react";

const LINK = "inline-flex items-center gap-1.5 rounded-full border border-maroon px-4 py-2 text-sm font-medium text-maroon hover:bg-maroon/5";

/** Download the plan as a PDF, or as a calendar file for Google Calendar and others. */
export function ExportLinks({ eventId }: { eventId: string }) {
  const href = (format: "pdf" | "ics") => `/api/events/${eventId}/export?format=${format}`;
  return (
    <section aria-label="Export plan" className="flex flex-wrap gap-2">
      <a href={href("pdf")} download className={LINK}>
        <FileDown className="size-4" aria-hidden /> Download PDF
      </a>
      <a href={href("ics")} download className={LINK}>
        <CalendarPlus className="size-4" aria-hidden /> Add to calendar
      </a>
    </section>
  );
}
