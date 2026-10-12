"use client";

import { useState, useTransition } from "react";
import { refreshAction } from "@/app/actions";
import type { RefreshReport } from "@/lib/pipeline";
import { SOURCE_LABELS, type OfferSource } from "@/lib/types";

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<RefreshReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await refreshAction();
      if (result.ok) setReport(result.data ?? null);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Recherche et notation en cours..." : "Chercher de nouvelles offres"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {report && (
        <div className="text-sm text-slate-600">
          <p>
            {report.inserted} nouvelle(s) offre(s) sur {report.fetched} trouvée(s), {report.scored} notée(s),{" "}
            {report.lettersPrepared} lettre(s) préparée(s), {report.repliesFound} réponse(s) lue(s) dans Gmail.{" "}
            {Object.entries(report.perSource)
              .map(([source, n]) => `${SOURCE_LABELS[source as OfferSource]} : ${n}`)
              .join(" · ")}
          </p>
          {report.errors.map((e) => (
            <p key={e} className="text-amber-700">
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
