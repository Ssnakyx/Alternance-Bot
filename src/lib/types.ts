export type OfferSource = "lba" | "francetravail" | "web";

/** "offer" = offre publiée, "spontaneous" = entreprise qui recrute souvent des alternants sans offre publiée. */
export type OfferKind = "offer" | "spontaneous";

export const OFFER_STATUSES = [
  "new",
  "draft",
  "sent",
  "followed_up",
  "interview",
  "accepted",
  "rejected",
  "ignored",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const STATUS_LABELS: Record<OfferStatus, string> = {
  new: "À traiter",
  draft: "Lettre prête",
  sent: "Envoyée",
  followed_up: "Relancée",
  interview: "Entretien",
  accepted: "Acceptée",
  rejected: "Refusée",
  ignored: "Ignorée",
};

/** Statuts d'une candidature réellement envoyée. */
export const APPLIED_STATUSES: OfferStatus[] = ["sent", "followed_up", "interview", "accepted", "rejected"];
/** Statuts qui signifient que l'entreprise a répondu. */
export const ANSWERED_STATUSES: OfferStatus[] = ["interview", "accepted", "rejected"];

export type EventType = "status" | "letter_generated" | "email_sent" | "followup_sent" | "email_received";

export interface OfferEvent {
  id: number;
  offer_id: string;
  type: EventType;
  status: OfferStatus | null;
  summary: string;
  created_at: string;
}

export const SOURCE_LABELS: Record<OfferSource, string> = {
  lba: "La Bonne Alternance",
  francetravail: "France Travail",
  web: "Recherche web",
};

/** Offre normalisée, quelle que soit la source. */
export interface NormalizedOffer {
  id: string;
  source: OfferSource;
  kind: OfferKind;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string;
  url: string | null;
  apply_email: string | null;
  published_at: string | null;
}

export interface OfferRow extends NormalizedOffer {
  /** Page où l'IA a trouvé l'email de recrutement (vide si l'email vient de l'offre). */
  apply_email_source: string | null;
  /** Date de la dernière recherche d'email par l'IA, trouvée ou non. */
  email_searched_at: string | null;
  score: number | null;
  /** Le poste implique de travailler avec l'IA (repéré par l'IA au moment de la note). */
  ai_work: boolean | null;
  strengths: string[];
  gaps: string[];
  scored_at: string | null;
  status: OfferStatus;
  /** Email d'accompagnement (objet et corps). */
  letter_subject: string | null;
  letter: string | null;
  /** Lettre de motivation au format courrier, jointe en PDF. */
  cover_letter_title: string | null;
  cover_letter: string | null;
  /** Message court pour les formulaires en ligne ou LinkedIn. */
  short_message: string | null;
  tailored_cv: TailoredCv | null;
  sent_at: string | null;
  followed_up_at: string | null;
  responded_at: string | null;
  notes: string;
  created_at: string;
}

export interface SearchPrefs {
  city: string;
  latitude: number;
  longitude: number;
  radius_km: number;
  departement: string;
  include_remote: boolean;
  /** Cherche aussi les offres publiées sur LinkedIn, Indeed, Welcome to the Jungle, HelloWork... via une recherche web. */
  web_search: boolean;
  /** Cherche en plus les postes où l'on travaille avec l'IA et les fait remonter dans le classement. */
  ai_focus: boolean;
  /**
   * Ce que le candidat sait faire et que son CV ne dit pas (par exemple « à l'aise avec Claude et
   * Claude Code »). L'IA le traite comme vrai : notes, lettres et CV adapté peuvent s'en servir.
   */
  extra_skills: string;
  keywords: string;
  romes: string[];
  rhythm: string;
  start_date: string;
  school: string;
  /** Nombre de lettres que l'IA prépare chaque matin pour les meilleures offres (0 = désactivé). */
  auto_letters: number;
  /** Score minimum pour qu'une lettre soit préparée automatiquement. */
  auto_letter_min_score: number;
  /** Adapte aussi le CV pour les offres préparées automatiquement. */
  auto_tailor_cv: boolean;
  /** Nombre de jours sans réponse avant de proposer une relance. */
  follow_up_days: number;
}

export const DEFAULT_SEARCH: SearchPrefs = {
  city: "Lyon",
  latitude: 45.764,
  longitude: 4.8357,
  radius_km: 30,
  departement: "69",
  include_remote: true,
  web_search: true,
  ai_focus: true,
  extra_skills: "",
  keywords: "développeur",
  romes: ["M1805"],
  rhythm: "",
  start_date: "",
  school: "",
  auto_letters: 5,
  auto_letter_min_score: 70,
  auto_tailor_cv: true,
  follow_up_days: 7,
};

export interface CvSummary {
  headline: string;
  summary: string;
  skills: string[];
  experiences: { title: string; company: string; period: string; description: string }[];
  education: { degree: string; school: string; period: string }[];
  projects: { name: string; description: string }[];
  languages: string[];
}

/** CV réécrit par l'IA pour une offre précise, à partir du CV d'origine (rien d'inventé). */
export interface TailoredCv {
  headline: string;
  summary: string;
  /** Ville et liens (LinkedIn, GitHub, portfolio). L'email et le téléphone viennent du profil. */
  contact: string[];
  skills: { category: string; items: string[] }[];
  experiences: { title: string; company: string; location: string; period: string; bullets: string[] }[];
  projects: { name: string; stack: string; link: string; bullets: string[] }[];
  education: { degree: string; school: string; period: string; details: string }[];
  languages: string[];
  interests: string[];
  /** Ce que l'IA a changé par rapport au CV d'origine, pour que tu puisses vérifier. */
  changes: string[];
  /** Demandé par l'offre mais absent de ton CV : volontairement non ajouté. */
  not_added: string[];
}

/** Les textes du dossier, tels qu'on les modifie dans la fiche offre. */
export interface DossierTexts {
  letter_subject: string;
  letter: string;
  cover_letter_title: string;
  cover_letter: string;
  short_message: string;
}

export interface Profile {
  full_name: string;
  email: string;
  phone: string;
  signature: string;
  cv_filename: string | null;
  cv_summary: CvSummary | null;
  search: SearchPrefs;
}
