import { createHash } from "node:crypto";
import { searchWebOffers, type WebOffer, type WebSearchAngle } from "../claude";
import { recentOffersFrom } from "../db";
import { optionalEnv } from "../env";
import type { NormalizedOffer, SearchPrefs } from "../types";
import { mentionsRemote } from "./utils";

/**
 * Recherche web – les sites sans API publique (LinkedIn, Indeed, Welcome to the Jungle,
 * HelloWork...) interdisent le scraping et bloquent les serveurs. L'IA passe donc par un moteur
 * de recherche, comme tu le ferais à la main, et ne garde que les offres dont elle a vu la page.
 * Deux ou trois recherches tournent en parallèle, chacune sur ses sites, pour ramener plus d'offres.
 * Utilise la clé ANTHROPIC_API_KEY ; se désactive dans le profil.
 */

const JOB_BOARDS: WebSearchAngle = {
  sites: "Indeed, LinkedIn, HelloWork, Meteojob, Jobijoba, Monster, Jooble, l'Étudiant, 1jeune1solution",
  focus: "développeur fullstack, développeur web, front-end, back-end, développeur d'applications.",
};

const TECH_COMPANIES: WebSearchAngle = {
  sites:
    "Welcome to the Jungle, JobTeaser, APEC, Free-Work, Choose Your Boss, Jobs That Make Sense, et les pages " +
    "carrières des entreprises du numérique de la région (ESN, éditeurs de logiciels, startups)",
  focus: "développeur fullstack, web, JavaScript / TypeScript, React, Node.js, Python, logiciel.",
};

const AI_JOBS: WebSearchAngle = {
  sites: "Welcome to the Jungle, LinkedIn, Indeed, HelloWork, JobTeaser, et les pages carrières des startups d'IA",
  focus:
    "postes où l'on travaille avec l'IA : développeur IA, intégration d'IA ou de LLM, IA générative, agents " +
    "IA, automatisation avec l'IA, développeur fullstack IA, prompt engineer, data / machine learning.",
};

const REMOTE_JOBS: WebSearchAngle = {
  sites: "Welcome to the Jungle, LinkedIn, Indeed, HelloWork, Free-Work",
  focus: "développeur fullstack ou web en alternance avec télétravail total ou partiel, partout en France.",
};

/** Nombre d'offres déjà connues passées à l'IA pour qu'elle en cherche d'autres. */
const KNOWN_LIMIT = 80;

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
  const known = (await recentOffersFrom("web", KNOWN_LIMIT)).map((o) => `${o.title} (${o.company})`);
  const angles = [JOB_BOARDS, TECH_COMPANIES];
  if (prefs.ai_focus) angles.push(AI_JOBS);
  else if (prefs.include_remote) angles.push(REMOTE_JOBS);
  const settled = await Promise.allSettled(angles.map((angle) => searchWebOffers(prefs, angle, known)));
  const offers: WebOffer[] = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Une recherche qui échoue n'empêche pas les autres ; si toutes échouent, l'erreur remonte.
  if (offers.length === 0) {
    const failure = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failure) throw failure.reason;
  }
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
