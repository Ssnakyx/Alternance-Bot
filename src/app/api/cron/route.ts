import { refreshOffers } from "@/lib/pipeline";

// Récupération + notation de dizaines d'offres : on laisse le temps à l'IA.
export const maxDuration = 300;

/** Appelée chaque matin par Vercel Cron (voir vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return Response.json(await refreshOffers());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
