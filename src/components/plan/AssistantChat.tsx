"use client";

import { ArrowUp, Check, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type FormEvent } from "react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { SuggestionChips } from "@/components/chat/SuggestionChips";
import type { FieldChange } from "@/lib/graph/types";
import type { AssistantResponse } from "@/lib/plan/assistant-view";
import { apiCall } from "@/lib/plan/client-api";
import { ASSISTANT_SUGGESTIONS } from "@/lib/schemas/assistant";

const SUGGESTIONS = ASSISTANT_SUGGESTIONS.map((q) => ({ label: q, value: q }));

/** How many earlier turns go with each message, so follow-ups like "make it 400" work. */
const HISTORY_TURNS = 6;

type Turn = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; text: string; action: AssistantResponse["action"]; confirmed?: boolean };

interface AssistantChatProps {
  eventId: string;
  /** Runs the change through the cascade, which shows the diff with Undo. Resolves true if it worked. */
  onConfirm: (change: FieldChange) => Promise<boolean>;
  busy: boolean;
}

/** Ask anything about the plan. Replies never change it: a proposed change waits for a click. */
export function AssistantChat({ eventId, onConfirm, busy }: AssistantChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const nextId = useRef(0);

  async function send(text: string) {
    const message = text.trim();
    if (!message || thinking) return;
    const history = turns.slice(-HISTORY_TURNS).map((t) => ({ role: t.role, text: t.text }));
    setTurns((list) => [...list, { id: nextId.current++, role: "user", text: message }]);
    setDraft("");
    setError(null);
    setThinking(true);
    const result = await apiCall<AssistantResponse>(`/api/events/${eventId}/assistant`, { method: "POST", body: JSON.stringify({ message, history }) });
    setThinking(false);
    if (result.ok) setTurns((list) => [...list, { id: nextId.current++, role: "assistant", text: result.data.reply, action: result.data.action }]);
    else setError(result.message);
  }

  async function confirm(turn: Extract<Turn, { role: "assistant" }>, change: FieldChange) {
    if (await onConfirm(change)) setTurns((list) => list.map((t) => (t.id === turn.id ? { ...t, confirmed: true } : t)));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  return (
    <section aria-labelledby="assistant-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5">
      <div>
        <h2 id="assistant-title" className="flex items-center gap-2 font-display text-xl text-maroon">
          <Sparkles className="size-5 text-marigold-ink" aria-hidden />
          Ask Utsav
        </h2>
        <p className="mt-1 text-sm text-muted">Ask about your plan or tell it what changed. Nothing changes until you confirm.</p>
      </div>

      {turns.length > 0 && (
        <div role="log" aria-label="Conversation" aria-live="polite" className="flex flex-col gap-3 rounded-xl bg-cream p-3">
          {turns.map((turn) =>
            turn.role === "user" ? (
              <MessageBubble key={turn.id} role="user">
                {turn.text}
              </MessageBubble>
            ) : (
              <MessageBubble key={turn.id} role="assistant">
                <p className="text-sm">{turn.text}</p>
                {turn.action?.type === "open" && (
                  <Link href={turn.action.href} className="mt-2 inline-block text-sm font-medium text-marigold-ink hover:underline">
                    {turn.action.label}
                  </Link>
                )}
                {turn.action?.type === "change" && (
                  <div className="mt-2 flex flex-col items-start gap-2">
                    <p className="text-sm font-semibold text-ink tabular-nums">{turn.action.label}</p>
                    {turn.confirmed ? (
                      <p className="inline-flex items-center gap-1 text-sm text-muted">
                        <Check className="size-4" aria-hidden /> Done. See what changed below.
                      </p>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => turn.action?.type === "change" && void confirm(turn, turn.action.change)}
                        className="rounded-full bg-maroon px-4 py-2 text-sm font-medium text-cream hover:bg-maroon-dark disabled:opacity-50"
                      >
                        Yes, change it
                      </button>
                    )}
                  </div>
                )}
              </MessageBubble>
            ),
          )}
          {thinking && (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Thinking…
            </p>
          )}
        </div>
      )}

      {turns.length === 0 && <SuggestionChips chips={SUGGESTIONS} onPick={(q) => void send(q)} disabled={thinking} label="Suggested questions" />}

      <form onSubmit={onSubmit} className="flex items-start gap-2">
        <div className="flex-1">
          <label htmlFor={inputId} className="sr-only">
            Ask Utsav about your plan
          </label>
          <input
            id={inputId}
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Can we move it a week later?"
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-ink placeholder:text-muted/70 focus:border-maroon focus:outline-none"
          />
        </div>
        <button type="submit" disabled={thinking || !draft.trim()} aria-label="Send question" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-maroon text-cream hover:bg-maroon-dark disabled:opacity-50">
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-increased">
          {error}
        </p>
      )}
    </section>
  );
}
