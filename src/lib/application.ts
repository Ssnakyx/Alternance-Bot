import "server-only";
import { findRecruiterEmail, tailorCv, writeApplication, type RecruiterContact } from "./claude";
import { getCvPdf } from "./db";
import { describeError as describe } from "./errors";
import { attachmentName, renderCvPdf, renderLetterPdf } from "./pdf";
import type { OfferRow, Profile } from "./types";

export type DossierPart = "texts" | "cv" | "email";

/**
 * Prépare le dossier d'une offre : email, lettre de motivation, message court, CV adapté et,
 * si l'offre n'en donne pas, l'adresse où envoyer la candidature. Les appels à l'IA partent en
 * parallèle. Renvoie les colonnes à enregistrer et les erreurs éventuelles (un CV qui échoue
 * n'empêche pas d'avoir la lettre, et inversement).
 */
export async function prepareDossier(
  profile: Profile,
  offer: OfferRow,
  parts: DossierPart[],
): Promise<{ patch: Partial<OfferRow>; errors: string[] }> {
  const cvPdf = parts.includes("cv") ? await getCvPdf() : null;
  // Inutile de chercher une adresse si l'offre en donne déjà une ou si on a déjà cherché
  // (le bouton « Trouver l'email » relance la recherche à la demande).
  const searchEmail = parts.includes("email") && !offer.apply_email && !offer.email_searched_at;
  const [texts, cv, contact] = await Promise.allSettled([
    parts.includes("texts") ? writeApplication(profile, offer) : Promise.resolve(null),
    parts.includes("cv") && cvPdf ? tailorCv(profile, offer, cvPdf.base64) : Promise.resolve(null),
    searchEmail ? findRecruiterEmail(offer) : Promise.resolve(null),
  ]);

  const patch: Partial<OfferRow> = {};
  const errors: string[] = [];
  if (texts.status === "fulfilled" && texts.value) {
    patch.letter_subject = texts.value.email_subject;
    patch.letter = texts.value.email_body;
    patch.cover_letter_title = texts.value.letter_title;
    patch.cover_letter = texts.value.letter_body;
    patch.short_message = texts.value.short_message;
  } else if (texts.status === "rejected") {
    errors.push(`lettre : ${describe(texts.reason)}`);
  }
  if (cv.status === "fulfilled" && cv.value) patch.tailored_cv = cv.value;
  else if (cv.status === "rejected") errors.push(`CV adapté : ${describe(cv.reason)}`);
  if (contact.status === "fulfilled" && contact.value) {
    Object.assign(patch, contactPatch(contact.value));
  } else if (contact.status === "rejected") {
    errors.push(`recherche de l'email : ${describe(contact.reason)}`);
  }
  if (parts.includes("cv") && !cvPdf) errors.push("CV adapté : ajoute d'abord ton CV en PDF dans le profil.");
  return { patch, errors };
}

/** Colonnes à enregistrer après une recherche d'email, trouvée ou non. */
export function contactPatch(contact: RecruiterContact): Partial<OfferRow> {
  const searched = { email_searched_at: new Date().toISOString() };
  return contact.email ? { ...searched, apply_email: contact.email, apply_email_source: contact.source_url || null } : searched;
}

/** Les pièces jointes de la candidature : le CV (adapté ou d'origine) et la lettre en PDF. */
export async function buildAttachments(
  profile: Profile,
  offer: OfferRow,
  options: { tailoredCv: boolean; coverLetter: boolean },
): Promise<{ filename: string; content: Buffer }[]> {
  const attachments: { filename: string; content: Buffer }[] = [];
  if (options.tailoredCv && offer.tailored_cv) {
    attachments.push({
      filename: attachmentName("CV", profile.full_name, offer.company),
      content: await renderCvPdf(profile, offer.tailored_cv),
    });
  } else {
    const original = await getCvPdf();
    if (original) attachments.push({ filename: original.filename, content: Buffer.from(original.base64, "base64") });
  }
  if (options.coverLetter && offer.cover_letter?.trim()) {
    attachments.push({
      filename: attachmentName("Lettre de motivation", profile.full_name, offer.company),
      content: await renderLetterPdf({
        profile,
        offer,
        title: offer.cover_letter_title ?? "",
        body: offer.cover_letter,
      }),
    });
  }
  return attachments;
}
