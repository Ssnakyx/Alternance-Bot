"use client";

import { useActionState } from "react";
import { saveProfileAction, uploadCvAction, type ActionResult } from "@/app/actions";
import type { Profile } from "@/lib/types";

function Feedback({ state }: { state: ActionResult }) {
  if (!state.ok) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p className="text-sm text-emerald-700">{state.message}</p>;
  return null;
}

export function CvForm({ currentFile }: { currentFile: string | null }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(uploadCvAction, { ok: true });
  return (
    <form action={action} className="space-y-2">
      {currentFile && <p className="text-sm text-slate-500">CV actuel : {currentFile}</p>}
      <input type="file" name="cv" accept="application/pdf" required className="block w-full text-sm" />
      <button
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Analyse du CV par l'IA..." : currentFile ? "Remplacer et analyser" : "Envoyer et analyser"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function Field(props: { label: string; name: string; defaultValue?: string | number; placeholder?: string; type?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-slate-600">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2"
      />
    </label>
  );
}

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveProfileAction, { ok: true });
  const s = profile.search;
  return (
    <form action={action} className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Mes coordonnées</legend>
        <Field label="Nom complet" name="full_name" defaultValue={profile.full_name} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Email (pour les réponses)" name="email" type="email" defaultValue={profile.email} />
          <Field label="Téléphone" name="phone" defaultValue={profile.phone} />
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">Signature des emails</span>
          <textarea
            name="signature"
            rows={3}
            defaultValue={profile.signature}
            placeholder={"Prénom Nom\n06 00 00 00 00\nportfolio / GitHub"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Ma recherche</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mots-clés du poste" name="keywords" defaultValue={s.keywords} />
          <Field label="Codes ROME" name="romes" defaultValue={s.romes.join(", ")} placeholder="M1805" />
          <Field label="Ville" name="city" defaultValue={s.city} />
          <Field label="Rayon (km)" name="radius_km" type="number" defaultValue={s.radius_km} />
          <Field label="Latitude" name="latitude" defaultValue={s.latitude} />
          <Field label="Longitude" name="longitude" defaultValue={s.longitude} />
          <Field label="Département" name="departement" defaultValue={s.departement} />
          <Field label="École / formation" name="school" defaultValue={s.school} />
          <Field label="Rythme" name="rhythm" defaultValue={s.rhythm} placeholder="3 semaines entreprise / 1 semaine école" />
          <Field label="Date de début" name="start_date" defaultValue={s.start_date} placeholder="septembre 2027" />
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">Ce que tu sais faire en plus de ton CV</span>
          <textarea
            name="extra_skills"
            rows={2}
            defaultValue={s.extra_skills}
            placeholder="Très à l'aise avec Claude et Claude Code, intégration d'API d'IA..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
          <span className="block text-xs text-slate-500">
            L&apos;IA s&apos;en sert comme de ton CV pour noter les offres, écrire tes lettres et adapter ton CV.
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="include_remote" defaultChecked={s.include_remote} />
          Inclure les alternances en télétravail partout en France
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ai_focus" defaultChecked={s.ai_focus} className="mt-1" />
          <span>
            Priorité aux postes où l&apos;on travaille avec l&apos;IA
            <span className="block text-xs text-slate-500">
              Intégration de LLM, agents, automatisation, IA générative : recherchés en plus, notés plus haut et
              marqués « IA ».
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="web_search" defaultChecked={s.web_search} className="mt-1" />
          <span>
            Chercher aussi sur LinkedIn, Indeed, Welcome to the Jungle, HelloWork...
            <span className="block text-xs text-slate-500">
              L&apos;IA fait trois recherches web à chaque actualisation (environ 0,30 à 0,50 $ à chaque fois).
            </span>
          </span>
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium">Automatisations</legend>
        <p className="text-xs text-slate-500">
          Chaque matin, l&apos;IA prépare le dossier des meilleures offres (lettre de motivation, email, message court et
          CV adapté). Ils t&apos;attendent dans « Lettres prêtes » : rien n&apos;est envoyé sans ta validation.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Lettres préparées / jour" name="auto_letters" type="number" defaultValue={s.auto_letters} />
          <Field label="Score minimum" name="auto_letter_min_score" type="number" defaultValue={s.auto_letter_min_score} />
          <Field label="Relance après (jours)" name="follow_up_days" type="number" defaultValue={s.follow_up_days} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="auto_tailor_cv" defaultChecked={s.auto_tailor_cv} />
          Adapter aussi mon CV à chacune de ces offres
        </label>
      </fieldset>

      <button
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
