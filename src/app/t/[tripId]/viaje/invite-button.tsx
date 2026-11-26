"use client";

import { useState, useTransition } from "react";
import { issueInviteAction } from "../actions";

/**
 * Two taps on purpose: the first issues the link (a server round trip), the second opens
 * WhatsApp from a real link, which in-app browsers and popup blockers allow.
 */
export function InviteButton({ tripId, seatId }: { tripId: string; seatId: string }) {
  const [invite, setInvite] = useState<{ url: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!invite) {
    return (
      <span className="flex flex-col items-end">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await issueInviteAction(tripId, seatId);
              if (r.ok) setInvite(r);
              else setError(r.message);
            })
          }
          className="h-9 rounded-full bg-tint px-4 text-[14px] font-semibold disabled:opacity-50"
        >
          {pending ? "…" : "Invitar"}
        </button>
        {error && <span className="text-[12px] text-accent-text">{error}</span>}
      </span>
    );
  }
  return (
    <span className="flex gap-1.5">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(invite.message)}`}
        target="_blank"
        rel="noreferrer"
        className="flex h-9 items-center rounded-full bg-ink px-4 text-[14px] font-semibold text-bg"
      >
        WhatsApp
      </a>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(invite.url);
          setCopied(true);
        }}
        className="h-9 rounded-full bg-tint px-4 text-[14px] font-semibold"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </span>
  );
}
