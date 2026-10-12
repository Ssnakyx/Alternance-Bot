import Link from "next/link";
import { Suspense } from "react";
import { HorizontalBars, StatTile, WeeklyBars } from "@/components/charts";
import { RefreshButton } from "@/components/RefreshButton";
import { loadDashboard } from "@/lib/views";

// Les actions de cette page appellent l'IA (recherche et notation, ou rédaction du dossier).
export const maxDuration = 300;

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-slate-500">
            Mis à jour tout seul chaque matin : nouvelles offres, lettres préparées pour les meilleures, réponses lues
            dans ta boîte mail.
          </p>
        </div>
        <RefreshButton />
      </div>
      <Suspense fallback={<p className="text-slate-500">Calcul des statistiques...</p>}>
        <Dashboard />
      </Suspense>
    </div>
  );
}

function percent(n: number | null): string {
  return n === null ? "–" : `${n}%`;
}

function relativeTime(iso: string, now: number): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

async function Dashboard() {
  const { profile, events, now, stats: s } = await loadDashboard();

  const todo = [
    { count: s.lettersReady, text: "lettre(s) prête(s) à relire et envoyer", href: "/offres?tab=ready" },
    { count: s.toFollowUp, text: `candidature(s) sans réponse depuis ${profile.search.follow_up_days} jours, à relancer`, href: "/suivi" },
    { count: s.interviews - s.accepted, text: "entretien(s) en cours à préparer", href: "/suivi" },
  ].filter((t) => t.count > 0);

  return (
    <div className="space-y-6">
      {!profile.cv_summary && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          Commence par ajouter ton CV dans{" "}
          <Link href="/profil" className="font-medium underline">
            ton profil
          </Link>{" "}
          : il sert à noter les offres et à rédiger les lettres.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Offres trouvées" value={s.totalFound} hint={`+${s.foundThisWeek} cette semaine`} />
        <StatTile label="Candidatures" value={s.sent} hint={`${s.sentThisWeek} cette semaine`} />
        <StatTile label="Taux de réponse" value={percent(s.responseRate)} hint={`${s.answered} réponse(s)`} />
        <StatTile label="Entretiens" value={s.interviews} hint={`${s.awaiting} en attente de réponse`} />
        <StatTile label="Acceptées" value={s.accepted} hint={`${s.rejected} refus`} />
        <StatTile
          label="Délai de réponse"
          value={s.avgResponseDays === null ? "–" : `${s.avgResponseDays} j`}
          hint={s.avgScoreApplied === null ? "en moyenne" : `score moyen envoyé : ${s.avgScoreApplied}%`}
        />
      </div>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">À faire</h2>
        {todo.length === 0 ? (
          <p className="text-sm text-slate-500">Rien d&apos;urgent. Les nouvelles offres arrivent chaque matin.</p>
        ) : (
          <ul className="space-y-2">
            {todo.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center gap-3 text-sm hover:text-indigo-700">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-semibold text-white">
                    {t.count}
                  </span>
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">Candidatures envoyées par semaine</h2>
          <p className="mb-2 text-xs text-slate-500">8 dernières semaines</p>
          <WeeklyBars data={s.weeks.map((w) => ({ label: w.label, value: w.sent }))} unit="candidature(s)" />
        </section>

        <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Entonnoir</h2>
          <HorizontalBars
            rows={s.funnel.map((f, i) => {
              const prev = i > 0 ? s.funnel[i - 1].value : null;
              const rate = prev ? ` (${Math.round((f.value / prev) * 100)}%)` : "";
              return { label: f.label, value: f.value, detail: `${f.value}${rate}` };
            })}
          />
        </section>

        <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="mb-3 font-medium">Par source</h2>
          <HorizontalBars
            rows={s.bySource.map((r) => ({
              label: r.label,
              value: r.found,
              detail: `${r.found} offres · ${r.sent} candidature(s)`,
            }))}
          />
          <h2 className="mb-3 mt-6 font-medium">Lyon ou télétravail</h2>
          <HorizontalBars
            colorClass="bg-sky-500"
            rows={s.remote.map((r) => ({
              label: r.label,
              value: r.found,
              detail: `${r.found} offres · ${r.sent} candidature(s)`,
            }))}
          />
        </section>

        <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="font-medium">Compétences qui te manquent le plus souvent</h2>
          <p className="mb-3 text-xs text-slate-500">Sur les offres compatibles (score ≥ 50) : de bonnes pistes à travailler.</p>
          {s.topGaps.length === 0 ? (
            <p className="text-sm text-slate-500">Pas encore assez d&apos;offres notées.</p>
          ) : (
            <HorizontalBars
              colorClass="bg-amber-500"
              rows={s.topGaps.map((g) => ({ label: g.label, value: g.count, detail: `${g.count} offre(s)` }))}
            />
          )}
        </section>
      </div>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 font-medium">Activité récente</h2>
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune activité pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <Link href={`/offres/${encodeURIComponent(e.offer_id)}`} className="min-w-0 flex-1 hover:text-indigo-700">
                  <span className="font-medium">{e.offers?.title ?? "Offre"}</span>
                  {e.offers?.company && <span className="text-slate-500"> · {e.offers.company}</span>}
                  <span className="block text-slate-600">{e.summary}</span>
                </Link>
                <span className="text-xs text-slate-400">{relativeTime(e.created_at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
