"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  findEmailAction,
  prepareDossierAction,
  retouchCvAction,
  saveDossierAction,
  sendApplicationAction,
  setStatusAction,
  type DossierResult,
} from "@/app/actions";
import { CvEditor } from "@/components/CvEditor";
import { CvPreview } from "@/components/CvPreview";
import type { DossierPart } from "@/lib/application";
import type { DossierTexts, TailoredCv } from "@/lib/types";

type Tab = "email" | "letter" | "cv" | "message";
type Feedback = { ok: boolean; text: string } | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "letter", label: "Lettre de motivation" },
  { id: "cv", label: "CV adapté" },
  { id: "email", label: "Email" },
  { id: "message", label: "Message court" },
];

interface Props {
  id: string;
  url: string | null;
  initial: DossierResult;
  alreadySent: boolean;
  hasOriginalCv: boolean;
  identity: { full_name: string; email: string; phone: string };
}

const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const secondary = "rounded-lg px-3 py-1.5 text-sm ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60";

function textsOf(d: DossierResult): DossierTexts {
  return {
    letter_subject: d.letter_subject ?? "",
    letter: d.letter ?? "",
    cover_letter_title: d.cover_letter_title ?? "",
    cover_letter: d.cover_letter ?? "",
    short_message: d.short_message ?? "",
  };
}

function hostname(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

export function DossierPanel({ id, url, initial, alreadySent, hasOriginalCv, identity }: Props) {
  const [tab, setTab] = useState<Tab>("letter");
  const [texts, setTexts] = useState<DossierTexts>(() => textsOf(initial));
  const [cv, setCv] = useState<TailoredCv | null>(initial.tailored_cv);
  // Incrémenté quand le CV est remplacé par l'IA : l'éditeur repart alors de la nouvelle version.
  const [cvVersion, setCvVersion] = useState(0);
  const [dirty, setDirty] = useState({ texts: false, cv: false });
  const [editingCv, setEditingCv] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [email, setEmail] = useState(initial.apply_email ?? "");
  // Adresse trouvée par l'IA et page où elle est publiée, pour vérifier avant d'envoyer.
  const [found, setFound] = useState(
    initial.apply_email && initial.apply_email_source ? { email: initial.apply_email, source: initial.apply_email_source } : null,
  );
  const [attach, setAttach] = useState({ tailoredCv: true, coverLetter: true });
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasTexts = Boolean(texts.letter || texts.cover_letter);
  const sendable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function run(label: string, action: () => Promise<Feedback>) {
    setFeedback(null);
    setBusy(label);
    startTransition(async () => {
      const result = await action();
      setBusy(null);
      if (result) setFeedback(result);
    });
  }

  const editText = (key: keyof DossierTexts, value: string) => {
    setTexts((t) => ({ ...t, [key]: value }));
    setDirty((d) => ({ ...d, texts: true }));
  };

  const editCv = (next: TailoredCv) => {
    setCv(next);
    setDirty((d) => ({ ...d, cv: true }));
  };

  const replaceCv = (next: TailoredCv | null) => {
    setCv(next);
    setCvVersion((v) => v + 1);
    setDirty((d) => ({ ...d, cv: false }));
  };

  const prepare = (parts: DossierPart[]) => {
    const overwrites =
      (parts.includes("texts") && dirty.texts) || (parts.includes("cv") && dirty.cv);
    if (overwrites && !window.confirm("Tes modifications non enregistrées seront remplacées. Continuer ?")) return;
    run(parts.length > 1 ? "all" : parts[0], async () => {
      const result = await prepareDossierAction(id, parts);
      if (!result.ok) return { ok: false, text: result.error };
      if (result.data) {
        if (parts.includes("texts")) {
          setTexts(textsOf(result.data));
          setDirty((d) => ({ ...d, texts: false }));
        }
        if (parts.includes("cv") && result.data.tailored_cv) replaceCv(result.data.tailored_cv);
        const { apply_email, apply_email_source } = result.data;
        if (apply_email && !email.trim()) {
          setEmail(apply_email);
          if (apply_email_source) setFound({ email: apply_email, source: apply_email_source });
        }
      }
      return { ok: true, text: result.message ?? "Prêt." };
    });
  };

  const findEmail = () =>
    run("email", async () => {
      const result = await findEmailAction(id);
      if (!result.ok) return { ok: false, text: result.error };
      const contact = result.data;
      if (!contact?.email) {
        return { ok: false, text: `Pas d'adresse publique trouvée${contact?.note ? ` : ${contact.note}` : "."} Postule via le lien.` };
      }
      setEmail(contact.email);
      setFound(contact.source ? { email: contact.email, source: contact.source } : null);
      return { ok: true, text: result.message ?? `Adresse trouvée : ${contact.email}` };
    });

  const retouch = () =>
    run("retouch", async () => {
      if (dirty.cv) {
        const saved = await saveDossierAction(id, texts, cv);
        if (!saved.ok) return { ok: false, text: saved.error };
      }
      const result = await retouchCvAction(id, instructions);
      if (!result.ok) return { ok: false, text: result.error };
      if (result.data) replaceCv(result.data);
      setInstructions("");
      return { ok: true, text: result.message ?? "CV mis à jour." };
    });

  const save = () =>
    run("save", async () => {
      const result = await saveDossierAction(id, texts, dirty.cv ? cv : undefined);
      if (!result.ok) return { ok: false, text: result.error };
      setDirty({ texts: false, cv: false });
      return { ok: true, text: "Enregistré." };
    });

  /** Ouvre le PDF après avoir enregistré les retouches, pour voir exactement ce qui sera envoyé. */
  const openPdf = (kind: "cv" | "lettre") => {
    const target = `/api/offres/${encodeURIComponent(id)}/${kind}`;
    if (!dirty.texts && !dirty.cv) {
      window.open(target, "_blank", "noopener");
      return;
    }
    const win = window.open("", "_blank");
    run("save", async () => {
      const result = await saveDossierAction(id, texts, dirty.cv ? cv : undefined);
      if (!result.ok) {
        win?.close();
        return { ok: false, text: result.error };
      }
      setDirty({ texts: false, cv: false });
      if (win) win.location.href = target;
      return null;
    });
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setFeedback({ ok: true, text: "Copié dans le presse-papiers." });
  };

  const attachments = [
    cv && attach.tailoredCv ? "ton CV adapté" : hasOriginalCv ? "ton CV d'origine" : null,
    texts.cover_letter.trim() && attach.coverLetter ? "ta lettre de motivation" : null,
  ].filter(Boolean);

  const send = () => {
    const joined = attachments.length ? ` avec ${attachments.join(" et ")} en pièce jointe` : " sans pièce jointe";
    if (!window.confirm(`Envoyer la candidature à ${email.trim()}${joined} ?`)) return;
    run("send", async () => {
      const result = await sendApplicationAction(id, email.trim(), texts, dirty.cv ? cv : undefined, attach);
      if (!result.ok) return { ok: false, text: result.error };
      setDirty({ texts: false, cv: false });
      return { ok: true, text: result.message ?? "Envoyée." };
    });
  };

  return (
    <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Dossier de candidature</h2>
          <p className="text-xs text-slate-500">
            Lettre de motivation, CV adapté, email et message court. Rien ne part sans ta validation.
          </p>
        </div>
        <button
          onClick={() => prepare(["texts", "cv", "email"])}
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy === "all" ? "L'IA prépare ton dossier..." : hasTexts || cv ? "Tout régénérer" : "Tout préparer avec l'IA"}
        </button>
      </div>
      {busy === "all" && (
        <p className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-900">
          Rédaction de la lettre, adaptation du CV et recherche de l&apos;adresse où postuler. Ça prend en
          général une à deux minutes.
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === t.id ? "border-indigo-600 font-medium text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.id === "cv" && cv && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" />}
          </button>
        ))}
      </div>

      {tab === "letter" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Objet de la lettre</span>
            <input value={texts.cover_letter_title} onChange={(e) => editText("cover_letter_title", e.target.value)} className={field} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Lettre (ton nom, ton contact, l&apos;entreprise et la date sont ajoutés dans le PDF)</span>
            <textarea
              value={texts.cover_letter}
              onChange={(e) => editText("cover_letter", e.target.value)}
              rows={18}
              placeholder="Clique sur « Tout préparer avec l'IA » ou écris ta lettre ici."
              className={`${field} leading-relaxed`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openPdf("lettre")} disabled={pending || !texts.cover_letter.trim()} className={secondary}>
              Voir le PDF
            </button>
            <button onClick={() => copy(texts.cover_letter)} disabled={!texts.cover_letter} className={secondary}>
              Copier
            </button>
            <button onClick={() => prepare(["texts"])} disabled={pending} className={secondary}>
              {busy === "texts" ? "Rédaction..." : "Régénérer les textes"}
            </button>
          </div>
        </div>
      )}

      {tab === "cv" && (
        <div className="space-y-4">
          {!cv ? (
            <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                L&apos;IA réécrit ton CV pour cette offre : elle met en avant ce qui correspond au poste, reprend le
                vocabulaire de l&apos;offre et retire ce qui n&apos;aide pas. Elle n&apos;invente rien : ce qui manque est
                listé à part.
              </p>
              {hasOriginalCv ? (
                <button
                  onClick={() => prepare(["cv"])}
                  disabled={pending}
                  className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white disabled:opacity-60"
                >
                  {busy === "cv" ? "Adaptation du CV..." : "Adapter mon CV à cette offre"}
                </button>
              ) : (
                <p>
                  Ajoute d&apos;abord ton CV en PDF dans{" "}
                  <Link href="/profil" className="font-medium underline">
                    ton profil
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {cv.changes.length > 0 && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                    <p className="mb-1 font-medium">Ce que l&apos;IA a adapté</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {cv.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {cv.not_added.length > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="mb-1 font-medium">Demandé par l&apos;offre, absent de ton CV (non ajouté)</p>
                    <ul className="list-disc space-y-0.5 pl-5">
                      {cv.not_added.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => setEditingCv((v) => !v)} className={secondary}>
                  {editingCv ? "Voir l'aperçu" : "Modifier à la main"}
                </button>
                <button onClick={() => openPdf("cv")} disabled={pending} className={secondary}>
                  Voir le PDF
                </button>
                <button onClick={() => prepare(["cv"])} disabled={pending} className={secondary}>
                  {busy === "cv" ? "Adaptation..." : "Régénérer le CV"}
                </button>
              </div>

              {editingCv ? (
                <CvEditor key={cvVersion} cv={cv} onChange={editCv} />
              ) : (
                <div className="max-h-[640px] overflow-y-auto rounded-lg bg-slate-100 p-3">
                  <CvPreview cv={cv} identity={identity} />
                </div>
              )}

              <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                <label className="block space-y-1 text-sm">
                  <span className="text-slate-600">Demander une retouche à l&apos;IA</span>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    rows={2}
                    placeholder="Ex. : mets mon projet de fin d'année en premier, retire le job d'été, plus court"
                    className={field}
                  />
                </label>
                <button onClick={retouch} disabled={pending || !instructions.trim()} className={secondary}>
                  {busy === "retouch" ? "Retouche en cours..." : "Appliquer la retouche"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "email" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Objet</span>
            <input value={texts.letter_subject} onChange={(e) => editText("letter_subject", e.target.value)} className={field} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">Message</span>
            <textarea
              value={texts.letter}
              onChange={(e) => editText("letter", e.target.value)}
              rows={10}
              className={`${field} leading-relaxed`}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => copy(texts.letter)} disabled={!texts.letter} className={secondary}>
              Copier
            </button>
            <button onClick={() => prepare(["texts"])} disabled={pending} className={secondary}>
              {busy === "texts" ? "Rédaction..." : "Régénérer les textes"}
            </button>
          </div>
        </div>
      )}

      {tab === "message" && (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="text-slate-600">
              À coller dans le champ « message » d&apos;un formulaire de candidature ou sur LinkedIn
            </span>
            <textarea
              value={texts.short_message}
              onChange={(e) => editText("short_message", e.target.value)}
              rows={6}
              className={`${field} leading-relaxed`}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => copy(texts.short_message)} disabled={!texts.short_message} className={secondary}>
              Copier
            </button>
            <button onClick={() => prepare(["texts"])} disabled={pending} className={secondary}>
              {busy === "texts" ? "Rédaction..." : "Régénérer les textes"}
            </button>
            <span className="text-xs text-slate-400">{texts.short_message.length} caractères</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={pending || (!dirty.texts && !dirty.cv)}
          className="rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === "save" ? "Enregistrement..." : "Enregistrer"}
        </button>
        {(dirty.texts || dirty.cv) && <span className="text-xs text-amber-700">Modifications non enregistrées</span>}
      </div>

      <div className="space-y-3 border-t border-slate-100 pt-4">
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">Email du recruteur</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Pas d'email connu pour l'instant"
            className={field}
          />
        </label>
        {found && found.email === email.trim() && (
          <p className="text-xs text-slate-500">
            Trouvée par l&apos;IA sur{" "}
            <a href={found.source} target="_blank" rel="noopener noreferrer" className="underline">
              {hostname(found.source)}
            </a>
            . Vérifie que c&apos;est la bonne entreprise avant d&apos;envoyer.
          </p>
        )}
        {!sendable && (
          <button
            onClick={findEmail}
            disabled={pending}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy === "email" ? "Recherche sur le web..." : "Trouver l'email de recrutement avec l'IA"}
          </button>
        )}
        {sendable ? (
          <>
            <div className="space-y-1 text-sm">
              {cv ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={attach.tailoredCv}
                    onChange={(e) => setAttach((a) => ({ ...a, tailoredCv: e.target.checked }))}
                  />
                  Joindre le CV adapté (sinon ton CV d&apos;origine)
                </label>
              ) : (
                <p className="text-slate-500">
                  {hasOriginalCv ? "Ton CV d'origine sera joint." : "Aucun CV dans ton profil : rien ne sera joint."}
                </p>
              )}
              {texts.cover_letter.trim() && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={attach.coverLetter}
                    onChange={(e) => setAttach((a) => ({ ...a, coverLetter: e.target.checked }))}
                  />
                  Joindre la lettre de motivation en PDF
                </label>
              )}
            </div>
            <button
              onClick={send}
              disabled={pending || !texts.letter.trim() || !texts.letter_subject.trim()}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {busy === "send" ? "Envoi..." : alreadySent ? "Renvoyer par email" : "Valider et envoyer par email"}
            </button>
            {!texts.letter.trim() && <p className="text-xs text-slate-500">L&apos;onglet Email doit contenir un objet et un message.</p>}
          </>
        ) : (
          url && (
            <>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full rounded-lg px-4 py-2 text-center text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              >
                Ou postuler via le formulaire de l&apos;offre ↗
              </a>
              <p className="text-xs text-slate-500">
                Pour le formulaire : télécharge le CV et la lettre avec « Voir le PDF », et colle le message court.
              </p>
            </>
          )
        )}
        {!alreadySent && (
          <button
            onClick={() =>
              run("mark", async () => {
                const result = await setStatusAction(id, "sent");
                return result.ok ? { ok: true, text: "Candidature marquée comme envoyée." } : { ok: false, text: result.error };
              })
            }
            disabled={pending}
            className="w-full rounded-lg px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            J&apos;ai postulé par un autre moyen
          </button>
        )}
      </div>

      {feedback && <p className={`text-sm ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.text}</p>}
    </section>
  );
}
