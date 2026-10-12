"use client";

import { useState, useTransition } from "react";
import { saveNotesAction } from "@/app/actions";
import { StatusSelect } from "@/components/StatusSelect";
import type { OfferStatus } from "@/lib/types";

export function StatusPanel({ id, status, notes }: { id: string; status: OfferStatus; notes: string }) {
  const [value, setValue] = useState(notes);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h2 className="font-medium">Suivi</h2>
      <StatusSelect
        id={id}
        status={status}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
      />
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="Notes : contact, date d'entretien, relance..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await saveNotesAction(id, value);
            setMessage(r.ok ? (r.message ?? null) : r.error);
          })
        }
        className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        Enregistrer les notes
      </button>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </section>
  );
}
