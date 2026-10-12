"use client";

import { useTransition } from "react";
import { setStatusAction } from "@/app/actions";
import { OFFER_STATUSES, STATUS_LABELS, type OfferStatus } from "@/lib/types";

export function StatusSelect({ id, status, className }: { id: string; status: OfferStatus; className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={status}
      disabled={pending}
      aria-label="Statut de la candidature"
      onChange={(e) => {
        const next = e.target.value as OfferStatus;
        startTransition(async () => {
          const result = await setStatusAction(id, next);
          if (!result.ok) window.alert(result.error);
        });
      }}
      className={className ?? "w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs disabled:opacity-60"}
    >
      {OFFER_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
