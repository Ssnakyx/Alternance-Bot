import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { CvSummary, OfferRow, Profile, TailoredCv } from "./types";

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

// ---------- Dossier de candidature ----------

function offerBrief(offer: OfferRow): string {
  return (
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
    )
  );
}

const ApplicationSchema = z.object({
  email_subject: z.string(),
  email_body: z.string(),
  letter_title: z.string(),
  letter_body: z.string(),
  short_message: z.string(),
});

export type ApplicationDraft = z.infer<typeof ApplicationSchema>;

/** Rédige tout le texte d'une candidature : email, lettre de motivation et message court. */
export async function writeApplication(profile: Profile, offer: OfferRow): Promise<ApplicationDraft> {
  const signature = profile.signature || profile.full_name;
  return structured({
    tier: "writing",
    schema: ApplicationSchema,
    effort: "medium",
    system:
      "Tu rédiges des candidatures d'alternance en français. Style : direct, sincère, sans formules " +
      "creuses ni superlatifs. Tu n'inventes aucune expérience, compétence ou information absente du " +
      "profil. Pas de champ à compléter entre crochets : si une information manque, n'en parle pas.",
    content:
      `Profil du candidat :\n${candidateBrief(profile)}\n\n` +
      `Nom : ${profile.full_name}\nEmail : ${profile.email}\nTéléphone : ${profile.phone}\n` +
      `Signature des emails : ${signature}\n\n${offerBrief(offer)}\n\n` +
      "Rédige le dossier de candidature :\n" +
      "- `letter_title` : la ligne d'objet de la lettre, sans le mot « Objet » (par exemple « Candidature " +
      "en alternance au poste de développeur fullstack »).\n" +
      "- `letter_body` : la lettre de motivation, 250 à 350 mots, de « Madame, Monsieur, » jusqu'à la " +
      "formule de politesse incluse, sans signature (le nom est ajouté ensuite). Trois ou quatre " +
      "paragraphes séparés par une ligne vide : ce qui attire le candidat chez cette entreprise et dans " +
      "ce poste, ce qu'il apporte en reliant 2 ou 3 éléments précis du profil aux besoins de l'offre, " +
      "les modalités de l'alternance (rythme, date de début, école s'ils sont connus), puis la demande " +
      "d'entretien.\n" +
      "- `email_subject` : objet court de l'email qui cite le poste et l'alternance.\n" +
      "- `email_body` : l'email d'accompagnement, 80 à 140 mots, de « Bonjour » à la signature. Il " +
      "présente la candidature en deux ou trois phrases avec un élément précis du profil, et indique que " +
      "le CV et la lettre de motivation sont en pièces jointes.\n" +
      "- `short_message` : 400 à 600 caractères, sans formule d'appel ni signature, à coller dans le " +
      "champ « message » d'un formulaire de candidature ou dans un message LinkedIn.",
  });
}

const TailoredCvSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  contact: z.array(z.string()),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  experiences: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string(),
      period: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({ name: z.string(), stack: z.string(), link: z.string(), bullets: z.array(z.string()) }),
  ),
  education: z.array(z.object({ degree: z.string(), school: z.string(), period: z.string(), details: z.string() })),
  languages: z.array(z.string()),
  interests: z.array(z.string()),
  changes: z.array(z.string()),
  not_added: z.array(z.string()),
});

/** Valide un CV adapté venu du navigateur avant de l'enregistrer. */
export function parseTailoredCv(value: unknown): TailoredCv {
  return TailoredCvSchema.parse(value);
}

/**
 * Adapte le CV d'origine (PDF) à une offre. L'IA peut reformuler, réordonner et mettre en avant,
 * jamais inventer : ce que l'offre demande et que le CV n'a pas part dans `not_added`.
 * `instructions` et `previous` servent à retoucher une version déjà générée.
 */
export async function tailorCv(
  profile: Profile,
  offer: OfferRow,
  cvPdfBase64: string,
  options: { instructions?: string; previous?: TailoredCv | null } = {},
): Promise<TailoredCv> {
  const s = profile.search;
  const retouch =
    options.instructions?.trim() && options.previous
      ? `\n\nVersion actuelle du CV adapté :\n${JSON.stringify(options.previous, null, 2)}\n\n` +
        `Le candidat demande ces retouches : ${options.instructions.trim()}\n` +
        "Pars de la version actuelle et applique ces retouches, toujours sans rien inventer."
      : options.instructions?.trim()
        ? `\n\nConsignes du candidat : ${options.instructions.trim()}`
        : "";
  return structured({
    tier: "writing",
    schema: TailoredCvSchema,
    effort: "medium",
    system:
      "Tu adaptes le CV d'un étudiant qui cherche une alternance à une offre précise. Règle absolue : " +
      "tu n'inventes rien, ni expérience, ni compétence, ni outil, ni diplôme, ni chiffre, ni date. Tu " +
      "peux reformuler, réordonner, regrouper, mettre en avant ce qui correspond à l'offre, reprendre le " +
      "vocabulaire de l'offre quand il désigne une chose réellement présente dans le CV, et raccourcir " +
      "ou retirer ce qui n'aide pas pour ce poste. Tout ce que l'offre demande et que le CV ne montre " +
      "pas va dans `not_added`, jamais dans le CV. Le CV doit tenir sur une page. Français.",
    content: [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: cvPdfBase64 },
        // Le même CV sert pour chaque offre : on le met en cache pour réduire le coût.
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text:
          `Voici le CV d'origine du candidat (document ci-dessus).\n\n${offerBrief(offer)}\n\n` +
          `Recherche : alternance ${s.keywords}, rythme ${s.rhythm || "non précisé"}, début ` +
          `${s.start_date || "non précisé"}, école ${s.school || "non précisée"}.\n\n` +
          "Rédige le CV adapté :\n" +
          "- `headline` : le titre visé, par exemple « Développeur fullstack en alternance », suivi du " +
          "rythme s'il est connu.\n" +
          "- `summary` : 2 ou 3 phrases de profil orientées vers ce poste.\n" +
          "- `contact` : la ville et les liens présents dans le CV (LinkedIn, GitHub, portfolio), sans " +
          "l'email ni le téléphone.\n" +
          "- `skills` : 3 à 5 catégories, les plus utiles pour l'offre en premier, uniquement des " +
          "compétences présentes dans le CV.\n" +
          "- `experiences` et `projects` : les plus pertinents en premier, 2 à 4 puces chacun qui " +
          "commencent par un verbe d'action ; `stack` liste les technologies du projet.\n" +
          "- `education`, `languages`, `interests` : repris du CV, abrégés si besoin.\n" +
          "- `changes` : 3 à 6 phrases courtes qui expliquent au candidat ce qui a été adapté.\n" +
          "- `not_added` : les compétences ou exigences de l'offre absentes du CV.\n" +
          "Laisse une chaîne ou une liste vide quand une information n'existe pas dans le CV." +
          retouch,
      },
    ],
  });
}

export function toCvSummary(cv: ParsedCv): CvSummary {
  const { headline, summary, skills, experiences, education, projects, languages } = cv;
  return { headline, summary, skills, experiences, education, projects, languages };
}

// ---------- Relance ----------

const LetterSchema = z.object({ subject: z.string(), body: z.string() });

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
