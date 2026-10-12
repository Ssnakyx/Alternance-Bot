import "server-only";
import { scoreOffers, writeLetter } from "./claude";
import { addEvent, getProfile, getUnscoredOffers, insertNewOffers, topOffersWithoutLetter, updateOffer } from "./db";
import { syncInboxReplies } from "./inbox";
import { fetchAllOffers } from "./sources";
import type { OfferSource, Profile } from "./types";

/** Nombre max d'offres notées par rafraîchissement, pour maîtriser le coût et la durée. */
const MAX_SCORED_PER_RUN = 60;
const SCORE_BATCH_SIZE = 10;

export interface RefreshReport {
  fetched: number;
  inserted: number;
  scored: number;
  lettersPrepared: number;
  repliesFound: number;
  statusChanges: number;
  perSource: Partial<Record<OfferSource, number>>;
  errors: string[];
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function scorePendingOffers(profile: Profile, errors: string[]): Promise<number> {
  const pending = await getUnscoredOffers(MAX_SCORED_PER_RUN);
  const batches = [];
  for (let i = 0; i < pending.length; i += SCORE_BATCH_SIZE) {
    batches.push(pending.slice(i, i + SCORE_BATCH_SIZE));
  }
  const settled = await Promise.allSettled(batches.map((batch) => scoreOffers(profile, batch)));

  let scored = 0;
  const now = new Date().toISOString();
  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      errors.push(`score IA : ${describe(outcome.reason)}`);
      continue;
    }
    await Promise.all(
      outcome.value.map((r) =>
        updateOffer(r.id, { score: r.score, strengths: r.strengths, gaps: r.gaps, scored_at: now }),
      ),
    );
    scored += outcome.value.length;
  }
  return scored;
}

/** Prépare les lettres des meilleures offres : elles t'attendent dans "Lettre prête", rien n'est envoyé. */
async function prepareTopLetters(profile: Profile, errors: string[]): Promise<number> {
  const { auto_letters, auto_letter_min_score } = profile.search;
  if (auto_letters <= 0) return 0;
  const offers = await topOffersWithoutLetter(auto_letter_min_score, auto_letters);
  const settled = await Promise.allSettled(
    offers.map(async (offer) => {
      const letter = await writeLetter(profile, offer);
      await updateOffer(offer.id, { letter_subject: letter.subject, letter: letter.body, status: "draft" });
      await addEvent({
        offer_id: offer.id,
        type: "letter_generated",
        status: "draft",
        summary: "Lettre préparée automatiquement, en attente de ta validation",
      });
    }),
  );
  let prepared = 0;
  for (const outcome of settled) {
    if (outcome.status === "fulfilled") prepared++;
    else errors.push(`lettre auto : ${describe(outcome.reason)}`);
  }
  return prepared;
}

/**
 * La routine complète (lancée chaque matin, ou à la main depuis le tableau de bord) :
 * nouvelles offres, notation, lettres préparées pour le top, réponses lues dans Gmail.
 */
export async function refreshOffers(): Promise<RefreshReport> {
  const profile = await getProfile();
  if (!profile.cv_summary) {
    throw new Error("Ajoute d'abord ton CV dans la page Profil.");
  }
  const { offers, perSource, errors } = await fetchAllOffers(profile.search);
  if (Object.keys(perSource).length === 0 && errors.length === 0) {
    errors.push("Aucune source configurée : ajoute au moins une clé d'API (voir README).");
  }
  const inserted = await insertNewOffers(offers);
  const scored = await scorePendingOffers(profile, errors);
  const lettersPrepared = await prepareTopLetters(profile, errors);

  let repliesFound = 0;
  let statusChanges = 0;
  try {
    const inbox = await syncInboxReplies();
    repliesFound = inbox.replies;
    statusChanges = inbox.statusChanges;
  } catch (e) {
    errors.push(`lecture Gmail : ${describe(e)}`);
  }

  return {
    fetched: offers.length,
    inserted,
    scored,
    lettersPrepared,
    repliesFound,
    statusChanges,
    perSource,
    errors,
  };
}
