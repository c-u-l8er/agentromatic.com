/**
 * Local ID helpers for client-side draft objects and mock data.
 *
 * Goals:
 * - Provide stable-enough IDs for UI lists, optimistic updates, and draft nodes/edges
 * - Avoid collisions in normal local usage
 * - Work in browser + SSR environments (no Node-only APIs required)
 *
 * Non-goals:
 * - Cryptographic guarantees (use server-generated IDs for persisted entities)
 * - UUID v4 strict compliance (we generate UUID-like strings when crypto is available)
 */

export type IdPrefix =
  | "wf"
  | "exec"
  | "log"
  | "node"
  | "edge"
  | "team"
  | "user"
  | "cred"
  | "tmp";

type IdOptions = {
  /**
   * Optional explicit prefix to make IDs more readable.
   * Example: "wf" -> "wf_01H..."
   */
  prefix?: IdPrefix;
  /**
   * Optional extra entropy source (e.g., an index number) when generating many IDs
   * in the same tick for deterministic tests.
   */
  salt?: string | number;
};

/**
 * Generate a reasonably unique, URL-safe ID string.
 *
 * Format:
 *   <prefix?>_<timeBase36>_<randBase36>
 *
 * Example:
 *   wf_mf9e1m5p_8p3kqv2x9a
 */
export function createLocalId(options: IdOptions = {}): string {
  const ts = Date.now().toString(36);

  // Include a monotonic-ish counter for same-tick generation.
  const counter = nextCounter().toString(36);

  const rand = randomBase36(12);

  const salt =
    options.salt === undefined || options.salt === null
      ? ""
      : `_${String(options.salt).replaceAll(/[^a-zA-Z0-9_-]/g, "")}`;

  const prefix = options.prefix ? `${options.prefix}_` : "";

  return `${prefix}${ts}_${counter}_${rand}${salt}`;
}

/**
 * Generate a UUID v4-like string if Web Crypto is available; otherwise falls back
 * to a UUID-ish random string.
 *
 * This is useful for draft node IDs where "uuid-looking" strings are convenient.
 *
 * Example:
 *   "0f1e2d3c-4b5a-6978-8f9e-0d1c2b3a4f5e"
 */
export function createUuidLike(): string {
  // Prefer Web Crypto (browser + many SSR runtimes).
  const cryptoObj = getCrypto();
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }

  // Otherwise, generate 16 bytes and format as UUID v4-ish.
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    // Very last resort fallback (not cryptographically strong).
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/**
 * Convenience helpers for common entity IDs used in UI draft/mock data.
 */
export const ids = {
  workflow(): string {
    return createLocalId({ prefix: "wf" });
  },
  execution(): string {
    return createLocalId({ prefix: "exec" });
  },
  executionLog(): string {
    return createLocalId({ prefix: "log" });
  },
  node(): string {
    // Prefer UUID-like IDs for nodes to reduce collision risk in large graphs.
    return `node_${createUuidLike()}`;
  },
  edge(): string {
    return createLocalId({ prefix: "edge" });
  },
  team(): string {
    return createLocalId({ prefix: "team" });
  },
  user(): string {
    return createLocalId({ prefix: "user" });
  },
  credential(): string {
    return createLocalId({ prefix: "cred" });
  },
  tmp(): string {
    return createLocalId({ prefix: "tmp" });
  },
} as const;

/**
 * INTERNALS
 */

let _counter = 0;
function nextCounter(): number {
  // Keep the counter bounded to avoid unbounded growth in long-lived sessions.
  _counter = (_counter + 1) % 0x7fffffff;
  return _counter;
}

function randomBase36(length: number): string {
  const cryptoObj = getCrypto();

  // Prefer crypto-grade randomness when available.
  if (cryptoObj?.getRandomValues) {
    // Each byte yields up to 2 base36 chars after conversion; overshoot and slice.
    const bytes = new Uint8Array(Math.ceil((length * 5) / 2));
    cryptoObj.getRandomValues(bytes);

    let out = "";
    for (const b of bytes) out += b.toString(36).padStart(2, "0");
    return out.slice(0, length);
  }

  // Fallback: Math.random (not cryptographically strong).
  let out = "";
  while (out.length < length) {
    out += Math.random().toString(36).slice(2);
  }
  return out.slice(0, length);
}

function getCrypto():
  | (Crypto & { randomUUID?: () => string })
  | undefined
  | null {
  // `globalThis.crypto` is standard in modern browsers and some SSR runtimes.
  // Avoid referencing `window` directly for SSR compatibility.
  const anyGlobal = globalThis as unknown as { crypto?: Crypto };
  return anyGlobal.crypto ?? null;
}
