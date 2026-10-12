import "server-only";
import nodemailer from "nodemailer";
import { requireEnv } from "./env";

/**
 * Envoi depuis ton propre Gmail (mot de passe d'application), pour que les
 * recruteurs reçoivent un email normal à ton nom et puissent te répondre directement.
 */
export async function sendApplicationEmail(opts: {
  fromName: string;
  replyTo: string;
  to: string;
  subject: string;
  body: string;
  attachment: { filename: string; base64: string } | null;
}): Promise<void> {
  const user = requireEnv("GMAIL_USER");
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: requireEnv("GMAIL_APP_PASSWORD") },
  });
  await transport.sendMail({
    from: opts.fromName ? `"${opts.fromName.replace(/"/g, "")}" <${user}>` : user,
    to: opts.to,
    replyTo: opts.replyTo || undefined,
    subject: opts.subject,
    text: opts.body,
    attachments: opts.attachment
      ? [
          {
            filename: opts.attachment.filename,
            content: Buffer.from(opts.attachment.base64, "base64"),
            contentType: "application/pdf",
          },
        ]
      : [],
  });
}
