import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { CvSummary, OfferRow, Profile } from "./types";

/**
 * Modèle par type de tâche (Opus 5.5 partout par défaut) :
 * - "fast" pour le volume : lecture du CV, notes des offres, lecture des réponses ;
 * - "writing" pour ce que lit le recruteur : lettres et relances.
 * Modifiables sans toucher au code via CLAUDE_MODEL_FAST / CLAUDE_MODEL_WRITING
 * (par exemple claude-haiku-5-5 pour "fast", environ 40 fois moins cher).
 */
const MODELS = {
  fast: process.env.CLAUDE_MODEL_FAST || "claude-opus-5-5",
  writing: process.env.CLAUDE_MODEL_WRITING || "claude-opus-5-5",
};
type Tier = keyof typeof MODELS;

/** Modèles qui acceptent la relance automatique sur un autre modèle en cas de refus. */
const SUPPORTS_FALLBACKS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // Lit ANTHROPIC_API_KEY dans l'environnement.
  client ??= new Anthropic();
  return client;
}

type Effort = "low" | "medium" | "high";

/**
 * Appel structuré : la réponse est validée contre le schéma Zod.
 * Quand le modèle le permet, `fallbacks: "default"` relance automatiquement la
 * requête sur un autre modèle si celui-ci la refuse (rare sur ce type de contenu).
 */
async function structured<S extends z.ZodType>(opts: {
  tier: Tier;
  schema: S;
  system: string;
  content: BetaMessageParam["content"];
  effort: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const model = MODELS[opts.tier];
  const fallback = SUPPORTS_FALLBACKS.has(model)
    ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
    : {};
  const response = await anthropic().beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...fallback,
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
  });
  if (response.stop_reason === "refusal") {
    throw new Error("L'IA a refusé de traiter cette demande.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error("Réponse de l'IA incomplète, réessaie.");
  }
  return response.parsed_output as z.infer<S>;
}

// ---------- Lecture du CV ----------

const CvSchema = z.object({
  full_name: z.string(),
  email: z.string(),
  phone: z.string(),
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.string()),
  experiences: z.array(
    z.object({ title: z.string(), company: z.string(), period: z.string(), description: z.string() }),
  ),
  education: z.array(z.object({ degree: z.string(), school: z.string(), period: z.string() })),
  projects: z.array(z.object({ name: z.string(), description: z.string() })),
  languages: z.array(z.string()),
});

export type ParsedCv = z.infer<typeof CvSchema>;

export async function parseCv(pdfBase64: string): Promise<ParsedCv> {
  return structured({
    tier: "fast",
    schema: CvSchema,
    effort: "low",
    system:
      "Tu extrais fidèlement les informations d'un CV, sans rien inventer. " +
      "Laisse une chaîne vide quand une information est absente. Réponds en français.",
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
      {
        type: "text",
        text:
          "Extrais ce CV. `headline` : le titre du profil en une ligne. `summary` : 2 à 3 phrases " +
          "qui résument le profil. `skills` : toutes les compétences techniques et outils cités.",
      },
    ],
  });
}

// ---------- Score de compatibilité ----------

const ScoresSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      score: z.number().int().min(0).max(100),
      strengths: z.array(z.string()),
      gaps: z.array(z.string()),
    }),
  ),
});

export type OfferScore = z.infer<typeof ScoresSchema>["results"][number];

/** Les descriptions très longues sont coupées pour garder un coût par offre raisonnable. */
const MAX_DESCRIPTION_CHARS = 4000;

function candidateBrief(profile: Profile): string {
  const s = profile.search;
  return JSON.stringify(
    {
      cv: profile.cv_summary,
      recherche: {
        poste: `alternance ${s.keywords}`,
        ville: `${s.city} (rayon ${s.radius_km} km)`,
        teletravail_accepte: s.include_remote,
        rythme: s.rhythm || "non précisé",
        date_de_debut: s.start_date || "non précisée",
        ecole: s.school || "non précisée",
      },
    },
    null,
    2,
  );
}

export async function scoreOffers(profile: Profile, offers: OfferRow[]): Promise<OfferScore[]> {
  const payload = offers.map((o) => ({
    id: o.id,
    type: o.kind === "spontaneous" ? "entreprise qui recrute des alternants (candidature spontanée)" : "offre",
    titre: o.title,
    entreprise: o.company,
    lieu: o.location,
    teletravail: o.remote,
    description: o.description.slice(0, MAX_DESCRIPTION_CHARS),
  }));

  const { results } = await structured({
    tier: "fast",
    schema: ScoresSchema,
    effort: "low",
    system:
      "Tu aides un étudiant à trier des offres d'alternance. Pour chaque offre, donne un score " +
      "de compatibilité de 0 à 100 avec son profil, en tenant compte : des compétences demandées " +
      "par rapport à son CV, du niveau attendu (c'est un alternant, pas un senior), du lieu " +
      "(dans sa zone ou en télétravail) et du type de poste (développement fullstack/web en priorité). " +
      "`strengths` : 1 à 3 points forts courts. `gaps` : 0 à 3 manques courts. Français, phrases de " +
      "quelques mots. Renvoie un résultat par offre, avec exactement le même `id`.",
    content: `Profil du candidat :\n${candidateBrief(profile)}\n\nOffres à évaluer :\n${JSON.stringify(payload, null, 2)}`,
  });
  const known = new Set(offers.map((o) => o.id));
  return results.filter((r) => known.has(r.id));
}

// ---------- Lettre de motivation ----------

const LetterSchema = z.object({ subject: z.string(), body: z.string() });

export async function writeLetter(
  profile: Profile,
  offer: OfferRow,
): Promise<{ subject: string; body: string }> {
  return structured({
    tier: "writing",
    schema: LetterSchema,
    effort: "medium",
    system:
      "Tu rédiges des candidatures d'alternance en français, envoyées par email. Style : direct, " +
      "sincère, sans formules creuses ni superlatifs. Tu n'inventes aucune expérience, compétence ou " +
      "information absente du profil. Pas de champ à compléter entre crochets : si une information " +
      "manque, n'en parle pas.",
    content:
      `Profil du candidat :\n${candidateBrief(profile)}\n\n` +
      `Nom : ${profile.full_name}\nEmail : ${profile.email}\nTéléphone : ${profile.phone}\n` +
      `Signature souhaitée : ${profile.signature || profile.full_name}\n\n` +
      `${offer.kind === "spontaneous" ? "Candidature spontanée auprès de cette entreprise" : "Offre"} :\n` +
      JSON.stringify(
        {
          titre: offer.title,
          entreprise: offer.company,
          lieu: offer.location,
          teletravail: offer.remote,
          description: offer.description,
          points_forts_identifies: offer.strengths,
        },
        null,
        2,
      ) +
      "\n\nÉcris l'email de candidature : `subject` (objet court qui cite le poste et l'alternance) " +
      "et `body` (180 à 280 mots, de « Bonjour » à la signature). Relie 2 ou 3 éléments précis du " +
      "profil aux besoins de l'entreprise, mentionne le rythme, la date de début et l'école s'ils sont " +
      "connus, et indique que le CV est en pièce jointe.",
  });
}

export function toCvSummary(cv: ParsedCv): CvSummary {
  const { headline, summary, skills, experiences, education, projects, languages } = cv;
  return { headline, summary, skills, experiences, education, projects, languages };
}

// ---------- Relance ----------

export async function writeFollowUp(
  profile: Profile,
  offer: OfferRow,
): Promise<{ subject: string; body: string }> {
  return structured({
    tier: "writing",
    schema: LetterSchema,
    effort: "low",
    system:
      "Tu rédiges des emails de relance de candidature d'alternance en français : courts, polis, " +
      "sans insister lourdement. Tu n'inventes rien.",
    content:
      `Candidat : ${profile.full_name}\nSignature : ${profile.signature || profile.full_name}\n\n` +
      `Candidature envoyée le ${offer.sent_at?.slice(0, 10) ?? "?"} pour : ${offer.title} chez ${offer.company}.\n` +
      `Objet de l'email d'origine : ${offer.letter_subject ?? "(inconnu)"}\n\n` +
      "Écris la relance : `subject` (commence par « Re : » suivi de l'objet d'origine s'il est connu) " +
      "et `body` (60 à 110 mots) qui rappelle la candidature, réaffirme l'intérêt pour ce poste en " +
      "une phrase précise et propose un échange.",
  });
}

// ---------- Lecture des réponses reçues ----------

const ReplySchema = z.object({
  outcome: z.enum(["interview", "accepted", "rejected", "other"]),
  summary: z.string(),
});

export type ReplyClassification = z.infer<typeof ReplySchema>;

/** Classe l'email d'un recruteur : entretien, acceptation, refus ou autre. */
export async function classifyReply(
  offer: Pick<OfferRow, "title" | "company">,
  email: { from: string; subject: string; text: string },
): Promise<ReplyClassification> {
  return structured({
    tier: "fast",
    schema: ReplySchema,
    effort: "low",
    system:
      "Tu lis la réponse d'une entreprise à une candidature d'alternance. Classe-la : " +
      "`interview` si elle propose un entretien, un appel ou un test ; `accepted` si elle confirme " +
      "l'embauche ou propose le contrat ; `rejected` si c'est un refus ; `other` sinon (accusé de " +
      "réception automatique, question, publicité...). `summary` : une phrase en français qui résume " +
      "l'email, avec la date et l'heure de l'entretien si elles sont données.",
    content:
      `Candidature : ${offer.title} chez ${offer.company}\n\n` +
      `De : ${email.from}\nObjet : ${email.subject}\n\n${email.text.slice(0, 8000)}`,
  });
}
