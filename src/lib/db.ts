import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";
import {
  DEFAULT_SEARCH,
  type CvSummary,
  type NormalizedOffer,
  type OfferEvent,
  type OfferRow,
  type OfferStatus,
  type Profile,
  type SearchPrefs,
} from "./types";

let client: SupabaseClient | null = null;

/** Client Supabase côté serveur uniquement (clé service_role, jamais envoyée au navigateur). */
export function db(): SupabaseClient {
  client ??= createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  return client;
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`Supabase : ${result.error.message}`);
  return result.data;
}

const PROFILE_COLUMNS = "full_name, email, phone, signature, cv_filename, cv_summary, search";

export async function getProfile(): Promise<Profile> {
  const row = check(
    await db().from("profile").select(PROFILE_COLUMNS).eq("id", 1).maybeSingle(),
  ) as (Omit<Profile, "search"> & { search: Partial<SearchPrefs> | null }) | null;
  return {
    full_name: row?.full_name ?? "",
    email: row?.email ?? "",
    phone: row?.phone ?? "",
    signature: row?.signature ?? "",
    cv_filename: row?.cv_filename ?? null,
    cv_summary: row?.cv_summary ?? null,
    search: { ...DEFAULT_SEARCH, ...(row?.search ?? {}) },
  };
}

export async function getCvPdf(): Promise<{ filename: string; base64: string } | null> {
  const row = check(
    await db().from("profile").select("cv_filename, cv_pdf_base64").eq("id", 1).maybeSingle(),
  ) as { cv_filename: string | null; cv_pdf_base64: string | null } | null;
  if (!row?.cv_pdf_base64) return null;
  return { filename: row.cv_filename ?? "CV.pdf", base64: row.cv_pdf_base64 };
}

export async function saveProfile(
  patch: Partial<Omit<Profile, "cv_summary">> & {
    cv_summary?: CvSummary | null;
    cv_pdf_base64?: string | null;
  },
): Promise<void> {
  check(
    await db()
      .from("profile")
      .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }),
  );
}

/** Insère les nouvelles offres sans écraser celles déjà connues (statut, score, lettre). */
export async function insertNewOffers(offers: NormalizedOffer[]): Promise<number> {
  if (offers.length === 0) return 0;
  const inserted = check(
    await db()
      .from("offers")
      .upsert(offers, { onConflict: "id", ignoreDuplicates: true })
      .select("id"),
  );
  return inserted?.length ?? 0;
}

/** Les dernières offres trouvées par une source, pour ne pas les chercher à nouveau. */
export async function recentOffersFrom(source: NormalizedOffer["source"], limit: number): Promise<Pick<OfferRow, "title" | "company">[]> {
  return check(
    await db()
      .from("offers")
      .select("title, company")
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as Pick<OfferRow, "title" | "company">[];
}

export async function getUnscoredOffers(limit: number): Promise<OfferRow[]> {
  return check(
    await db()
      .from("offers")
      .select("*")
      // Les offres notées avant l'option IA sont renotées une fois pour savoir si le poste en implique.
      .or("score.is.null,ai_work.is.null")
      .eq("status", "new")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(limit),
  ) as OfferRow[];
}

export async function listOffers(statuses: OfferStatus[]): Promise<OfferRow[]> {
  return check(
    await db()
      .from("offers")
      .select("*")
      .in("status", statuses)
      .order("score", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200),
  ) as OfferRow[];
}

export async function countByStatus(): Promise<Record<string, number>> {
  const rows = check(await db().from("offers").select("status")) as { status: string }[];
  const counts: Record<string, number> = {};
  for (const { status } of rows) counts[status] = (counts[status] ?? 0) + 1;
  return counts;
}

export async function getOffer(id: string): Promise<OfferRow | null> {
  return check(await db().from("offers").select("*").eq("id", id).maybeSingle()) as OfferRow | null;
}

export async function updateOffer(id: string, patch: Partial<OfferRow>): Promise<void> {
  check(await db().from("offers").update(patch).eq("id", id));
}

// ---------- Historique ----------

export async function addEvent(event: Omit<OfferEvent, "id" | "created_at"> & { email_message_id?: string }): Promise<void> {
  check(await db().from("offer_events").insert(event));
}

export async function listEvents(offerId: string): Promise<OfferEvent[]> {
  return check(
    await db().from("offer_events").select("*").eq("offer_id", offerId).order("created_at", { ascending: false }),
  ) as OfferEvent[];
}

export type EventWithOffer = OfferEvent & { offers: { title: string; company: string } | null };

export async function recentEvents(limit: number): Promise<EventWithOffer[]> {
  return check(
    await db()
      .from("offer_events")
      .select("*, offers(title, company)")
      .order("created_at", { ascending: false })
      .limit(limit),
  ) as EventWithOffer[];
}

export async function knownEmailMessageIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = check(
    await db().from("offer_events").select("email_message_id").in("email_message_id", ids),
  ) as { email_message_id: string }[];
  return new Set(rows.map((r) => r.email_message_id));
}

// ---------- Statistiques et automatisations ----------

export type StatsOffer = Pick<
  OfferRow,
  | "id"
  | "source"
  | "kind"
  | "remote"
  | "score"
  | "gaps"
  | "status"
  | "created_at"
  | "sent_at"
  | "followed_up_at"
  | "responded_at"
>;

export async function listOffersForStats(): Promise<StatsOffer[]> {
  return check(
    await db()
      .from("offers")
      .select("id, source, kind, remote, score, gaps, status, created_at, sent_at, followed_up_at, responded_at")
      .limit(10000),
  ) as StatsOffer[];
}

export async function topOffersWithoutLetter(minScore: number, limit: number): Promise<OfferRow[]> {
  return check(
    await db()
      .from("offers")
      .select("*")
      .eq("status", "new")
      .is("letter", null)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(limit),
  ) as OfferRow[];
}

/** Candidatures envoyées en attente de réponse, dont on connaît l'email du recruteur. */
export async function awaitingReplyWithEmail(): Promise<OfferRow[]> {
  return check(
    await db()
      .from("offers")
      .select("*")
      .in("status", ["sent", "followed_up", "interview"])
      .not("apply_email", "is", null)
      .not("sent_at", "is", null),
  ) as OfferRow[];
}
