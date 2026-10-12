import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { classifyReply } from "./claude";
import { addEvent, awaitingReplyWithEmail, knownEmailMessageIds } from "./db";
import { optionalEnv } from "./env";
import { changeStatus, isProgress } from "./tracking";
import { STATUS_LABELS, type OfferRow } from "./types";

/** Domaines de messagerie grand public : on cherche alors l'adresse exacte, pas tout le domaine. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.fr",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "protonmail.com",
  "proton.me",
]);

const MAX_MESSAGES_PER_OFFER = 5;

export interface InboxReport {
  checked: number;
  replies: number;
  statusChanges: number;
}

function senderQuery(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || PUBLIC_DOMAINS.has(domain)) return { from: email };
  // Un autre recruteur de la même entreprise peut répondre : on accepte tout le domaine.
  return { or: [{ from: email }, { from: `@${domain}` }] };
}

/**
 * Parcourt ta boîte Gmail à la recherche de réponses des entreprises à qui tu as
 * écrit, les fait lire par l'IA et met à jour le suivi tout seul (entretien,
 * refus, acceptation). Une candidature n'est jamais "reculée" automatiquement.
 */
export async function syncInboxReplies(): Promise<InboxReport> {
  const user = optionalEnv("GMAIL_USER");
  const pass = optionalEnv("GMAIL_APP_PASSWORD");
  const report: InboxReport = { checked: 0, replies: 0, statusChanges: 0 };
  if (!user || !pass) return report;

  const offers = await awaitingReplyWithEmail();
  if (offers.length === 0) return report;

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    for (const offer of offers) {
      report.checked++;
      await processOffer(client, offer, report);
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return report;
}

async function processOffer(client: ImapFlow, offer: OfferRow, report: InboxReport): Promise<void> {
  const uids = await client.search({ ...senderQuery(offer.apply_email!), since: new Date(offer.sent_at!) }, { uid: true });
  if (!uids || uids.length === 0) return;

  const messages = await client.fetchAll(uids.slice(-MAX_MESSAGES_PER_OFFER), { uid: true, source: true }, { uid: true });
  const parsed = await Promise.all(messages.map((m) => (m.source ? simpleParser(m.source) : null)));
  const candidates = parsed
    .filter((p): p is NonNullable<typeof p> => !!p?.messageId)
    .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));

  const known = await knownEmailMessageIds(candidates.map((c) => c.messageId!));
  let current = offer;
  for (const mail of candidates) {
    if (known.has(mail.messageId!)) continue;
    const from = mail.from?.text ?? "";
    const result = await classifyReply(current, {
      from,
      subject: mail.subject ?? "",
      text: mail.text ?? "",
    });
    report.replies++;
    const summary = `Réponse de ${from} : ${result.summary}`;

    if (result.outcome !== "other" && isProgress(current.status, result.outcome)) {
      await changeStatus(current, result.outcome, { summary, emailMessageId: mail.messageId! });
      current = { ...current, status: result.outcome, responded_at: current.responded_at ?? new Date().toISOString() };
      report.statusChanges++;
    } else {
      await addEvent({
        offer_id: current.id,
        type: "email_received",
        status: null,
        summary: result.outcome === "other" ? summary : `${summary} (statut ${STATUS_LABELS[current.status]} conservé)`,
        email_message_id: mail.messageId!,
      });
    }
  }
}
