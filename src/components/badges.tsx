import { SOURCE_LABELS, STATUS_LABELS, type OfferRow } from "@/lib/types";

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">non noté</span>;
  }
  const color =
    score >= 75 ? "bg-emerald-100 text-emerald-800" : score >= 50 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${color}`}>{score}%</span>;
}

export function OfferBadges({ offer }: { offer: OfferRow }) {
  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      {offer.remote && <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800">Télétravail</span>}
      {offer.kind === "spontaneous" && (
        <span className="rounded bg-violet-100 px-2 py-0.5 text-violet-800">Candidature spontanée</span>
      )}
      {offer.apply_email && <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700">Email direct</span>}
      <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{SOURCE_LABELS[offer.source]}</span>
      {offer.status !== "new" && (
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-indigo-700">{STATUS_LABELS[offer.status]}</span>
      )}
    </div>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
