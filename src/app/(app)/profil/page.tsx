import { connection } from "next/server";
import { Suspense } from "react";
import { CvForm, ProfileForm } from "@/components/ProfileForms";
import { getProfile } from "@/lib/db";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mon profil</h1>
        <p className="text-sm text-slate-500">
          Ton CV et tes critères servent à trouver les offres, à les noter et à rédiger tes lettres.
        </p>
      </div>
      <Suspense fallback={<p className="text-slate-500">Chargement...</p>}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}

async function ProfileContent() {
  await connection();
  const profile = await getProfile();
  const cv = profile.cv_summary;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="font-medium">Mon CV</h2>
        <CvForm currentFile={profile.cv_filename} />
        {cv && (
          <div className="space-y-3 text-sm">
            <p className="font-medium">{cv.headline}</p>
            <p className="text-slate-600">{cv.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {cv.skills.map((s) => (
                <span key={s} className="rounded bg-slate-100 px-2 py-0.5 text-xs">
                  {s}
                </span>
              ))}
            </div>
            {cv.experiences.length > 0 && (
              <ul className="space-y-1 text-slate-600">
                {cv.experiences.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-slate-800">{e.title}</span>
                    {e.company && ` · ${e.company}`}
                    {e.period && ` (${e.period})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <ProfileForm profile={profile} />
      </section>
    </div>
  );
}
