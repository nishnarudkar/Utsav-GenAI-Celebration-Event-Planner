"use client";

import { ArrowRight, Clock, Loader2, MessageCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { formatTime } from "@/lib/format";
import { apiCall } from "@/lib/plan/client-api";
import type { LiveGroup } from "@/lib/plan/live-view";
import type { LiveNotification, LiveProposal } from "@/lib/schemas/dayof";

const SAMPLE_INCIDENTS = ["Photographer 30 min late", "Priest 20 min late"].map((text) => ({ label: text, value: text }));

interface LivePanelProps {
  eventId: string;
  dayLabel: string;
  isToday: boolean;
  groups: LiveGroup[];
  notifications: LiveNotification[];
}

/** The day's running order, reporting a problem, and the messages that went out. */
export function LivePanel({ eventId, dayLabel, isToday, groups, notifications }: LivePanelProps) {
  const router = useRouter();
  const [incident, setIncident] = useState("");
  const [proposal, setProposal] = useState<LiveProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function report(text: string) {
    setBusy(true);
    setError(null);
    setProposal(null);
    const result = await apiCall<{ proposal: LiveProposal }>(`/api/events/${eventId}/live`, { method: "POST", body: JSON.stringify({ incident: text }) });
    setBusy(false);
    if (result.ok) setProposal(result.data.proposal);
    else setError(result.message);
  }

  async function confirm(id: string) {
    setBusy(true);
    setError(null);
    const result = await apiCall(`/api/events/${eventId}/live`, { method: "POST", body: JSON.stringify({ confirm: id }) });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setProposal(null);
    setIncident("");
    router.refresh();
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (incident.trim().length < 3) return setError("Say what's happened, for example “Caterer 20 min late”.");
    void report(incident);
  }

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="live-show" className="rounded-2xl border border-line bg-white p-5">
        <h2 id="live-show" className="font-display text-xl text-maroon">
          Running order
        </h2>
        <p className="mt-1 text-sm text-muted">{isToday ? `Today, ${dayLabel}` : `Preview of the main day, ${dayLabel}`}</p>
        <div className="mt-3 flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.functionName}>
              <h3 className="text-sm font-semibold text-ink">{g.functionName}</h3>
              <ol className="mt-1 flex flex-col">
                {g.slots.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line py-1.5 text-sm last:border-0">
                    <span className="text-ink">{s.name}</span>
                    <span className="tabular-nums text-muted">
                      {s.time}
                      {s.delayMinutes > 0 && <span className="ml-2 font-medium text-increased">+{s.delayMinutes} min</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="live-report" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
        <h2 id="live-report" className="font-display text-xl text-maroon">
          Something gone wrong?
        </h2>
        <SuggestionChips
          chips={SAMPLE_INCIDENTS}
          onPick={(v) => {
            setIncident(v);
            void report(v);
          }}
          disabled={busy}
          label="Sample problems"
        />
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            What&apos;s happened?
          </label>
          <input
            id={inputId}
            value={incident}
            maxLength={300}
            onChange={(e) => setIncident(e.target.value)}
            placeholder="e.g. Decorator 40 min late"
            className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink placeholder:text-muted/70 focus:border-maroon focus:outline-none"
          />
          <div>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Work out what changes
            </button>
          </div>
        </form>
        {error && (
          <p role="alert" className="text-sm text-increased">
            {error}
          </p>
        )}
      </section>

      {proposal && (
        <section aria-labelledby="live-proposal" className="flex flex-col gap-3 rounded-2xl border border-marigold/60 bg-white p-5">
          <div>
            <h2 id="live-proposal" className="font-display text-xl text-maroon">
              Suggested update
            </h2>
            <p className="mt-1 text-sm text-ink">{proposal.summary}</p>
          </div>

          {proposal.moves.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {proposal.moves.map((m) => (
                <li key={m.slotId} className="flex flex-wrap items-center justify-between gap-x-3">
                  <span className="text-ink">{m.name}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-muted">
                    {m.from} <ArrowRight className="size-3" aria-label="to" /> <span className="text-ink">{m.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No times need to move.</p>
          )}

          {proposal.warnings.map((w) => (
            <p key={w} className="flex gap-1.5 text-sm text-ink">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-marigold-ink" aria-hidden /> <span>{w}</span>
            </p>
          ))}

          {proposal.messages.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">Messages to send</h3>
              {proposal.messages.map((m) => (
                <div key={m.category} className="rounded-xl bg-cream p-3 text-sm">
                  <p className="font-medium text-ink">{m.to}</p>
                  <p className="text-ink">{m.body}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm(proposal.id)}
              className="rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
            >
              Confirm and notify
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setProposal(null)}
              className="rounded-full border border-maroon px-5 py-2.5 font-medium text-maroon hover:bg-maroon/5 disabled:opacity-50"
            >
              Discard
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="live-sent" className="rounded-2xl border border-line bg-white p-5">
        <h2 id="live-sent" className="font-display text-xl text-maroon">
          Sent messages
        </h2>
        <p className="mt-1 text-sm text-muted">Practice mode: messages are saved here, not sent on WhatsApp.</p>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {notifications.map((n) => (
              <li key={n.id} className="rounded-xl bg-cream p-3 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="size-4" aria-hidden /> {n.to}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
                    <Clock className="size-3" aria-hidden /> {formatTime(new Date(n.sentAt))}
                  </span>
                </p>
                <p className="mt-1 text-ink">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
