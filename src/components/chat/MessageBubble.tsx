import { Pencil } from "lucide-react";
import type { ReactNode } from "react";

interface MessageBubbleProps {
  role: "assistant" | "user";
  children: ReactNode;
  /** Shown on answered user messages: lets the person go back and change that answer. */
  onEdit?: () => void;
  editLabel?: string;
}

export function MessageBubble({ role, children, onEdit, editLabel }: MessageBubbleProps) {
  if (role === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-line bg-white px-4 py-3 text-ink shadow-sm">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded-full p-1.5 text-muted hover:bg-line/60 hover:text-maroon"
          aria-label={editLabel ?? "Change this answer"}
        >
          <Pencil className="size-4" aria-hidden />
        </button>
      )}
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-maroon px-4 py-3 text-cream">{children}</div>
    </div>
  );
}
