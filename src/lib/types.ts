export type OfferSource = "lba" | "francetravail" | "adzuna";

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
  adzuna: "Adzuna",
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
  score: number | null;
  strengths: string[];
  gaps: string[];
  scored_at: string | null;
  status: OfferStatus;
  letter_subject: string | null;
  letter: string | null;
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
  keywords: string;
  romes: string[];
  rhythm: string;
  start_date: string;
  school: string;
  /** Nombre de lettres que l'IA prépare chaque matin pour les meilleures offres (0 = désactivé). */
  auto_letters: number;
  /** Score minimum pour qu'une lettre soit préparée automatiquement. */
  auto_letter_min_score: number;
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
  keywords: "développeur",
  romes: ["M1805"],
  rhythm: "",
  start_date: "",
  school: "",
  auto_letters: 5,
  auto_letter_min_score: 70,
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

export interface Profile {
  full_name: string;
  email: string;
  phone: string;
  signature: string;
  cv_filename: string | null;
  cv_summary: CvSummary | null;
  search: SearchPrefs;
}
