"use client";

import { useState, useTransition } from "react";
import { generateFollowUpAction, sendFollowUpAction } from "@/app/actions";

export function FollowUpPanel({ id, email, due }: { id: string; email: string; due: boolean }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      setMessage(null);
      const r = await generateFollowUpAction(id);
      if (r.ok && r.data) {
        setSubject(r.data.subject);
        setBody(r.data.body);
      } else if (!r.ok) setMessage({ ok: false, text: r.error });
    });

  const send = () => {
    if (!window.confirm(`Envoyer cette relance à ${email} ?`)) return;
    startTransition(async () => {
      const r = await sendFollowUpAction(id, subject, body);
      setMessage(r.ok ? { ok: true, text: r.message ?? "Relance envoyée." } : { ok: false, text: r.error });
      if (r.ok) setBody("");
    });
  };

  return (
    <section className={`space-y-3 rounded-xl bg-white p-4 ring-1 ${due ? "ring-amber-300" : "ring-slate-200"}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Relance</h2>
        {due && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Conseillée</span>}
      </div>
      {!body ? (
        <button
          onClick={generate}
          disabled={pending}
          className="w-full rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {pending ? "Rédaction..." : "Préparer une relance avec l'IA"}
        </button>
      ) : (
        <>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed"
          />
          <button
            onClick={send}
            disabled={pending}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {pending ? "Envoi..." : "Valider et envoyer la relance"}
          </button>
        </>
      )}
      {message && <p className={`text-sm ${message.ok ? "text-emerald-700" : "text-red-600"}`}>{message.text}</p>}
    </section>
  );
}
