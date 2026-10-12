import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { getOffer, getProfile } from "@/lib/db";
import { attachmentName, pdfResponse, renderLetterPdf } from "@/lib/pdf";

/** La lettre de motivation enregistrée pour l'offre, en PDF. */
export async function GET(_request: Request, ctx: RouteContext<"/api/offres/[id]/lettre">) {
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Non autorisé", { status: 401 });
  }
  const { id } = await ctx.params;
  const [profile, offer] = await Promise.all([getProfile(), getOffer(decodeURIComponent(id))]);
  if (!offer?.cover_letter?.trim()) return new Response("Pas encore de lettre pour cette offre.", { status: 404 });
  const pdf = await renderLetterPdf({
    profile,
    offer,
    title: offer.cover_letter_title ?? "",
    body: offer.cover_letter,
  });
  return pdfResponse(pdf, attachmentName("Lettre de motivation", profile.full_name, offer.company));
}
