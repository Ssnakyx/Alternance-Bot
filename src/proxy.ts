import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "./lib/auth";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // Tout est protégé sauf la page de connexion, la tâche planifiée (protégée par CRON_SECRET) et les fichiers statiques.
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
