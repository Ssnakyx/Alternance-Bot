"use client";

import { useState, type ReactNode } from "react";
import type { TailoredCv } from "@/lib/types";

const input = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const commas = (text: string) =>
  text
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

function parseSkills(text: string): TailoredCv["skills"] {
  return lines(text).map((line) => {
    const [category, ...rest] = line.split(":");
    return rest.length ? { category: category.trim(), items: commas(rest.join(":")) } : { category: "", items: commas(category) };
  });
}

/**
 * Champ texte qui garde ce que tu tapes tel quel (virgules, lignes vides en cours de saisie)
 * et renvoie la valeur structurée au parent à chaque frappe.
 */
function TextList<T>(props: {
  label: string;
  value: T;
  format: (v: T) => string;
  parse: (text: string) => T;
  onChange: (v: T) => void;
  rows?: number;
  hint?: string;
}) {
  const [text, setText] = useState(() => props.format(props.value));
  const update = (t: string) => {
    setText(t);
    props.onChange(props.parse(t));
  };
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-slate-600">
        {props.label}
        {props.hint && <span className="text-xs text-slate-400"> · {props.hint}</span>}
      </span>
      {props.rows ? (
        <textarea value={text} onChange={(e) => update(e.target.value)} rows={props.rows} className={input} />
      ) : (
        <input value={text} onChange={(e) => update(e.target.value)} className={input} />
      )}
    </label>
  );
}

function Text(props: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-slate-600">{props.label}</span>
      {props.rows ? (
        <textarea value={props.value} onChange={(e) => props.onChange(e.target.value)} rows={props.rows} className={input} />
      ) : (
        <input value={props.value} onChange={(e) => props.onChange(e.target.value)} className={input} />
      )}
    </label>
  );
}

/** Une liste d'éléments (expériences, projets, formations) avec ajout et suppression. */
function Items<T>(props: {
  title: string;
  items: T[];
  empty: T;
  onChange: (items: T[]) => void;
  render: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
}) {
  const set = (i: number, patch: Partial<T>) =>
    props.onChange(props.items.map((item, j) => (j === i ? { ...item, ...patch } : item)));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{props.title}</legend>
      {props.items.map((item, i) => (
        // La clé change quand on ajoute ou retire un élément : les champs repartent des bonnes valeurs.
        <div key={`${props.items.length}-${i}`} className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
          {props.render(item, (patch) => set(i, patch))}
          <button
            type="button"
            onClick={() => props.onChange(props.items.filter((_, j) => j !== i))}
            className="text-xs text-red-600 hover:underline"
          >
            Retirer
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => props.onChange([...props.items, props.empty])}
        className="text-sm text-indigo-700 hover:underline"
      >
        + Ajouter
      </button>
    </fieldset>
  );
}

/** Modification à la main du CV adapté, champ par champ. */
export function CvEditor({ cv, onChange }: { cv: TailoredCv; onChange: (cv: TailoredCv) => void }) {
  const set = (patch: Partial<TailoredCv>) => onChange({ ...cv, ...patch });
  return (
    <div className="space-y-4">
      <Text label="Titre" value={cv.headline} onChange={(headline) => set({ headline })} />
      <Text label="Profil" value={cv.summary} onChange={(summary) => set({ summary })} rows={3} />
      <TextList
        label="Ville et liens"
        hint="séparés par des virgules (l'email et le téléphone viennent du profil)"
        value={cv.contact}
        format={(v) => v.join(", ")}
        parse={commas}
        onChange={(contact) => set({ contact })}
      />
      <TextList
        label="Compétences"
        hint="une catégorie par ligne : « Front : React, Next.js »"
        value={cv.skills}
        format={(v) => v.map((g) => (g.category ? `${g.category} : ${g.items.join(", ")}` : g.items.join(", "))).join("\n")}
        parse={parseSkills}
        onChange={(skills) => set({ skills })}
        rows={4}
      />

      <Items
        title="Expériences"
        items={cv.experiences}
        empty={{ title: "", company: "", location: "", period: "", bullets: [] }}
        onChange={(experiences) => set({ experiences })}
        render={(e, update) => (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <Text label="Poste" value={e.title} onChange={(title) => update({ title })} />
              <Text label="Entreprise" value={e.company} onChange={(company) => update({ company })} />
              <Text label="Lieu" value={e.location} onChange={(location) => update({ location })} />
              <Text label="Dates" value={e.period} onChange={(period) => update({ period })} />
            </div>
            <TextList label="Puces" hint="une par ligne" value={e.bullets} format={(v) => v.join("\n")} parse={lines} onChange={(bullets) => update({ bullets })} rows={3} />
          </>
        )}
      />

      <Items
        title="Projets"
        items={cv.projects}
        empty={{ name: "", stack: "", link: "", bullets: [] }}
        onChange={(projects) => set({ projects })}
        render={(p, update) => (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              <Text label="Nom" value={p.name} onChange={(name) => update({ name })} />
              <Text label="Technologies" value={p.stack} onChange={(stack) => update({ stack })} />
              <Text label="Lien" value={p.link} onChange={(link) => update({ link })} />
            </div>
            <TextList label="Puces" hint="une par ligne" value={p.bullets} format={(v) => v.join("\n")} parse={lines} onChange={(bullets) => update({ bullets })} rows={3} />
          </>
        )}
      />

      <Items
        title="Formation"
        items={cv.education}
        empty={{ degree: "", school: "", period: "", details: "" }}
        onChange={(education) => set({ education })}
        render={(e, update) => (
          <div className="grid gap-2 sm:grid-cols-2">
            <Text label="Diplôme" value={e.degree} onChange={(degree) => update({ degree })} />
            <Text label="École" value={e.school} onChange={(school) => update({ school })} />
            <Text label="Dates" value={e.period} onChange={(period) => update({ period })} />
            <Text label="Détails" value={e.details} onChange={(details) => update({ details })} />
          </div>
        )}
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <TextList label="Langues" hint="séparées par des virgules" value={cv.languages} format={(v) => v.join(", ")} parse={commas} onChange={(languages) => set({ languages })} />
        <TextList label="Centres d'intérêt" hint="séparés par des virgules" value={cv.interests} format={(v) => v.join(", ")} parse={commas} onChange={(interests) => set({ interests })} />
      </div>
    </div>
  );
}
