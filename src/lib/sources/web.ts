import { createHash } from "node:crypto";
import { searchWebOffers } from "../claude";
import { optionalEnv } from "../env";
import type { NormalizedOffer, SearchPrefs } from "../types";
import { mentionsRemote } from "./utils";

/**
 * Recherche web – les sites sans API publique (LinkedIn, Indeed, Welcome to the Jungle,
 * HelloWork...) interdisent le scraping et bloquent les serveurs. L'IA passe donc par un moteur
 * de recherche, comme tu le ferais à la main, et ne garde que les offres dont elle a vu la page.
 * Utilise la clé ANTHROPIC_API_KEY ; se désactive dans le profil.
 */

/** Paramètres de suivi qui changent d'une recherche à l'autre pour la même offre. */
const TRACKING_PARAMS = /^(utm_|ref|refid|trk|tracking|src|source|from|position|pagenum|origin|campaign|currentjobid|eboid)/i;

/** Même offre, même identifiant : on ignore le schéma, le "www.", les paramètres de suivi et le "/" final. */
function stableUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const params = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_PARAMS.test(key))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(params).toString();
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function publishedAt(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function fetchWeb(prefs: SearchPrefs): Promise<NormalizedOffer[]> {
  if (!prefs.web_search || !optionalEnv("ANTHROPIC_API_KEY")) return [];
  const offers = await searchWebOffers(prefs);
  return offers.map((o) => ({
    id: `web:${createHash("sha1").update(stableUrl(o.url)).digest("hex").slice(0, 16)}`,
    source: "web",
    kind: "offer",
    title: o.title.trim(),
    company: o.company.trim() || "Entreprise non communiquée",
    location: o.location.trim(),
    remote: o.remote || mentionsRemote(o.title, o.location, o.summary),
    description: o.summary.trim(),
    url: o.url,
    apply_email: null,
    published_at: publishedAt(o.published),
  }));
}
