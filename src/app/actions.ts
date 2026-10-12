"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSession, safeEqual, sessionToken } from "@/lib/auth";
import { parseCv, toCvSummary, writeFollowUp, writeLetter } from "@/lib/claude";
import { addEvent, getCvPdf, getOffer, getProfile, saveProfile, updateOffer } from "@/lib/db";
import { sendApplicationEmail } from "@/lib/mail";
import { refreshOffers, type RefreshReport } from "@/lib/pipeline";
import { changeStatus } from "@/lib/tracking";
import { APPLIED_STATUSES, OFFER_STATUSES, type OfferStatus } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function revalidateOffer(id: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/offres/${encodeURIComponent(id)}`);
}

async function requireSession(): Promise<void> {
  const cookieStore = await cookies();
  if (!(await isValidSession(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/login");
  }
}

// ---------- Connexion ----------

export async function login(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { ok: false, error: "APP_PASSWORD n'est pas défini dans l'environnement." };
  const password = String(formData.get("password") ?? "");
  if (!safeEqual(password, expected)) return { ok: false, error: "Mot de passe incorrect." };

  (await cookies()).set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- Offres ----------

export async function refreshAction(): Promise<ActionResult<RefreshReport>> {
  await requireSession();
  try {
    const report = await refreshOffers();
    revalidatePath("/", "layout");
    return { ok: true, data: report };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function generateLetterAction(id: string): Promise<ActionResult<{ subject: string; body: string }>> {
  await requireSession();
  try {
    const [profile, offer] = await Promise.all([getProfile(), getOffer(id)]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    if (!profile.cv_summary) return { ok: false, error: "Ajoute d'abord ton CV dans la page Profil." };
    const letter = await writeLetter(profile, offer);
    await updateOffer(id, {
      letter_subject: letter.subject,
      letter: letter.body,
      status: offer.status === "new" ? "draft" : offer.status,
    });
    await addEvent({ offer_id: id, type: "letter_generated", status: null, summary: "Lettre rédigée par l'IA" });
    revalidateOffer(id);
    return { ok: true, data: letter };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function saveLetterAction(id: string, subject: string, body: string): Promise<ActionResult> {
  await requireSession();
  try {
    const offer = await getOffer(id);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    await updateOffer(id, {
      letter_subject: subject,
      letter: body,
      status: offer.status === "new" ? "draft" : offer.status,
    });
    revalidateOffer(id);
    return { ok: true, message: "Lettre enregistrée." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Envoi par email : n'est appelé qu'après ta validation explicite dans l'interface. */
export async function sendApplicationAction(
  id: string,
  to: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  await requireSession();
  try {
    if (!to.includes("@")) return { ok: false, error: "Adresse email du recruteur invalide." };
    if (!subject.trim() || !body.trim()) return { ok: false, error: "L'objet et le message sont obligatoires." };
    const [profile, cv, offer] = await Promise.all([getProfile(), getCvPdf(), getOffer(id)]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    await sendApplicationEmail({
      fromName: profile.full_name,
      replyTo: profile.email,
      to,
      subject,
      body,
      attachment: cv,
    });
    await updateOffer(id, { apply_email: to, letter_subject: subject, letter: body });
    await addEvent({ offer_id: id, type: "email_sent", status: null, summary: `Candidature envoyée par email à ${to}` });
    if (!APPLIED_STATUSES.includes(offer.status)) await changeStatus(offer, "sent");
    revalidateOffer(id);
    return { ok: true, message: `Candidature envoyée à ${to}.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function setStatusAction(id: string, status: OfferStatus): Promise<ActionResult> {
  await requireSession();
  if (!OFFER_STATUSES.includes(status)) return { ok: false, error: "Statut inconnu." };
  try {
    const offer = await getOffer(id);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    await changeStatus(offer, status);
    revalidateOffer(id);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function saveNotesAction(id: string, notes: string): Promise<ActionResult> {
  await requireSession();
  try {
    await updateOffer(id, { notes });
    return { ok: true, message: "Notes enregistrées." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------- Relances ----------

export async function generateFollowUpAction(id: string): Promise<ActionResult<{ subject: string; body: string }>> {
  await requireSession();
  try {
    const [profile, offer] = await Promise.all([getProfile(), getOffer(id)]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    return { ok: true, data: await writeFollowUp(profile, offer) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function sendFollowUpAction(id: string, subject: string, body: string): Promise<ActionResult> {
  await requireSession();
  try {
    const [profile, offer] = await Promise.all([getProfile(), getOffer(id)]);
    if (!offer?.apply_email) return { ok: false, error: "Pas d'email de recruteur pour cette offre." };
    if (!subject.trim() || !body.trim()) return { ok: false, error: "L'objet et le message sont obligatoires." };
    await sendApplicationEmail({
      fromName: profile.full_name,
      replyTo: profile.email,
      to: offer.apply_email,
      subject,
      body,
      attachment: null,
    });
    await addEvent({ offer_id: id, type: "followup_sent", status: null, summary: `Relance envoyée à ${offer.apply_email}` });
    if (offer.status === "sent") await changeStatus(offer, "followed_up");
    revalidateOffer(id);
    return { ok: true, message: "Relance envoyée." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------- Profil ----------

const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function uploadCvAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const file = formData.get("cv");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choisis un fichier PDF." };
  if (file.type !== "application/pdf") return { ok: false, error: "Le CV doit être un PDF." };
  if (file.size > MAX_CV_BYTES) return { ok: false, error: "PDF trop lourd (5 Mo maximum)." };
  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const cv = await parseCv(base64);
    const current = await getProfile();
    await saveProfile({
      cv_filename: file.name,
      cv_pdf_base64: base64,
      cv_summary: toCvSummary(cv),
      // On ne remplace pas ce que tu as déjà saisi à la main.
      full_name: current.full_name || cv.full_name,
      email: current.email || cv.email,
      phone: current.phone || cv.phone,
    });
    revalidatePath("/profil");
    return { ok: true, message: `CV analysé : ${cv.skills.length} compétences repérées.` };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

export async function saveProfileAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireSession();
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const num = (name: string, fallback: number) => {
    const n = Number(text(name).replace(",", "."));
    return Number.isFinite(n) && text(name) !== "" ? n : fallback;
  };
  try {
    const current = await getProfile();
    await saveProfile({
      full_name: text("full_name"),
      email: text("email"),
      phone: text("phone"),
      signature: text("signature"),
      search: {
        city: text("city") || current.search.city,
        latitude: num("latitude", current.search.latitude),
        longitude: num("longitude", current.search.longitude),
        radius_km: num("radius_km", current.search.radius_km),
        departement: text("departement") || current.search.departement,
        include_remote: formData.get("include_remote") === "on",
        keywords: text("keywords") || current.search.keywords,
        romes: text("romes")
          .split(/[\s,;]+/)
          .map((r) => r.toUpperCase())
          .filter(Boolean),
        rhythm: text("rhythm"),
        start_date: text("start_date"),
        school: text("school"),
        auto_letters: Math.max(0, Math.min(20, Math.round(num("auto_letters", current.search.auto_letters)))),
        auto_letter_min_score: Math.max(0, Math.min(100, Math.round(num("auto_letter_min_score", current.search.auto_letter_min_score)))),
        follow_up_days: Math.max(1, Math.round(num("follow_up_days", current.search.follow_up_days))),
      },
    });
    revalidatePath("/profil");
    return { ok: true, message: "Profil enregistré." };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
