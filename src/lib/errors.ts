import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Le message de l'API Anthropic, sans le code HTTP ni le JSON autour. */
function apiMessage(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? e.message;
}

/**
 * Message lisible pour une erreur, avec quoi faire quand elle vient de l'IA
 * (clé refusée, crédit épuisé, surcharge...) plutôt que la réponse brute de l'API.
 */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "L'IA a mis trop de temps à répondre. Réessaie dans un moment.";
  if (e instanceof Anthropic.APIConnectionError) return "Impossible de joindre l'IA. Réessaie dans un moment.";
  if (e instanceof Anthropic.APIError) {
    const message = apiMessage(e);
    if (e.status === 401) {
      return "Clé Anthropic refusée : vérifie ANTHROPIC_API_KEY dans Vercel (Settings, Environment Variables), puis Redeploy.";
    }
    if (/credit balance/i.test(message)) {
      return "Crédit Anthropic épuisé : recharge-le sur console.anthropic.com, rubrique Billing.";
    }
    if (e.status === 404) return `Modèle d'IA introuvable : vérifie CLAUDE_MODEL_FAST, CLAUDE_MODEL_SEARCH et CLAUDE_MODEL_WRITING (${message}).`;
    if (e.status === 429) return "Trop de demandes à l'IA en même temps (limite du compte Anthropic). Réessaie dans une minute.";
    if (e.status === 529 || e.status === 503) return "L'IA est surchargée en ce moment. Réessaie dans quelques minutes.";
    if (e.status && e.status >= 500) return "Erreur temporaire chez Anthropic. Réessaie dans quelques minutes.";
    return `Erreur de l'IA : ${message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
