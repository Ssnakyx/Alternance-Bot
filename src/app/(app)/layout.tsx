import Link from "next/link";
import { logout } from "../actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold text-indigo-600">
            Alternance Bot
          </Link>
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
            Tableau de bord
          </Link>
          <Link href="/offres" className="text-sm text-slate-600 hover:text-slate-900">
            Offres
          </Link>
          <Link href="/suivi" className="text-sm text-slate-600 hover:text-slate-900">
            Suivi
          </Link>
          <Link href="/profil" className="text-sm text-slate-600 hover:text-slate-900">
            Profil
          </Link>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-slate-500 hover:text-slate-900">Déconnexion</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
