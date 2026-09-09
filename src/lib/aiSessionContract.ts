export const NATIVE_AI_PROMPT_MAX_BYTES = 65_536;
export const NATIVE_AI_SESSION_ID_MAX_BYTES = 128;

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

export function aiPromptByteLength(prompt: string): number {
  return utf8ByteLength(prompt);
}

export function isNativeAiPromptWithinLimit(prompt: string): boolean {
  return aiPromptByteLength(prompt) <= NATIVE_AI_PROMPT_MAX_BYTES;
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of encoder.encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Produit l’identifiant ASCII accepté par le pont natif. Les identifiants déjà
 * conformes restent inchangés ; les autres conservent un préfixe lisible et un
 * condensat stable afin d’éviter les collisions dues à la troncature.
 */
export function nativeAiSessionId(value: string, fallback = "session"): string {
  const source = value.trim() || fallback;
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;

  if (normalized === source && normalized.length <= NATIVE_AI_SESSION_ID_MAX_BYTES) {
    return normalized;
  }

  const digest = fnv1a64(source);
  const prefixLength = NATIVE_AI_SESSION_ID_MAX_BYTES - digest.length - 1;
  const prefix = normalized.slice(0, prefixLength).replace(/-+$/g, "") || fallback;
  return `${prefix}-${digest}`;
}
