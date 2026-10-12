import type { ReactNode } from "react";
import type { TailoredCv } from "@/lib/types";

interface Props {
  cv: TailoredCv;
  identity: { full_name: string; email: string; phone: string };
}

/** Aperçu du CV adapté, avec la même mise en page que le PDF. */
export function CvPreview({ cv, identity }: Props) {
  const contact = [identity.email, identity.phone, ...cv.contact].filter(Boolean);
  return (
    <div className="space-y-4 rounded-lg bg-white p-3 text-sm leading-relaxed sm:p-5 text-slate-900 shadow-sm ring-1 ring-slate-200">
      <header>
        <p className="text-xl font-semibold">{identity.full_name || "Ton nom (à remplir dans le profil)"}</p>
        {cv.headline && <p className="text-indigo-700">{cv.headline}</p>}
        {contact.length > 0 && <p className="text-xs text-slate-500">{contact.join("  ·  ")}</p>}
      </header>

      {cv.summary && (
        <Block title="Profil">
          <p>{cv.summary}</p>
        </Block>
      )}

      {cv.skills.length > 0 && (
        <Block title="Compétences">
          {cv.skills.map((g, i) => (
            <p key={i}>
              <span className="font-medium">{g.category} : </span>
              {g.items.join(", ")}
            </p>
          ))}
        </Block>
      )}

      {cv.experiences.length > 0 && (
        <Block title="Expériences">
          {cv.experiences.map((e, i) => (
            <Entry
              key={i}
              title={e.title}
              detail={[e.company, e.location].filter(Boolean).join(", ")}
              aside={e.period}
              bullets={e.bullets}
            />
          ))}
        </Block>
      )}

      {cv.projects.length > 0 && (
        <Block title="Projets">
          {cv.projects.map((p, i) => (
            <Entry key={i} title={p.name} detail={p.stack} aside={p.link} bullets={p.bullets} />
          ))}
        </Block>
      )}

      {cv.education.length > 0 && (
        <Block title="Formation">
          {cv.education.map((e, i) => (
            <Entry key={i} title={e.degree} detail={e.school} aside={e.period} bullets={e.details ? [e.details] : []} plain />
          ))}
        </Block>
      )}

      {(cv.languages.length > 0 || cv.interests.length > 0) && (
        <Block title="Langues et centres d'intérêt">
          {cv.languages.length > 0 && (
            <p>
              <span className="font-medium">Langues : </span>
              {cv.languages.join(", ")}
            </p>
          )}
          {cv.interests.length > 0 && (
            <p>
              <span className="font-medium">Centres d&apos;intérêt : </span>
              {cv.interests.join(", ")}
            </p>
          )}
        </Block>
      )}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 border-b border-indigo-100 pb-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Entry(props: { title: string; detail: string; aside: string; bullets: string[]; plain?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p>
          <span className="font-medium">{props.title}</span>
          {props.detail && <span className="text-slate-500"> · {props.detail}</span>}
        </p>
        {props.aside && <span className="text-xs text-slate-500">{props.aside}</span>}
      </div>
      {props.bullets.length > 0 &&
        (props.plain ? (
          <p className="text-slate-700">{props.bullets.join(" ")}</p>
        ) : (
          <ul className="list-disc pl-5 text-slate-700">
            {props.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        ))}
    </div>
  );
}
