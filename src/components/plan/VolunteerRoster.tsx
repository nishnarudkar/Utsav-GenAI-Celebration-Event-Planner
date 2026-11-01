"use client";

import { Loader2, UserPlus, X } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { CopyButton } from "@/components/plan/CopyButton";
import { formatClock, formatDate } from "@/lib/format";
import { ROLE_LABELS, rosterCoverage, rosterText } from "@/lib/rules/roster";
import { VolunteerInput, VolunteerRole, type Volunteer } from "@/lib/schemas/community";
import type { PlannedFunction } from "@/lib/schemas/event";

const CONTROL =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-ink focus:border-maroon focus:outline-none";

interface VolunteerRosterProps {
  eventId: string;
  title: string;
  functions: PlannedFunction[];
  volunteers: Volunteer[];
}

function Person({
  volunteer,
  shift,
  onRemove,
}: {
  volunteer: Volunteer;
  shift: string;
  onRemove: (v: Volunteer) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block font-medium text-ink">{volunteer.name}</span>
        <span className="block text-muted">
          {ROLE_LABELS[volunteer.role]}
          {volunteer.phone && (
            <>
              {" · "}
              <a href={`tel:${volunteer.phone.replace(/[ -]/g, "")}`} className="underline">
                {volunteer.phone}
              </a>
            </>
          )}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${volunteer.name} from ${shift}`}
        onClick={() => onRemove(volunteer)}
        className="shrink-0 rounded-full p-1.5 text-muted hover:bg-cream hover:text-maroon"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** Who is covering each part of the event, against the same rough numbers as the crowd estimator. */
export function VolunteerRoster({ eventId, title, functions, volunteers: initial }: VolunteerRosterProps) {
  const [volunteers, setVolunteers] = useState(initial);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<VolunteerRole>("crowd_entry");
  const [functionName, setFunctionName] = useState(functions[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const phoneId = useId();
  const roleId = useId();
  const shiftId = useId();

  const coverage = rosterCoverage(functions, volunteers);

  async function add(e: FormEvent) {
    e.preventDefault();
    const parsed = VolunteerInput.safeParse({ name, role, functionName, ...(phone.trim() ? { phone } : {}) });
    if (!parsed.success)
      return setError(
        parsed.error.issues.some((i) => i.path[0] === "phone")
          ? "Check the phone number, or leave it blank."
          : "Add the volunteer's name.",
      );

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/volunteers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = (await res.json().catch(() => null)) as {
        volunteer?: Volunteer;
        error?: { message?: string };
      } | null;
      if (res.ok && body?.volunteer) {
        setVolunteers((list) => [...list, body.volunteer as Volunteer]);
        setName("");
        setPhone("");
      } else setError(body?.error?.message ?? "Couldn't add them — try again.");
    } catch {
      setError("Couldn't reach Utsav — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(volunteer: Volunteer) {
    setError(null);
    setVolunteers((list) => list.filter((v) => v.id !== volunteer.id));
    try {
      const res = await fetch(`/api/events/${eventId}/volunteers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteerId: volunteer.id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVolunteers((list) => [...list, volunteer]);
      setError("Couldn't remove them — try again.");
    }
  }

  return (
    <section aria-labelledby="roster-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 id="roster-title" className="font-display text-xl text-maroon">
          Volunteers
        </h2>
        <p className="mt-1 text-sm text-muted">
          Who is doing what, and when. Numbers needed are rough guides from each part&apos;s expected crowd.
        </p>
      </div>

      <form onSubmit={(e) => void add(e)} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={nameId} className="text-sm font-medium text-ink">
            Volunteer&apos;s name
          </label>
          <input
            id={nameId}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            className={CONTROL}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={phoneId} className="text-sm font-medium text-ink">
            Phone (optional)
          </label>
          <input
            id={phoneId}
            type="tel"
            value={phone}
            maxLength={20}
            onChange={(e) => setPhone(e.target.value)}
            className={CONTROL}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={roleId} className="text-sm font-medium text-ink">
            Role
          </label>
          <select
            id={roleId}
            value={role}
            onChange={(e) => setRole(e.target.value as VolunteerRole)}
            className={CONTROL}
          >
            {VolunteerRole.options.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={shiftId} className="text-sm font-medium text-ink">
            Shift
          </label>
          <select
            id={shiftId}
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            className={CONTROL}
          >
            {functions.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <UserPlus className="size-4" aria-hidden />
            )}
            Add volunteer
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-increased sm:col-span-2">
            {error}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        {coverage.shifts.map((s) => (
          <div key={s.name}>
            <h3 className="font-semibold text-ink">{s.name}</h3>
            <p className="text-sm text-muted tabular-nums">
              {formatDate(s.date)} · {formatClock(s.startTime)} – {formatClock(s.endTime)}
            </p>
            <p
              className={`mt-1 text-sm ${s.volunteers.length < s.volunteersNeeded ? "font-medium text-increased" : "text-ink"}`}
            >
              {s.volunteers.length} of about {s.volunteersNeeded} volunteers
            </p>
            {s.firstAidHave < s.firstAidNeeded && (
              <p className="text-sm font-medium text-increased">Needs someone on first aid</p>
            )}
            {s.volunteers.length > 0 && (
              <ul className="mt-1 divide-y divide-line">
                {s.volunteers.map((v) => (
                  <Person key={v.id} volunteer={v} shift={s.name} onRemove={(person) => void remove(person)} />
                ))}
              </ul>
            )}
          </div>
        ))}
        {coverage.unplaced.length > 0 && (
          <div>
            <h3 className="font-semibold text-ink">No longer in the plan</h3>
            <ul className="mt-1 divide-y divide-line">
              {coverage.unplaced.map((v) => (
                <Person key={v.id} volunteer={v} shift={v.functionName} onRemove={(person) => void remove(person)} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {volunteers.length > 0 && (
        <div className="flex flex-col items-start gap-1">
          <CopyButton text={rosterText(title, coverage)} label="Copy roster" />
          <p className="text-xs text-muted">
            The copied roster leaves out phone numbers, so it&apos;s safe for a group chat.
          </p>
        </div>
      )}
    </section>
  );
}
