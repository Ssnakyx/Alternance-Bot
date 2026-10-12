const REMOTE_PATTERN =
  /t[ée]l[ée][- ]?travail|distanciel|full[- ]?remote|100\s?%\s?(?:à distance|remote)|\bremote\b|travail à distance/i;

/** Détecte une mention de télétravail ou de distanciel dans un texte d'offre. */
export function mentionsRemote(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && REMOTE_PATTERN.test(t));
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Extrait la première adresse email trouvée dans un texte (contact, description...). */
export function findEmail(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const match = t?.match(EMAIL_PATTERN);
    if (match) return match[0].toLowerCase();
  }
  return null;
}

/** Retire les balises HTML et compacte les espaces. */
export function stripHtml(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} sur ${new URL(url).host} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}
