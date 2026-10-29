"use client";

import { ArrowUp, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import { BUILD_PROGRESS_LABELS, BuildProgress } from "@/components/plan/BuildProgress";
import { addDays, type ISODate } from "@/lib/rules/dates";
import {
  applyAnswer,
  STEP_ORDER,
  stepPrompt,
  toOnboardingAnswers,
  type CollectedAnswers,
  type StepId,
} from "@/lib/onboarding/steps";
import type { OnboardingAnswers } from "@/lib/schemas/event";

const ANSWER_KEY: Record<StepId, keyof CollectedAnswers> = {
  eventType: "eventType",
  culture: "culture",
  city: "city",
  startDate: "startDate",
  guestCount: "guestCount",
  budget: "budgetTotalPaise",
};

type Phase = { kind: "asking" } | { kind: "building"; progress: number } | { kind: "error"; message: string };

const STEP_INTERVAL_MS = 1400;

export function OnboardingChat({ today }: { today: ISODate }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<CollectedAnswers>({});
  const [displays, setDisplays] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "asking" });
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const errorId = useId();

  const stepIndex = displays.length;
  const step = STEP_ORDER[stepIndex];
  const prompt = step ? stepPrompt(step, answers) : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (phase.kind === "asking" && prompt && !prompt.chipsOnly) inputRef.current?.focus();
  }, [stepIndex, phase.kind, prompt]);

  function submit(value: string) {
    if (!step) return;
    const result = applyAnswer(step, value, answers, today);
    if (!result.ok) {
      setInputError(result.message);
      return;
    }
    setInputError(null);
    setDraft("");
    setAnswers(result.answers);
    setDisplays((d) => [...d, result.display]);
    if (stepIndex === STEP_ORDER.length - 1) {
      const body = toOnboardingAnswers(result.answers);
      if (body) void build(body);
    }
  }

  function editFrom(index: number) {
    if (phase.kind === "building") return;
    const kept: CollectedAnswers = { ...answers };
    for (const s of STEP_ORDER.slice(index)) delete kept[ANSWER_KEY[s]];
    setAnswers(kept);
    setDisplays((d) => d.slice(0, index));
    setInputError(null);
    setDraft("");
    setPhase({ kind: "asking" });
  }

  async function build(body: OnboardingAnswers) {
    setPhase({ kind: "building", progress: 0 });
    // Progress is paced on the client: the API returns once, when the whole plan is ready.
    const timer = setInterval(() => {
      setPhase((p) => (p.kind === "building" ? { kind: "building", progress: Math.min(p.progress + 1, BUILD_PROGRESS_LABELS.length - 1) } : p));
    }, STEP_INTERVAL_MS);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(json) ?? "Couldn't generate that — try again.");
      const id = eventId(json);
      if (!id) throw new Error("Couldn't generate that — try again.");
      setPhase({ kind: "building", progress: BUILD_PROGRESS_LABELS.length });
      router.push(`/events/${id}`);
    } catch (err) {
      const message = err instanceof TypeError ? "Couldn't reach Utsav — check your connection and try again." : (err as Error).message;
      setPhase({ kind: "error", message });
    } finally {
      clearInterval(timer);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(draft);
  }

  const body = toOnboardingAnswers(answers);

  return (
    <div className="flex flex-col gap-4">
      <div role="log" aria-label="Planning conversation" aria-live="polite" className="flex flex-col gap-3">
        {displays.map((display, i) => {
          const s = STEP_ORDER[i]!;
          return (
            <div key={s} className="flex flex-col gap-3">
              <MessageBubble role="assistant">{stepPrompt(s, answers).question}</MessageBubble>
              <MessageBubble
                role="user"
                onEdit={phase.kind === "building" ? undefined : () => editFrom(i)}
                editLabel={`Change answer: ${display}`}
              >
                {display}
              </MessageBubble>
            </div>
          );
        })}
        {prompt && phase.kind === "asking" && <MessageBubble role="assistant">{prompt.question}</MessageBubble>}
      </div>

      {prompt && phase.kind === "asking" && step && (
        <div className="flex flex-col gap-3">
          <SuggestionChips chips={prompt.chips} onPick={submit} label="Suggested answers" />
          {!prompt.chipsOnly && (
            <form onSubmit={onSubmit} className="flex items-start gap-2">
              <div className="flex-1">
                <label htmlFor={inputId} className="sr-only">
                  {prompt.inputLabel}
                </label>
                <input
                  ref={inputRef}
                  id={inputId}
                  type={prompt.inputType}
                  inputMode={prompt.inputType === "number" ? "numeric" : undefined}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setInputError(null);
                  }}
                  placeholder={prompt.placeholder}
                  min={prompt.inputType === "date" ? today : prompt.inputType === "number" ? 1 : undefined}
                  max={prompt.inputType === "date" ? addDays(today, 3 * 366) : undefined}
                  aria-invalid={inputError ? true : undefined}
                  aria-describedby={inputError ? errorId : undefined}
                  className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink placeholder:text-muted/70 focus:border-maroon focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-maroon text-cream hover:bg-maroon-dark"
                aria-label="Send answer"
              >
                <ArrowUp className="size-5" aria-hidden />
              </button>
            </form>
          )}
          {inputError && (
            <p id={errorId} role="alert" className="text-sm text-increased">
              {inputError}
            </p>
          )}
        </div>
      )}

      {phase.kind === "building" && <BuildProgress activeIndex={phase.progress} />}

      {phase.kind === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-conflict/40 bg-white p-5">
          <p className="text-ink">{phase.message}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => body && void build(body)}
              className="inline-flex items-center gap-2 rounded-full bg-maroon px-5 py-2.5 font-medium text-cream hover:bg-maroon-dark"
            >
              <RotateCcw className="size-4" aria-hidden /> Try again
            </button>
          </div>
          <p className="text-sm text-muted">Or use the pencil next to any answer above to change it.</p>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

function errorMessage(json: unknown): string | undefined {
  if (typeof json === "object" && json !== null && "error" in json) {
    const err = (json as { error: unknown }).error;
    if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") return err.message;
  }
  return undefined;
}

function eventId(json: unknown): string | undefined {
  if (typeof json === "object" && json !== null && "event" in json) {
    const ev = (json as { event: unknown }).event;
    if (typeof ev === "object" && ev !== null && "id" in ev && typeof ev.id === "string") return ev.id;
  }
  return undefined;
}
