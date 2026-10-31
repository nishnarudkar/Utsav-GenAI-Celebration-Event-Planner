"use client";

import { TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import { estimateCrowd, type CrowdLevel } from "@/lib/rules/crowd";

const LEVELS: Record<CrowdLevel, { label: string; note: string; alert: boolean }> = {
  comfortable: { label: "Comfortable", note: "People can move around freely.", alert: false },
  busy: { label: "Busy", note: "Fine for standing, but keep the walkways clear.", alert: false },
  crowded: { label: "Crowded", note: "Hard to move. Add space, or stagger entry.", alert: true },
  unsafe: { label: "Too crowded", note: "This is unsafe. Use a bigger site or limit entry.", alert: true },
};

const toNumber = (text: string) => {
  const n = Number(text);
  return text.trim() && Number.isFinite(n) && n > 0 ? n : undefined;
};

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-white px-3 py-2.5 tabular-nums text-ink focus:border-maroon focus:outline-none"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-2xl text-maroon lining-nums tabular-nums">{value}</dd>
    </div>
  );
}

/** Rough safety numbers for the crowd. Worked out in the browser as you type. */
export function CrowdEstimator({ peakCrowd: initialCrowd }: { peakCrowd: number }) {
  const [crowd, setCrowd] = useState(String(initialCrowd));
  const [area, setArea] = useState("");
  const [exits, setExits] = useState("");

  const peakCrowd = toNumber(crowd);
  const areaSqM = toNumber(area);
  const exitWidthM = toNumber(exits);
  const estimate = peakCrowd ? estimateCrowd({ peakCrowd, ...(areaSqM ? { areaSqM } : {}), ...(exitWidthM ? { exitWidthM } : {}) }) : null;
  const level = estimate?.density ? LEVELS[estimate.density.level] : null;

  return (
    <section aria-labelledby="crowd-title" className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 id="crowd-title" className="font-display text-xl text-maroon">
          Crowd safety
        </h2>
        <p className="mt-1 text-sm text-muted">Rough planning numbers only, not a safety certificate. Your police and fire departments have the final say.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Most people at once" value={crowd} onChange={setCrowd} />
        <Field label="Open space (sq m)" value={area} onChange={setArea} />
        <Field label="Total exit width (m)" value={exits} onChange={setExits} />
      </div>

      {estimate ? (
        <div aria-live="polite" className="flex flex-col gap-3 border-t border-line pt-4">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Exit width needed" value={`${estimate.exitWidthNeededM} m`} />
            <Stat label="Volunteers" value={String(estimate.volunteers)} />
            <Stat label="First-aid posts" value={String(estimate.firstAidPosts)} />
            <Stat label="Toilets" value={String(estimate.toilets)} />
          </dl>
          <p className="text-sm text-muted">Have at least {estimate.minExits} separate exits, so one blocked exit doesn&apos;t trap anyone.</p>

          {estimate.density && level && (
            <p className="flex gap-1.5 text-sm text-ink">
              {level.alert && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-increased" aria-hidden />}
              <span>
                <strong>{level.label}</strong> at {estimate.density.perSqM} people per sq m. {level.note} This space comfortably holds about {estimate.density.comfortableCapacity.toLocaleString("en-IN")}.
              </span>
            </p>
          )}
          {!estimate.density && <p className="text-sm text-muted">Add your open space to check how crowded it will feel.</p>}

          {estimate.exitShortfallM !== undefined && estimate.exitShortfallM > 0 && (
            <p className="flex gap-1.5 text-sm text-ink">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-increased" aria-hidden />
              <span>Your exits are {estimate.exitShortfallM} m short. Widen them or add another.</span>
            </p>
          )}
        </div>
      ) : (
        <p role="alert" className="text-sm text-increased">
          Enter how many people you expect at the busiest time.
        </p>
      )}
    </section>
  );
}
