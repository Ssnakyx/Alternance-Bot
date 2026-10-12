"use client";

import { useState, useTransition } from "react";
import { prepareDossiersAction, refreshAction } from "@/app/actions";
import type { PrepareReport, RefreshReport } from "@/lib/pipeline";
import { SOURCE_LABELS, type OfferSource } from "@/lib/types";

type Step = "search" | "prepare" | null;

export function RefreshButton() {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>(null);
  const [report, setReport] = useState<RefreshReport | null>(null);
  const [prepared, setPrepared] = useState<PrepareReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    setReport(null);
    setPrepared(null);
    startTransition(async () => {
      // Deux appels l'un après l'autre : chacun dispose ainsi de ses 5 minutes sur Vercel.
      setStep("search");
      const search = await refreshAction();
      if (!search.ok) {
        setError(search.error);
        setStep(null);
        return;
      }
      setReport(search.data ?? null);
      setStep("prepare");
      const prep = await prepareDossiersAction();
      if (prep.ok) setPrepared(prep.data ?? null);
      else setError(`Dossiers : ${prep.error}`);
      setStep(null);
    });
  }

  const label =
    step === "search"
      ? "Recherche et notation des offres..."
      : step === "prepare"
        ? "Préparation des dossiers des meilleures offres..."
        : "Chercher de nouvelles offres";

  return (
    <div className="space-y-2">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {label}
      </button>
      {pending && <p className="text-xs text-slate-500">Ça peut prendre quelques minutes, tu peux laisser la page ouverte.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {report && (
        <div className="text-sm text-slate-600">
          <p>
            {report.inserted} nouvelle(s) offre(s) sur {report.fetched} trouvée(s), {report.scored} notée(s),{" "}
            {report.repliesFound} réponse(s) lue(s) dans Gmail
            {prepared ? `, ${prepared.prepared} dossier(s) préparé(s)` : ""}.{" "}
            {Object.entries(report.perSource)
              .map(([source, n]) => `${SOURCE_LABELS[source as OfferSource]} : ${n}`)
              .join(" · ")}
          </p>
          {[...report.errors, ...(prepared?.errors ?? [])].map((e) => (
            <p key={e} className="text-amber-700">
              {e}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
