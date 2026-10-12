import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OfferBadges, ScoreBadge, formatDate } from "@/components/badges";
import { DossierPanel } from "@/components/DossierPanel";
import { FollowUpPanel } from "@/components/FollowUpPanel";
import { StatusPanel } from "@/components/StatusPanel";
import { APPLIED_STATUSES } from "@/lib/types";
import { loadOfferDetail } from "@/lib/views";

// Les actions de cette page appellent l'IA (recherche et notation, ou rédaction du dossier).
export const maxDuration = 300;

export default function OfferPage({ params }: PageProps<"/offres/[id]">) {
  return (
    <div className="space-y-4">
      <Link href="/offres" className="text-sm text-slate-500 hover:text-slate-900">
        ← Retour aux offres
      </Link>
      <Suspense fallback={<p className="text-slate-500">Chargement...</p>}>
        <OfferDetail params={params} />
      </Suspense>
    </div>
  );
}

function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function OfferDetail({ params }: { params: PageProps<"/offres/[id]">["params"] }) {
  const { id } = await params;
  const offerId = decodeId(id);
  const detail = await loadOfferDetail(offerId);
  if (!detail) notFound();
  const { offer, events, followUpDue, identity, hasOriginalCv } = detail;
  const applied = APPLIED_STATUSES.includes(offer.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0 space-y-6">
        <article className="space-y-5 rounded-xl bg-white p-6 ring-1 ring-slate-200">
          <header className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-semibold">{offer.title}</h1>
              <ScoreBadge score={offer.score} />
            </div>
            <p className="text-slate-600">
              {offer.company}
              {offer.location && ` · ${offer.location}`}
              {offer.published_at && ` · publiée le ${formatDate(offer.published_at)}`}
            </p>
            <OfferBadges offer={offer} />
          </header>

          {(offer.strengths.length > 0 || offer.gaps.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-emerald-50 p-3">
                <h2 className="mb-1 text-sm font-medium text-emerald-800">Points forts</h2>
                <ul className="list-inside list-disc text-sm text-emerald-900">
                  {offer.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <h2 className="mb-1 text-sm font-medium text-amber-800">Ce qui pourrait manquer</h2>
                <ul className="list-inside list-disc text-sm text-amber-900">
                  {offer.gaps.length ? offer.gaps.map((g) => <li key={g}>{g}</li>) : <li>Rien de bloquant</li>}
                </ul>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 font-medium">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {offer.description || "Pas de description fournie par la source."}
            </p>
          </section>

          {offer.url && (
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm font-medium text-indigo-600 hover:underline"
            >
              Voir l&apos;offre d&apos;origine ↗
            </a>
          )}
        </article>

        <DossierPanel
          id={offer.id}
          url={offer.url}
          initialEmail={offer.apply_email ?? ""}
          initial={{
            letter_subject: offer.letter_subject,
            letter: offer.letter,
            cover_letter_title: offer.cover_letter_title,
            cover_letter: offer.cover_letter,
            short_message: offer.short_message,
            tailored_cv: offer.tailored_cv,
          }}
          alreadySent={applied}
          hasOriginalCv={hasOriginalCv}
          identity={identity}
        />
      </div>

      <aside className="space-y-4">
        {applied && offer.apply_email && (offer.status === "sent" || offer.status === "followed_up") && (
          <FollowUpPanel id={offer.id} email={offer.apply_email} due={followUpDue} />
        )}
        <StatusPanel id={offer.id} status={offer.status} notes={offer.notes} />
        <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Historique</h2>
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">Rien pour l&apos;instant.</p>
          ) : (
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-indigo-500" />
                  <p className="text-slate-700">{e.summary}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(e.created_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
