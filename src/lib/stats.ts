import type { StatsOffer } from "./db";
import { ANSWERED_STATUSES, APPLIED_STATUSES, SOURCE_LABELS, type OfferSource } from "./types";

const DAY = 86_400_000;

export interface WeekBucket {
  label: string;
  start: number;
  sent: number;
  found: number;
}

export interface Stats {
  totalFound: number;
  foundThisWeek: number;
  sent: number;
  sentThisWeek: number;
  answered: number;
  responseRate: number | null;
  interviews: number;
  accepted: number;
  rejected: number;
  awaiting: number;
  toFollowUp: number;
  lettersReady: number;
  avgResponseDays: number | null;
  avgScoreApplied: number | null;
  weeks: WeekBucket[];
  funnel: { label: string; value: number }[];
  bySource: { label: string; found: number; sent: number }[];
  remote: { label: string; found: number; sent: number }[];
  topGaps: { label: string; count: number }[];
}

/** Lundi 00:00 (heure locale) de la semaine qui contient `t`. */
function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function time(iso: string | null): number | null {
  return iso ? new Date(iso).getTime() : null;
}

export function computeStats(offers: StatsOffer[], now: number, followUpDays: number, weeksBack = 8): Stats {
  const thisWeek = weekStart(now);
  const applied = offers.filter((o) => APPLIED_STATUSES.includes(o.status));
  const answered = applied.filter((o) => ANSWERED_STATUSES.includes(o.status));
  const count = (pred: (o: StatsOffer) => boolean) => offers.filter(pred).length;

  const responseDelays = answered
    .map((o) => {
      const sent = time(o.sent_at);
      const resp = time(o.responded_at);
      return sent !== null && resp !== null && resp >= sent ? (resp - sent) / DAY : null;
    })
    .filter((d): d is number => d !== null);

  const appliedScores = applied.map((o) => o.score).filter((s): s is number => s !== null);

  const weeks: WeekBucket[] = [];
  for (let i = weeksBack - 1; i >= 0; i--) {
    const start = thisWeek - i * 7 * DAY;
    weeks.push({
      start,
      label: new Date(start).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      sent: 0,
      found: 0,
    });
  }
  const bucketFor = (t: number | null) => {
    if (t === null) return undefined;
    const ws = weekStart(t);
    return weeks.find((w) => w.start === ws);
  };
  for (const o of offers) {
    const found = bucketFor(time(o.created_at));
    if (found) found.found++;
    const sent = APPLIED_STATUSES.includes(o.status) ? bucketFor(time(o.sent_at)) : undefined;
    if (sent) sent.sent++;
  }

  const sources = Object.keys(SOURCE_LABELS) as OfferSource[];
  const gapCounts = new Map<string, { label: string; count: number }>();
  for (const o of offers) {
    // On ne compte que les offres pertinentes : un manque sur une offre hors sujet n'apprend rien.
    if ((o.score ?? 0) < 50) continue;
    for (const gap of o.gaps) {
      const key = gap.trim().toLowerCase();
      if (!key) continue;
      const entry = gapCounts.get(key) ?? { label: gap.trim(), count: 0 };
      entry.count++;
      gapCounts.set(key, entry);
    }
  }

  const waitingSince = (o: StatsOffer) => time(o.followed_up_at) ?? time(o.sent_at);

  return {
    totalFound: offers.length,
    foundThisWeek: count((o) => (time(o.created_at) ?? 0) >= thisWeek),
    sent: applied.length,
    sentThisWeek: applied.filter((o) => (time(o.sent_at) ?? 0) >= thisWeek).length,
    answered: answered.length,
    responseRate: applied.length ? Math.round((answered.length / applied.length) * 100) : null,
    interviews: count((o) => o.status === "interview" || o.status === "accepted"),
    accepted: count((o) => o.status === "accepted"),
    rejected: count((o) => o.status === "rejected"),
    awaiting: count((o) => o.status === "sent" || o.status === "followed_up"),
    toFollowUp: count((o) => o.status === "sent" && now - (waitingSince(o) ?? now) > followUpDays * DAY),
    lettersReady: count((o) => o.status === "draft"),
    avgResponseDays: responseDelays.length
      ? Math.round((responseDelays.reduce((a, b) => a + b, 0) / responseDelays.length) * 10) / 10
      : null,
    avgScoreApplied: appliedScores.length
      ? Math.round(appliedScores.reduce((a, b) => a + b, 0) / appliedScores.length)
      : null,
    weeks,
    funnel: [
      { label: "Offres trouvées", value: offers.length },
      { label: "Compatibles (score ≥ 60)", value: count((o) => (o.score ?? 0) >= 60) },
      { label: "Candidatures envoyées", value: applied.length },
      { label: "Réponses reçues", value: answered.length },
      { label: "Entretiens", value: count((o) => o.status === "interview" || o.status === "accepted") },
      { label: "Acceptées", value: count((o) => o.status === "accepted") },
    ],
    bySource: sources.map((s) => ({
      label: SOURCE_LABELS[s],
      found: count((o) => o.source === s),
      sent: applied.filter((o) => o.source === s).length,
    })),
    remote: [
      { label: "Télétravail", found: count((o) => o.remote), sent: applied.filter((o) => o.remote).length },
      { label: "Sur place", found: count((o) => !o.remote), sent: applied.filter((o) => !o.remote).length },
    ],
    topGaps: [...gapCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8),
  };
}
