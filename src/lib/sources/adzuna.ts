import { optionalEnv } from "../env";
import type { NormalizedOffer, SearchPrefs } from "../types";
import { fetchJson, findEmail, mentionsRemote, stripHtml } from "./utils";

/**
 * Adzuna – agrégateur d'offres (Indeed, sites carrières...) avec une API gratuite.
 * Clés à créer sur https://developer.adzuna.com. La description est un extrait (≈500 caractères).
 */
const BASE_URL = "https://api.adzuna.com/v1/api/jobs/fr/search/1";

interface AdzunaJob {
  id: string;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
}

function toOffer(j: AdzunaJob): NormalizedOffer {
  const title = stripHtml(j.title) || "Offre sans titre";
  const description = stripHtml(j.description);
  return {
    id: `adzuna:${j.id}`,
    source: "adzuna",
    kind: "offer",
    title,
    company: j.company?.display_name ?? "Entreprise non communiquée",
    location: j.location?.display_name ?? "",
    remote: mentionsRemote(title, description),
    description,
    url: j.redirect_url ?? null,
    apply_email: findEmail(description),
    published_at: j.created ?? null,
  };
}

async function search(params: Record<string, string>, appId: string, appKey: string) {
  const url = `${BASE_URL}?${new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "50",
    sort_by: "date",
    max_days_old: "30",
    "content-type": "application/json",
    ...params,
  })}`;
  const res = await fetchJson<{ results?: AdzunaJob[] }>(url);
  return (res?.results ?? []).map(toOffer);
}

export async function fetchAdzuna(prefs: SearchPrefs): Promise<NormalizedOffer[]> {
  const appId = optionalEnv("ADZUNA_APP_ID");
  const appKey = optionalEnv("ADZUNA_APP_KEY");
  if (!appId || !appKey) return [];

  const offers = await search(
    { what: `alternance ${prefs.keywords}`, where: prefs.city, distance: String(prefs.radius_km) },
    appId,
    appKey,
  );
  if (prefs.include_remote) {
    const remote = await search({ what: `alternance ${prefs.keywords} télétravail` }, appId, appKey);
    offers.push(...remote.filter((o) => o.remote));
  }
  return offers;
}
