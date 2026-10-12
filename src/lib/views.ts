import "server-only";
import { connection } from "next/server";
import { getOffer, getProfile, listEvents, listOffers, listOffersForStats, recentEvents } from "./db";
import { computeStats } from "./stats";
import type { OfferRow, OfferStatus } from "./types";

const DAY = 86_400_000;

/** Vrai si la candidature attend une réponse depuis plus de `days` jours. */
export function isFollowUpDue(offer: OfferRow, days: number, now = Date.now()): boolean {
  const waitingSince = offer.followed_up_at ?? offer.sent_at;
  return offer.status === "sent" && !!waitingSince && now - new Date(waitingSince).getTime() > days * DAY;
}

export async function loadDashboard() {
  await connection(); // données toujours fraîches, jamais figées au build
  const [offers, profile, events] = await Promise.all([listOffersForStats(), getProfile(), recentEvents(12)]);
  const now = Date.now();
  return { profile, events, now, stats: computeStats(offers, now, profile.search.follow_up_days) };
}

export async function loadBoard(statuses: OfferStatus[]) {
  await connection();
  const [offers, profile] = await Promise.all([listOffers(statuses), getProfile()]);
  const now = Date.now();
  return offers.map((offer) => ({ offer, followUpDue: isFollowUpDue(offer, profile.search.follow_up_days, now) }));
}

export async function loadOfferDetail(id: string) {
  await connection();
  const [offer, events, profile] = await Promise.all([getOffer(id), listEvents(id), getProfile()]);
  if (!offer) return null;
  return {
    offer,
    events,
    followUpDue: isFollowUpDue(offer, profile.search.follow_up_days),
    identity: { full_name: profile.full_name, email: profile.email, phone: profile.phone },
    hasOriginalCv: Boolean(profile.cv_filename),
  };
}
