import "server-only";
import type { LiveNotification } from "@/lib/schemas/dayof";

/**
 * Outgoing WhatsApp messages. Only mock mode exists: messages are recorded and shown in the
 * "Sent messages" panel, never delivered. Twilio also needs vendors' numbers, which Utsav
 * doesn't collect yet (see docs/DECISIONS.md).
 */
export function sendWhatsApp(to: string, body: string, now: Date = new Date()): LiveNotification {
  return { id: crypto.randomUUID(), channel: "whatsapp", to, body, status: "logged", sentAt: now.toISOString() };
}
