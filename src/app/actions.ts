"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSession, safeEqual, sessionToken } from "@/lib/auth";
import { buildAttachments, contactPatch, prepareDossier, type DossierPart } from "@/lib/application";
import { findRecruiterEmail, parseCv, parseTailoredCv, tailorCv, toCvSummary, writeFollowUp } from "@/lib/claude";
import { addEvent, getCvPdf, getOffer, getProfile, saveProfile, updateOffer } from "@/lib/db";
import { describeError } from "@/lib/errors";
import { sendApplicationEmail } from "@/lib/mail";
import { prepareTopDossiers, refreshOffers, type PrepareReport, type RefreshReport } from "@/lib/pipeline";
import { changeStatus } from "@/lib/tracking";
import {
  APPLIED_STATUSES,
  OFFER_STATUSES,
  type DossierTexts,
  type OfferRow,
  type OfferStatus,
  type TailoredCv,
} from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

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
    return { ok: false, error: describeError(e) };
  }
}

/** Deuxième temps du bouton « Chercher » : les dossiers des meilleures offres. */
export async function prepareDossiersAction(): Promise<ActionResult<PrepareReport>> {
  await requireSession();
  try {
    const report = await prepareTopDossiers();
    revalidatePath("/", "layout");
    return { ok: true, data: report };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export type DossierResult = Pick<
  OfferRow,
  | "letter_subject"
  | "letter"
  | "cover_letter_title"
  | "cover_letter"
  | "short_message"
  | "tailored_cv"
  | "apply_email"
  | "apply_email_source"
>;

function dossierOf(offer: OfferRow): DossierResult {
  const { letter_subject, letter, cover_letter_title, cover_letter, short_message, tailored_cv } = offer;
  const { apply_email, apply_email_source } = offer;
  return { letter_subject, letter, cover_letter_title, cover_letter, short_message, tailored_cv, apply_email, apply_email_source };
}

/** L'IA rédige les textes (email, lettre, message court) et/ou adapte le CV à l'offre. */
export async function prepareDossierAction(id: string, parts: DossierPart[]): Promise<ActionResult<DossierResult>> {
  await requireSession();
  try {
    const [profile, offer] = await Promise.all([getProfile(), getOffer(id)]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    if (!profile.cv_summary) return { ok: false, error: "Ajoute d'abord ton CV dans la page Profil." };
    const { patch, errors } = await prepareDossier(profile, offer, parts);
    if (Object.keys(patch).length === 0) return { ok: false, error: errors.join(" · ") || "Rien n'a été généré." };
    await updateOffer(id, { ...patch, status: offer.status === "new" ? "draft" : offer.status });
    const done = [
      patch.letter && "lettre, email et message",
      patch.tailored_cv && "CV adapté",
      patch.apply_email && `adresse ${patch.apply_email}`,
    ].filter(Boolean);
    await addEvent({ offer_id: id, type: "letter_generated", status: null, summary: `Rédigé par l'IA : ${done.join(" et ")}` });
    revalidateOffer(id);
    const message = errors.length
      ? `En partie prêt. Problème : ${errors.join(" · ")}`
      : "Prêt : relis chaque partie et ajuste-la si besoin.";
    return { ok: true, data: dossierOf({ ...offer, ...patch }), message };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** L'IA cherche sur le web l'adresse où envoyer la candidature (offre, RH ou contact de l'entreprise). */
export async function findEmailAction(
  id: string,
): Promise<ActionResult<{ email: string | null; source: string; note: string }>> {
  await requireSession();
  try {
    const offer = await getOffer(id);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    const contact = await findRecruiterEmail(offer);
    await updateOffer(id, contactPatch(contact));
    if (contact.email) {
      await addEvent({
        offer_id: id,
        type: "letter_generated",
        status: null,
        summary: `Adresse trouvée par l'IA : ${contact.email}`,
      });
    }
    revalidateOffer(id);
    return {
      ok: true,
      data: { email: contact.email, source: contact.source_url, note: contact.note },
      message: contact.email ? `Adresse trouvée : ${contact.email}. Vérifie la source avant d'envoyer.` : undefined,
    };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** Retouche le CV adapté selon tes consignes (« mets plus en avant React », « retire le stage X »...). */
export async function retouchCvAction(id: string, instructions: string): Promise<ActionResult<TailoredCv>> {
  await requireSession();
  try {
    if (!instructions.trim()) return { ok: false, error: "Écris d'abord ce que tu veux changer." };
    const [profile, offer, cvPdf] = await Promise.all([getProfile(), getOffer(id), getCvPdf()]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    if (!cvPdf) return { ok: false, error: "Ajoute d'abord ton CV dans la page Profil." };
    const cv = await tailorCv(profile, offer, cvPdf.base64, { instructions, previous: offer.tailored_cv });
    await updateOffer(id, { tailored_cv: cv });
    await addEvent({ offer_id: id, type: "letter_generated", status: null, summary: "CV adapté retouché par l'IA" });
    revalidateOffer(id);
    return { ok: true, data: cv, message: "CV mis à jour." };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** Ne garde que les champs texte attendus, en chaînes. */
function cleanTexts(texts: DossierTexts): DossierTexts {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    letter_subject: str(texts.letter_subject),
    letter: str(texts.letter),
    cover_letter_title: str(texts.cover_letter_title),
    cover_letter: str(texts.cover_letter),
    short_message: str(texts.short_message),
  };
}

/** Enregistre tes retouches. `cv` : undefined = on n'y touche pas, null = on revient au CV d'origine. */
export async function saveDossierAction(id: string, texts: DossierTexts, cv?: TailoredCv | null): Promise<ActionResult> {
  await requireSession();
  try {
    const offer = await getOffer(id);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    await updateOffer(id, {
      ...cleanTexts(texts),
      ...(cv === undefined ? {} : { tailored_cv: cv === null ? null : parseTailoredCv(cv) }),
      status: offer.status === "new" ? "draft" : offer.status,
    });
    revalidateOffer(id);
    return { ok: true, message: "Enregistré." };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

/** Envoi par email : n'est appelé qu'après ta validation explicite dans l'interface. */
export async function sendApplicationAction(
  id: string,
  to: string,
  texts: DossierTexts,
  cv: TailoredCv | null | undefined,
  options: { tailoredCv: boolean; coverLetter: boolean },
): Promise<ActionResult> {
  await requireSession();
  try {
    texts = cleanTexts(texts);
    to = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Adresse email du recruteur invalide." };
    if (!texts.letter_subject.trim() || !texts.letter.trim()) {
      return { ok: false, error: "L'objet et le message de l'email sont obligatoires." };
    }
    const [profile, offer] = await Promise.all([getProfile(), getOffer(id)]);
    if (!offer) return { ok: false, error: "Offre introuvable." };
    // Ce qui part est exactement ce que tu as sous les yeux : on enregistre d'abord tes dernières retouches.
    const edits: Partial<OfferRow> = { ...texts, apply_email: to };
    // Adresse modifiée à la main : la source trouvée par l'IA ne la concerne plus.
    if (to !== offer.apply_email) edits.apply_email_source = null;
    if (cv !== undefined) edits.tailored_cv = cv === null ? null : parseTailoredCv(cv);
    await updateOffer(id, edits);
    const current = { ...offer, ...edits };
    const attachments = await buildAttachments(profile, current, options);
    await sendApplicationEmail({
      fromName: profile.full_name,
      replyTo: profile.email,
      to,
      subject: texts.letter_subject,
      body: texts.letter,
      attachments,
    });
    const joined = attachments.map((a) => a.filename).join(", ");
    await addEvent({
      offer_id: id,
      type: "email_sent",
      status: null,
      summary: `Candidature envoyée par email à ${to}${joined ? ` (pièces jointes : ${joined})` : ""}`,
    });
    if (!APPLIED_STATUSES.includes(offer.status)) await changeStatus(offer, "sent");
    revalidateOffer(id);
    return { ok: true, message: `Candidature envoyée à ${to}.` };
  } catch (e) {
    return { ok: false, error: describeError(e) };
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
    return { ok: false, error: describeError(e) };
  }
}

export async function saveNotesAction(id: string, notes: string): Promise<ActionResult> {
  await requireSession();
  try {
    await updateOffer(id, { notes });
    return { ok: true, message: "Notes enregistrées." };
  } catch (e) {
    return { ok: false, error: describeError(e) };
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
    return { ok: false, error: describeError(e) };
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
      attachments: [],
    });
    await addEvent({ offer_id: id, type: "followup_sent", status: null, summary: `Relance envoyée à ${offer.apply_email}` });
    if (offer.status === "sent") await changeStatus(offer, "followed_up");
    revalidateOffer(id);
    return { ok: true, message: "Relance envoyée." };
  } catch (e) {
    return { ok: false, error: describeError(e) };
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
    return { ok: false, error: describeError(e) };
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
        web_search: formData.get("web_search") === "on",
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
        auto_tailor_cv: formData.get("auto_tailor_cv") === "on",
        follow_up_days: Math.max(1, Math.round(num("follow_up_days", current.search.follow_up_days))),
      },
    });
    revalidatePath("/profil");
    return { ok: true, message: "Profil enregistré." };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}
