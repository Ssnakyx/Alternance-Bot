import Link from "next/link";
import { Suspense } from "react";
import { formatDate } from "@/components/badges";
import { StatusSelect } from "@/components/StatusSelect";
import { STATUS_LABELS, type OfferStatus } from "@/lib/types";
import { loadBoard } from "@/lib/views";

const COLUMNS: { status: OfferStatus; accent: string }[] = [
  { status: "draft", accent: "border-t-slate-400" },
  { status: "sent", accent: "border-t-indigo-500" },
  { status: "followed_up", accent: "border-t-sky-500" },
  { status: "interview", accent: "border-t-amber-500" },
  { status: "accepted", accent: "border-t-emerald-500" },
  { status: "rejected", accent: "border-t-rose-400" },
];

export default function TrackingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Suivi des candidatures</h1>
        <p className="text-sm text-slate-500">
          Les réponses reçues dans Gmail font avancer les cartes toutes seules. Tu peux aussi changer un statut à la main.
        </p>
      </div>
      <Suspense fallback={<p className="text-slate-500">Chargement...</p>}>
        <Board />
      </Suspense>
    </div>
  );
}

async function Board() {
  const items = await loadBoard(COLUMNS.map((c) => c.status));

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="grid min-w-[1100px] grid-cols-6 gap-3">
        {COLUMNS.map(({ status, accent }) => {
          const cards = items
            .filter(({ offer }) => offer.status === status)
            .sort((a, b) =>
              (b.offer.sent_at ?? b.offer.created_at).localeCompare(a.offer.sent_at ?? a.offer.created_at),
            );
          return (
            <section key={status} className={`rounded-xl border-t-4 bg-slate-100/70 p-2 ${accent}`}>
              <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-medium">
                {STATUS_LABELS[status]}
                <span className="text-slate-400">{cards.length}</span>
              </h2>
              <ul className="space-y-2">
                {cards.map(({ offer: o, followUpDue }) => (
                  <li key={o.id} className="space-y-2 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200">
                    <Link href={`/offres/${encodeURIComponent(o.id)}`} className="block hover:text-indigo-700">
                      <p className="font-medium leading-snug">{o.title}</p>
                      <p className="text-slate-500">{o.company}</p>
                    </Link>
                    <div className="flex flex-wrap gap-1 text-xs">
                      {o.score !== null && <span className="rounded bg-slate-100 px-1.5 py-0.5">{o.score}%</span>}
                      {o.sent_at && <span className="text-slate-400">envoyée le {formatDate(o.sent_at)}</span>}
                      {followUpDue && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">À relancer</span>
                      )}
                    </div>
                    <StatusSelect id={o.id} status={o.status} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
