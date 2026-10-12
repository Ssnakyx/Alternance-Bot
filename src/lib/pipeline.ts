import "server-only";
import { prepareDossier, type DossierPart } from "./application";
import { scoreOffers } from "./claude";
import { addEvent, getProfile, getUnscoredOffers, insertNewOffers, topOffersWithoutLetter, updateOffer } from "./db";
import { describeError as describe } from "./errors";
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
  repliesFound: number;
  statusChanges: number;
  perSource: Partial<Record<OfferSource, number>>;
  errors: string[];
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
        updateOffer(r.id, { score: r.score, ai_work: r.ai_work, strengths: r.strengths, gaps: r.gaps, scored_at: now }),
      ),
    );
    scored += outcome.value.length;
  }
  return scored;
}

export interface PrepareReport {
  prepared: number;
  errors: string[];
}

/**
 * Prépare le dossier des meilleures offres (lettre, email, message court, adresse où postuler et,
 * si l'option est active, CV adapté) : il t'attend dans "Lettre prête", rien n'est envoyé.
 * Lancé séparément de la recherche d'offres pour que chaque étape tienne dans les 5 minutes
 * qu'accorde Vercel.
 */
export async function prepareTopDossiers(): Promise<PrepareReport> {
  const profile = await getProfile();
  const { auto_letters, auto_letter_min_score, auto_tailor_cv } = profile.search;
  if (!profile.cv_summary || auto_letters <= 0) return { prepared: 0, errors: [] };
  // Une même erreur (clé refusée, CV manquant...) touche souvent toutes les offres : on la regroupe.
  const failures = new Map<string, string[]>();
  const offers = await topOffersWithoutLetter(auto_letter_min_score, auto_letters);
  const parts: DossierPart[] = auto_tailor_cv ? ["texts", "cv", "email"] : ["texts", "email"];
  const settled = await Promise.allSettled(
    offers.map(async (offer) => {
      const todo = parts.filter((part) => part !== "cv" || !offer.tailored_cv);
      const { patch, errors: partErrors } = await prepareDossier(profile, offer, todo);
      for (const e of partErrors) failures.set(e, [...(failures.get(e) ?? []), offer.company || offer.title]);
      if (!patch.letter) {
        // Garde quand même ce qui a abouti (l'adresse trouvée, le CV) pour ne pas le repayer demain.
        if (Object.keys(patch).length > 0) await updateOffer(offer.id, patch);
        throw new Error("dossier non préparé");
      }
      await updateOffer(offer.id, { ...patch, status: "draft" });
      await addEvent({
        offer_id: offer.id,
        type: "letter_generated",
        status: "draft",
        summary: patch.tailored_cv
          ? "Lettre et CV adapté préparés automatiquement, en attente de ta validation"
          : "Lettre préparée automatiquement, en attente de ta validation",
      });
    }),
  );
  const errors = [...failures].map(([e, offers]) => (offers.length === 1 ? `${offers[0]} : ${e}` : `${e} (${offers.length} offres)`));
  return { prepared: settled.filter((outcome) => outcome.status === "fulfilled").length, errors };
}

/**
 * La recherche du matin (ou du bouton du tableau de bord) : nouvelles offres, notation,
 * réponses lues dans Gmail. Les dossiers sont préparés ensuite par prepareTopDossiers.
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
    repliesFound,
    statusChanges,
    perSource,
    errors: [...new Set(errors)],
  };
}
