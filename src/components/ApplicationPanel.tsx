"use client";

import { useState, useTransition } from "react";
import {
  generateLetterAction,
  saveLetterAction,
  sendApplicationAction,
  setStatusAction,
} from "@/app/actions";

interface Props {
  id: string;
  url: string | null;
  initialEmail: string;
  initialSubject: string;
  initialBody: string;
  alreadySent: boolean;
}

export function ApplicationPanel({ id, url, initialEmail, initialSubject, initialBody, alreadySent }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(label: string, action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setMessage(null);
    setBusy(label);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result.ok) {
        if (result.message) setMessage({ ok: true, text: result.message });
      } else {
        setMessage({ ok: false, text: result.error ?? "Erreur inconnue." });
      }
    });
  }

  const generate = () =>
    run("generate", async () => {
      const result = await generateLetterAction(id);
      if (result.ok && result.data) {
        setSubject(result.data.subject);
        setBody(result.data.body);
        return { ok: true, message: "Lettre générée : relis-la et ajuste-la si besoin." };
      }
      return result;
    });

  const send = () => {
    if (!window.confirm(`Envoyer la candidature à ${email} avec ton CV en pièce jointe ?`)) return;
    run("send", () => sendApplicationAction(id, email.trim(), subject, body));
  };

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    setMessage({ ok: true, text: "Lettre copiée dans le presse-papiers." });
  };

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Candidature</h2>
        <button
          onClick={generate}
          disabled={pending}
          className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {busy === "generate" ? "Rédaction..." : body ? "Régénérer avec l'IA" : "Rédiger avec l'IA"}
        </button>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Email du recruteur</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Pas d'email connu : postule via le lien"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Objet</span>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-slate-600">Message</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={14}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run("save", () => saveLetterAction(id, subject, body))}
          disabled={pending}
          className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
        >
          Enregistrer
        </button>
        {body && (
          <button onClick={copy} className="rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 hover:bg-slate-50">
            Copier
          </button>
        )}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        {email.includes("@") ? (
          <button
            onClick={send}
            disabled={pending || !body}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy === "send" ? "Envoi..." : alreadySent ? "Renvoyer par email" : "Valider et envoyer par email"}
          </button>
        ) : (
          url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-lg bg-emerald-600 px-4 py-2 text-center font-medium text-white hover:bg-emerald-700"
            >
              Ouvrir le formulaire de candidature ↗
            </a>
          )
        )}
        {!alreadySent && (
          <button
            onClick={() => run("mark", () => setStatusAction(id, "sent"))}
            disabled={pending}
            className="w-full rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            J&apos;ai postulé par un autre moyen
          </button>
        )}
      </div>

      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
    </section>
  );
}
