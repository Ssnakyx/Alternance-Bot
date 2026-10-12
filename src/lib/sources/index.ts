import type { NormalizedOffer, OfferSource, SearchPrefs } from "../types";
import { fetchAdzuna } from "./adzuna";
import { fetchFranceTravail } from "./francetravail";
import { fetchLba } from "./lba";

const SOURCES: Record<OfferSource, (prefs: SearchPrefs) => Promise<NormalizedOffer[]>> = {
  lba: fetchLba,
  francetravail: fetchFranceTravail,
  adzuna: fetchAdzuna,
};

export interface FetchResult {
  offers: NormalizedOffer[];
  perSource: Partial<Record<OfferSource, number>>;
  errors: string[];
}

function dedupeKey(o: NormalizedOffer): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return `${norm(o.title)}|${norm(o.company)}`;
}

/**
 * Interroge toutes les sources configurées en parallèle. Une source en erreur
 * n'empêche pas les autres de remonter leurs offres.
 */
export async function fetchAllOffers(prefs: SearchPrefs): Promise<FetchResult> {
  const entries = Object.entries(SOURCES) as [OfferSource, (p: SearchPrefs) => Promise<NormalizedOffer[]>][];
  const settled = await Promise.allSettled(entries.map(([, fetcher]) => fetcher(prefs)));

  const result: FetchResult = { offers: [], perSource: {}, errors: [] };
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();

  settled.forEach((outcome, i) => {
    const source = entries[i][0];
    if (outcome.status === "rejected") {
      result.errors.push(`${source} : ${outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)}`);
      return;
    }
    let kept = 0;
    for (const offer of outcome.value) {
      // La même offre est souvent publiée sur plusieurs sites : on ne la garde qu'une fois.
      const key = dedupeKey(offer);
      if (seenIds.has(offer.id) || (offer.kind === "offer" && seenKeys.has(key))) continue;
      seenIds.add(offer.id);
      seenKeys.add(key);
      result.offers.push(offer);
      kept++;
    }
    result.perSource[source] = kept;
  });
  return result;
}
