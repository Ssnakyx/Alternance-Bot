import { cookies } from "next/headers";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { getOffer, getProfile } from "@/lib/db";
import { attachmentName, pdfResponse, renderCvPdf } from "@/lib/pdf";

/** Le CV adapté à l'offre, en PDF (aperçu ou téléchargement). */
export async function GET(_request: Request, ctx: RouteContext<"/api/offres/[id]/cv">) {
  if (!(await isValidSession((await cookies()).get(SESSION_COOKIE)?.value))) {
    return new Response("Non autorisé", { status: 401 });
  }
  const { id } = await ctx.params;
  const [profile, offer] = await Promise.all([getProfile(), getOffer(decodeURIComponent(id))]);
  if (!offer?.tailored_cv) return new Response("Pas encore de CV adapté pour cette offre.", { status: 404 });
  const pdf = await renderCvPdf(profile, offer.tailored_cv);
  return pdfResponse(pdf, attachmentName("CV", profile.full_name, offer.company));
}

