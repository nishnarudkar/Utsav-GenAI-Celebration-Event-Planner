"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiCall } from "@/lib/plan/client-api";

/** Creates a fresh copy of the demo wedding and opens it. */
export function DemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await apiCall<{ event: { id: string } }>("/api/demo", { method: "POST" });
    if (result.ok) {
      router.push(`/events/${result.data.event.id}`);
      return; // keep the spinner until the dashboard opens
    }
    setError(result.message);
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void start()}
        className="inline-flex items-center gap-2 rounded-full border border-maroon px-6 py-3 font-medium text-maroon transition-colors hover:bg-maroon/5 disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Try the demo wedding
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-increased">
          {error}
        </p>
      )}
    </>
  );
}
