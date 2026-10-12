import { prepareTopDossiers } from "@/lib/pipeline";

// Lettres, CV adaptés et recherche d'adresses pour plusieurs offres en parallèle.
export const maxDuration = 300;

/** Appelée chaque matin par Vercel Cron, après /api/cron (voir vercel.json). */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return Response.json(await prepareTopDossiers());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
