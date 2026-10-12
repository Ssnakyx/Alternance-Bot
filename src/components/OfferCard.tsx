import Link from "next/link";
import { OfferBadges, ScoreBadge, formatDate } from "@/components/badges";
import type { OfferRow } from "@/lib/types";

export function OfferCard({ offer }: { offer: OfferRow }) {
  return (
    <Link
      href={`/offres/${encodeURIComponent(offer.id)}`}
      className="flex gap-4 rounded-xl bg-white p-4 ring-1 ring-slate-200 transition hover:ring-indigo-300"
    >
      <div className="pt-0.5">
        <ScoreBadge score={offer.score} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">{offer.title}</h2>
          <span className="text-xs text-slate-400">{formatDate(offer.published_at ?? offer.created_at)}</span>
        </div>
        <p className="text-sm text-slate-600">
          {offer.company}
          {offer.location && ` · ${offer.location}`}
        </p>
        {offer.strengths.length > 0 && <p className="text-sm text-emerald-700">+ {offer.strengths.join(" · ")}</p>}
        {offer.gaps.length > 0 && <p className="text-sm text-amber-700">− {offer.gaps.join(" · ")}</p>}
        <OfferBadges offer={offer} />
      </div>
    </Link>
  );
}
