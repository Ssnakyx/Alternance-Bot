import { optionalEnv } from "../env";
import type { NormalizedOffer, SearchPrefs } from "../types";
import { fetchJson, findEmail, mentionsRemote } from "./utils";

/**
 * France Travail – API "Offres d'emploi v2" (gratuite).
 * Application à créer sur https://francetravail.io (accès à l'API "Offres d'emploi").
 */
const TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";

// E2 = contrat d'apprentissage, FS = contrat de professionnalisation.
const ALTERNANCE_CONTRACTS = "E2,FS";

interface FtOffer {
  id: string;
  intitule?: string;
  description?: string;
  dateCreation?: string;
  lieuTravail?: { libelle?: string };
  entreprise?: { nom?: string };
  contact?: { courriel?: string; urlPostulation?: string; coordonnees1?: string };
  origineOffre?: { urlOrigine?: string };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(clientId: string, clientSecret: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const res = await fetchJson<{ access_token: string; expires_in: number }>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "api_offresdemploiv2 o2dsoffre",
    }),
  });
  if (!res) throw new Error("France Travail : jeton d'accès vide");
  cachedToken = { value: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return res.access_token;
}

function toOffer(o: FtOffer): NormalizedOffer {
  const description = o.description ?? "";
  return {
    id: `francetravail:${o.id}`,
    source: "francetravail",
    kind: "offer",
    title: o.intitule ?? "Offre sans titre",
    company: o.entreprise?.nom ?? "Entreprise non communiquée",
    location: o.lieuTravail?.libelle ?? "",
    remote: mentionsRemote(o.intitule, description),
    description,
    url:
      o.contact?.urlPostulation ??
      o.origineOffre?.urlOrigine ??
      `https://candidat.francetravail.fr/offres/recherche/detail/${o.id}`,
    apply_email: findEmail(o.contact?.courriel, o.contact?.coordonnees1, description),
    published_at: o.dateCreation ?? null,
  };
}

async function search(params: Record<string, string>, token: string): Promise<FtOffer[]> {
  const url = `${SEARCH_URL}?${new URLSearchParams({
    natureContrat: ALTERNANCE_CONTRACTS,
    sort: "1", // les plus récentes d'abord
    range: "0-149",
    ...params,
  })}`;
  const res = await fetchJson<{ resultats?: FtOffer[] }>(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return res?.resultats ?? [];
}

export async function fetchFranceTravail(prefs: SearchPrefs): Promise<NormalizedOffer[]> {
  const clientId = optionalEnv("FRANCE_TRAVAIL_CLIENT_ID");
  const clientSecret = optionalEnv("FRANCE_TRAVAIL_CLIENT_SECRET");
  if (!clientId || !clientSecret) return [];
  const token = await getToken(clientId, clientSecret);

  const offers = (
    await search({ motsCles: prefs.keywords, departement: prefs.departement }, token)
  ).map(toOffer);

  if (prefs.include_remote) {
    const national = await search({ motsCles: prefs.keywords }, token);
    offers.push(...national.map(toOffer).filter((o) => o.remote));
  }
  return offers;
}
