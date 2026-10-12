import "server-only";
import { addEvent, updateOffer } from "./db";
import { ANSWERED_STATUSES, STATUS_LABELS, type OfferRow, type OfferStatus } from "./types";

/**
 * Change le statut d'une candidature, met à jour les dates utiles aux
 * statistiques (envoi, relance, réponse) et l'inscrit dans l'historique.
 */
export async function changeStatus(
  offer: Pick<OfferRow, "id" | "status" | "sent_at" | "responded_at">,
  status: OfferStatus,
  opts: { summary?: string; patch?: Partial<OfferRow>; emailMessageId?: string } = {},
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Partial<OfferRow> = { ...opts.patch, status };
  if (status === "sent" && !offer.sent_at) patch.sent_at = now;
  if (status === "followed_up") patch.followed_up_at = now;
  if (ANSWERED_STATUSES.includes(status) && !offer.responded_at) patch.responded_at = now;

  await updateOffer(offer.id, patch);
  if (status !== offer.status || opts.summary) {
    await addEvent({
      offer_id: offer.id,
      type: opts.emailMessageId ? "email_received" : "status",
      status,
      summary: opts.summary ?? `Statut : ${STATUS_LABELS[status]}`,
      ...(opts.emailMessageId ? { email_message_id: opts.emailMessageId } : {}),
    });
  }
}

/** Ordre d'avancement, pour ne jamais faire reculer une candidature automatiquement. */
const PROGRESS: Record<OfferStatus, number> = {
  new: 0,
  draft: 1,
  ignored: 1,
  sent: 2,
  followed_up: 3,
  interview: 4,
  rejected: 5,
  accepted: 6,
};

export function isProgress(from: OfferStatus, to: OfferStatus): boolean {
  return PROGRESS[to] > PROGRESS[from];
}
