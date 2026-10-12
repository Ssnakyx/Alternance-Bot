import { Suspense } from "react";
import Link from "next/link";
import { OfferCard } from "@/components/OfferCard";
import { RefreshButton } from "@/components/RefreshButton";
import { countByStatus, listOffers } from "@/lib/db";
import type { OfferStatus } from "@/lib/types";

const TABS = {
  todo: { label: "À traiter", statuses: ["new"] },
  ready: { label: "Lettres prêtes", statuses: ["draft"] },
  ignored: { label: "Ignorées", statuses: ["ignored"] },
} satisfies Record<string, { label: string; statuses: OfferStatus[] }>;
type TabKey = keyof typeof TABS;

export default function OffersPage({ searchParams }: PageProps<"/offres">) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Offres</h1>
          <p className="text-sm text-slate-500">
            Triées par compatibilité avec ton profil. Ouvre une offre pour relire la lettre et valider l&apos;envoi.
          </p>
        </div>
        <RefreshButton />
      </div>
      <Suspense fallback={<p className="text-slate-500">Chargement des offres...</p>}>
        <OfferList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OfferList({ searchParams }: { searchParams: PageProps<"/offres">["searchParams"] }) {
  const params = await searchParams;
  const tab: TabKey = typeof params.tab === "string" && params.tab in TABS ? (params.tab as TabKey) : "todo";
  const remoteOnly = params.remote === "1";
  const spontaneous = params.kind === "spontaneous";

  const [counts, rows] = await Promise.all([countByStatus(), listOffers(TABS[tab].statuses)]);
  let offers = rows;
  if (remoteOnly) offers = offers.filter((o) => o.remote);
  offers = offers.filter((o) => (spontaneous ? o.kind === "spontaneous" : o.kind === "offer"));

  const href = (patch: { tab?: TabKey; remote?: boolean; spontaneous?: boolean }) => {
    const q = new URLSearchParams({ tab: patch.tab ?? tab });
    if (patch.remote ?? remoteOnly) q.set("remote", "1");
    if (patch.spontaneous ?? spontaneous) q.set("kind", "spontaneous");
    return `/offres?${q}`;
  };
  const pill = (active: boolean, color = "bg-slate-900") =>
    `rounded-full px-3 py-1 text-sm ${active ? `${color} text-white` : "bg-white text-slate-600 ring-1 ring-slate-200"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TABS) as TabKey[]).map((key) => (
          <Link key={key} href={href({ tab: key })} className={pill(key === tab)}>
            {TABS[key].label}
            <span className="ml-1 opacity-60">{TABS[key].statuses.reduce((n, s) => n + (counts[s] ?? 0), 0)}</span>
          </Link>
        ))}
        <div className="ml-auto flex gap-2">
          <Link href={href({ spontaneous: !spontaneous })} className={pill(spontaneous, "bg-violet-600")}>
            Candidatures spontanées
          </Link>
          <Link href={href({ remote: !remoteOnly })} className={pill(remoteOnly, "bg-sky-600")}>
            Télétravail
          </Link>
        </div>
      </div>

      {offers.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-slate-500 ring-1 ring-slate-200">
          Aucune offre ici pour l&apos;instant.
        </p>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer) => (
            <li key={offer.id}>
              <OfferCard offer={offer} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
