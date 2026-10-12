import { optionalEnv } from "../env";
import type { NormalizedOffer, SearchPrefs } from "../types";
import { fetchJson, findEmail, mentionsRemote, stripHtml } from "./utils";

/**
 * La Bonne Alternance (API officielle de l'apprentissage, gratuite).
 * Clé à créer sur https://api.apprentissage.beta.gouv.fr (compte puis "Mes jetons").
 * Doc : https://api.apprentissage.beta.gouv.fr/fr/explorer/recherche-offre
 */
const BASE_URL = "https://api.apprentissage.beta.gouv.fr/api/job/v1/search";

// Les champs suivent le schéma documenté ; tout est optionnel pour rester robuste.
interface LbaItem {
  identifier?: { id?: string | null; partner_label?: string | null };
  workplace?: {
    name?: string | null;
    brand?: string | null;
    legal_name?: string | null;
    description?: string | null;
    website?: string | null;
    location?: { address?: string | null } | null;
  } | null;
  offer?: {
    title?: string | null;
    description?: string | null;
    publication?: { creation?: string | null } | null;
  } | null;
  contract?: { remote?: string | null; start?: string | null } | null;
  apply?: { url?: string | null; phone?: string | null } | null;
}

interface LbaResponse {
  jobs?: LbaItem[];
  recruiters?: LbaItem[];
}

const MAX_SPONTANEOUS = 30;

function companyName(item: LbaItem): string {
  const w = item.workplace;
  return w?.brand || w?.name || w?.legal_name || "Entreprise non communiquée";
}

function toOffer(item: LbaItem, kind: "offer" | "spontaneous"): NormalizedOffer | null {
  const sourceId = item.identifier?.id;
  if (!sourceId) return null;
  const company = companyName(item);
  const description = stripHtml(item.offer?.description ?? item.workplace?.description);
  const remoteField = item.contract?.remote;
  return {
    id: `lba:${sourceId}`,
    source: "lba",
    kind,
    title: kind === "offer" ? (item.offer?.title ?? "Offre sans titre") : `Candidature spontanée – ${company}`,
    company,
    location: item.workplace?.location?.address ?? "",
    remote: remoteField === "remote" || remoteField === "hybrid" || mentionsRemote(description),
    description,
    url: item.apply?.url ?? item.workplace?.website ?? null,
    apply_email: findEmail(description),
    published_at: item.offer?.publication?.creation ?? null,
  };
}

async function search(params: Record<string, string>, token: string): Promise<LbaResponse> {
  const url = `${BASE_URL}?${new URLSearchParams(params)}`;
  return (await fetchJson<LbaResponse>(url, { headers: { Authorization: `Bearer ${token}` } })) ?? {};
}

export async function fetchLba(prefs: SearchPrefs): Promise<NormalizedOffer[]> {
  const token = optionalEnv("LBA_API_TOKEN");
  if (!token) return [];
  const romes = prefs.romes.join(",");

  const local = await search(
    {
      romes,
      latitude: String(prefs.latitude),
      longitude: String(prefs.longitude),
      radius: String(prefs.radius_km),
    },
    token,
  );

  const offers: NormalizedOffer[] = [
    ...(local.jobs ?? []).map((j) => toOffer(j, "offer")),
    // Les recruteurs sont triés par distance : on garde les plus proches.
    ...(local.recruiters ?? []).slice(0, MAX_SPONTANEOUS).map((r) => toOffer(r, "spontaneous")),
  ].filter((o): o is NormalizedOffer => o !== null);

  if (prefs.include_remote) {
    // Recherche France entière, puis on ne garde que les offres en télétravail.
    const national = await search({ romes }, token);
    for (const job of national.jobs ?? []) {
      const offer = toOffer(job, "offer");
      if (offer?.remote) offers.push(offer);
    }
  }
  return offers;
}
