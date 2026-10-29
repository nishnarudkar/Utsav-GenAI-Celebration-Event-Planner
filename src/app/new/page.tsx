import type { Metadata } from "next";
import Link from "next/link";
import { OnboardingChat } from "@/components/chat/OnboardingChat";
import { toISTDate } from "@/lib/rules/dates";

export const metadata: Metadata = { title: "Plan a celebration — Utsav" };
export const dynamic = "force-dynamic";

export default function NewEventPage() {
  // Computed on the server so the client and server agree on "today" (IST).
  const today = toISTDate(new Date());
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-display text-2xl text-maroon">
          Utsav
        </Link>
        <span className="text-sm text-muted">6 quick questions</span>
      </header>
      <OnboardingChat today={today} />
    </main>
  );
}
