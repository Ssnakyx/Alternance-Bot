"use client";

import { useActionState } from "react";
import { login, type ActionResult } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(login, { ok: true });

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Alternance Bot</h1>
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Mot de passe"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {!state.ok && <p className="text-sm text-red-600">{state.error}</p>}
        <button
          disabled={pending}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {pending ? "Connexion..." : "Se connecter"}
        </button>
      </form>
    </main>
  );
}
