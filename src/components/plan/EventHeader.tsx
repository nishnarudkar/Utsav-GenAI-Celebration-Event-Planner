import Link from "next/link";
import { formatDate } from "@/lib/format";
import { cultureLabel } from "@/lib/onboarding/steps";
import type { StoredEvent } from "@/lib/plan/types";

export type EventTab = "overview" | "budget" | "timeline" | "vendors" | "council";

const TABS: Array<{ key: EventTab; label: string; path: string }> = [
  { key: "overview", label: "Overview", path: "" },
  { key: "budget", label: "Budget", path: "/budget" },
  { key: "timeline", label: "Timeline", path: "/timeline" },
  { key: "vendors", label: "Vendors", path: "/vendors" },
  { key: "council", label: "Family", path: "/council" },
];

/** Title, key facts and section tabs shared by every event page. */
export function EventHeader({ event, active }: { event: StoredEvent; active: EventTab }) {
  const { answers, plan } = event;
  return (
    <header className="flex flex-col gap-3">
      <Link href="/" className="font-display text-2xl text-maroon">
        Utsav
      </Link>
      <div>
        <h1 className="font-display text-3xl leading-tight text-maroon">{event.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatDate(plan.startDate)}
          {plan.endDate !== plan.startDate && ` – ${formatDate(plan.endDate)}`} · {answers.city} · {answers.guestCount.toLocaleString("en-IN")} guests
          {answers.culture !== "generic" && ` · ${cultureLabel(answers.culture)}`}
        </p>
      </div>
      <nav aria-label="Event sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <ul className="flex border-b border-line sm:gap-1">
          {TABS.map((tab) => {
            const current = tab.key === active;
            return (
              <li key={tab.key}>
                <Link
                  href={`/events/${event.id}${tab.path}`}
                  aria-current={current ? "page" : undefined}
                  className={`-mb-px block whitespace-nowrap border-b-2 px-2 py-2 text-[13px] font-medium sm:px-3 sm:text-sm ${
                    current ? "border-maroon text-maroon" : "border-transparent text-muted hover:text-maroon"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
