/**
 * Agentromatic ↔ WHS integration helpers (delegated invocation, HMAC v1)
 *
 * Purpose:
 * - Build the delegated invocation request body expected by webhost.systems (WHS)
 * - Sign the request over the exact raw JSON bytes (HMAC-SHA256, hex) per spec
 * - Call the WHS control plane `/v1/delegated/invoke/{agentId}` endpoint
 *
 * Normative reference (WHS):
 * - `WebHost.Systems/project_spec/spec_v1/10_API_CONTRACTS.md` §10.3
 *
 * Security notes:
 * - This module MUST NOT log or return the delegation secret.
 * - The signature MUST be computed over the exact bytes sent on the wire.
 * - Idempotency keys MUST be deterministic and secret-free.
 *
 * Environment variables (recommended):
 * - `WHS_CONTROL_PLANE_URL` (e.g. "https://<deployment>.convex.site")
 * - `WHS_DELEGATION_SECRET` (HMAC key; base64url/base64, or "hex:<hex>")
 * - `WHS_DELEGATION_SOURCE` (optional; default: "agentromatic")
 */

export type WhsInvokeV1MessageRole = "system" | "user" | "assistant" | "tool";
export type WhsInvokeV1Message = { role: WhsInvokeV1MessageRole; content: string };

export type WhsInvokeV1Request = {
  // WHS canonical contract uses invoke/v1
  protocol?: "invoke/v1" | string;
  traceId?: string;

  sessionId?: string | null;

  input: {
    prompt?: string;
    messages?: WhsInvokeV1Message[];
  };

  // Optional knobs (WHS may ignore or gate these; included for forward-compat)
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type WhsDelegationCorrelation = {
  workflowId?: string;
  executionId?: string;
  nodeId?: string;
  attempt?: number;
};

export type WhsDelegationEnvelope = {
  mode: "hmac_v1";
  externalUserId: string;
  idempotencyKey: string;
  correlation?: WhsDelegationCorrelation;
};

export type WhsDelegatedInvokeRequestBody = {
  delegation: WhsDelegationEnvelope;
  invoke: WhsInvokeV1Request;
};

export type WhsDelegatedInvokeHeaders = {
  "content-type": "application/json";
  "x-whs-delegation-source": string;
  "x-whs-delegation-timestamp": string; // epoch_ms
  "x-whs-delegation-signature": string; // v1=<hex>
};

export type WhsDelegatedInvokeResult<T = unknown> = {
  ok: true;
  status: number;
  data: T;
  requestId?: string | null;
} | {
  ok: false;
  status: number;
  error: {
    code?: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    requestId?: string;
  };
  rawBodyText?: string;
};

export type InvokeWhsDelegatedOptions = {
  /**
   * WHS control-plane base URL. If omitted, reads from `WHS_CONTROL_PLANE_URL`.
   * Example: "https://<deployment>.convex.site"
   */
  baseUrl?: string;

  /**
   * HMAC secret for delegated requests. If omitted, reads from `WHS_DELEGATION_SECRET`.
   * Encoding accepted:
   * - "hex:<hex>"
   * - base64
   * - base64url (unpadded)
   */
  delegationSecret?: string;

  /**
   * Source label for allowlisting/auditing on the WHS side.
   * If omitted, reads from `WHS_DELEGATION_SOURCE`, default "agentromatic".
   */
  source?: string;

  /**
   * Optional override for timestamp (ms). Defaults to Date.now().
   */
  timestampMs?: number;

  /**
   * Optional fetch override (advanced/testing).
   */
  fetchImpl?: typeof fetch;
};

/**
 * High-level helper: invoke a WHS agent using the delegated invocation endpoint.
 *
 * - Builds the JSON body
 * - Signs raw bytes
 * - Sends POST request
 * - Parses response (best-effort JSON)
 */
export async function invokeWhsDelegated<T = unknown>(args: {
  agentId: string;

  delegation: {
    externalUserId: string;
    idempotencyKey: string;
    correlation?: WhsDelegationCorrelation;
  };

  invoke: WhsInvokeV1Request;

  options?: InvokeWhsDelegatedOptions;
}): Promise<WhsDelegatedInvokeResult<T>> {
  assertNonEmpty(args.agentId, "agentId");

  const options = args.options ?? {};
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? getEnvRequired("WHS_CONTROL_PLANE_URL"));
  const source =
    normalizeHeaderToken(options.source ?? getEnv("WHS_DELEGATION_SOURCE") ?? "agentromatic") ||
    "agentromatic";

  const ts = Number.isFinite(options.timestampMs) ? Math.trunc(options.timestampMs!) : Date.now();
  const timestampHeader = String(ts);

  const secretStr = options.delegationSecret ?? getEnvRequired("WHS_DELEGATION_SECRET");
  const secretBytes = decodeKeyString(secretStr);

  // Enforce idempotency key constraints defensively (client-side).
  const externalUserId = String(args.delegation.externalUserId ?? "").trim();
  assertNonEmpty(externalUserId, "delegation.externalUserId");

  const idempotencyKey = normalizeIdempotencyKey(args.delegation.idempotencyKey);

  // Build body with deterministic property insertion order.
  const bodyObj: WhsDelegatedInvokeRequestBody = {
    delegation: {
      mode: "hmac_v1",
      externalUserId,
      idempotencyKey,
      correlation: args.delegation.correlation ? sanitizeCorrelation(args.delegation.correlation) : undefined,
    },
    invoke: sanitizeInvoke(args.invoke),
  };

  // Serialize once; compute signature over exactly these bytes; send exactly this string.
  const rawBodyText = JSON.stringify(bodyObj);
  const rawBodyBytes = new TextEncoder().encode(rawBodyText);

  const signatureHeader = await computeDelegationSignatureHeaderV1({
    delegationSecret: secretBytes,
    rawBodyBytes,
  });

  const headers: WhsDelegatedInvokeHeaders = {
    "content-type": "application/json",
    "x-whs-delegation-source": source,
    "x-whs-delegation-timestamp": timestampHeader,
    "x-whs-delegation-signature": signatureHeader,
  };

  const url = `${baseUrl}/v1/delegated/invoke/${encodeURIComponent(args.agentId)}`;

  const fetchImpl = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: rawBodyText,
    });
  } catch (err) {
    // Network / DNS / TLS failures
    const message = err instanceof Error ? err.message : "Network error";
    return {
      ok: false,
      status: 0,
      error: {
        code: "NETWORK_ERROR",
        message: "Failed to reach WHS control plane",
        details: { message },
        retryable: true,
      },
    };
  }

  const requestId = res.headers.get("x-request-id") ?? null;

  const bodyText = await safeReadText(res);
  const json = safeJsonParse(bodyText);

  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      data: (json ?? (bodyText as any)) as T,
      requestId,
    };
  }

  // Expect WHS normalized error envelope: { error: { code, message, details?, retryable?, requestId? } }
  const envelopeError = (json && typeof json === "object" && (json as any).error) ? (json as any).error : null;

  const code = envelopeError && typeof envelopeError.code === "string" ? envelopeError.code : undefined;
  const message =
    envelopeError && typeof envelopeError.message === "string"
      ? envelopeError.message
      : `WHS request failed (HTTP ${res.status})`;

  const retryable =
    envelopeError && typeof envelopeError.retryable === "boolean"
      ? envelopeError.retryable
      : res.status >= 500;

  const details = envelopeError ? envelopeError.details : undefined;

  return {
    ok: false,
    status: res.status,
    error: {
      code,
      message,
      details,
      retryable,
      requestId: (envelopeError && typeof envelopeError.requestId === "string") ? envelopeError.requestId : (requestId ?? undefined),
    },
    rawBodyText: bodyText ? truncate(bodyText, 20_000) : undefined,
  };
}

/**
 * Compute the WHS delegated signature header: `v1=<hex(hmac_sha256(raw_body_bytes))>`.
 */
export async function computeDelegationSignatureHeaderV1(args: {
  delegationSecret: Uint8Array;
  rawBodyBytes: Uint8Array;
}): Promise<string> {
  const hex = await hmacSha256Hex(args.delegationSecret, args.rawBodyBytes);
  return `v1=${hex}`;
}

/* -------------------------------------------------------------------------------------------------
 * Internals (env, sanitization, crypto)
 * ------------------------------------------------------------------------------------------------- */

function getEnv(name: string): string | undefined {
  const v = (globalThis as any)?.process?.env?.[name];
  return typeof v === "string" ? v : undefined;
}

function getEnvRequired(name: string): string {
  const v = getEnv(name);
  if (!v || !v.trim()) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function normalizeBaseUrl(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("Invalid WHS baseUrl");
  return s.replace(/\/+$/g, "");
}

function normalizeHeaderToken(raw: string): string {
  // Keep it simple: strip control chars and trim.
  const s = String(raw ?? "").trim().replace(/[\r\n\t]/g, " ");
  // Bound to avoid pathological headers.
  return truncate(s, 128);
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function normalizeIdempotencyKey(key: string): string {
  const s = String(key ?? "").trim();
  assertNonEmpty(s, "delegation.idempotencyKey");

  // v1 guidance: bounded length, deterministic, secret-free.
  // We can't truly validate "secret-free", but we can enforce reasonable bounds.
  if (s.length > 240) {
    // Keep deterministic truncation (avoid hashing here to keep it inspectable across systems).
    return s.slice(0, 240);
  }
  return s;
}

function sanitizeCorrelation(c: WhsDelegationCorrelation): WhsDelegationCorrelation {
  const out: WhsDelegationCorrelation = {};

  if (c.workflowId !== undefined) out.workflowId = truncate(String(c.workflowId), 200);
  if (c.executionId !== undefined) out.executionId = truncate(String(c.executionId), 200);
  if (c.nodeId !== undefined) out.nodeId = truncate(String(c.nodeId), 200);

  if (c.attempt !== undefined) {
    const n = Number(c.attempt);
    out.attempt = Number.isFinite(n) ? Math.max(0, Math.min(1_000_000, Math.trunc(n))) : 0;
  }

  return out;
}

function sanitizeInvoke(req: WhsInvokeV1Request): WhsInvokeV1Request {
  if (!req || typeof req !== "object") {
    throw new Error("Invalid invoke request");
  }

  const protocol = (req.protocol ?? "invoke/v1") as string;

  // Maintain forward-compat: pass through unknown fields in options/metadata,
  // but sanitize obvious structure points.
  const input = (req as any).input ?? {};
  const prompt = typeof input.prompt === "string" ? truncate(input.prompt, 200_000) : undefined;

  const messages = Array.isArray(input.messages)
    ? input.messages
        .filter((m: any) => m && typeof m.role === "string" && typeof m.content === "string")
        .map((m: any) => ({
          role: m.role as WhsInvokeV1MessageRole,
          content: truncate(String(m.content), 200_000),
        }))
    : undefined;

  const sessionIdRaw = (req as any).sessionId;
  const sessionId =
    sessionIdRaw === null
      ? null
      : typeof sessionIdRaw === "string"
        ? truncate(sessionIdRaw, 500)
        : undefined;

  const traceId = typeof (req as any).traceId === "string" ? truncate((req as any).traceId, 200) : undefined;

  const options = isPlainObject((req as any).options) ? (req as any).options : undefined;
  const metadata = isPlainObject((req as any).metadata) ? (req as any).metadata : undefined;

  return {
    protocol,
    traceId,
    sessionId,
    input: {
      prompt,
      messages,
    },
    options,
    metadata,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function safeJsonParse(text: string): unknown | null {
  try {
    return text ? (JSON.parse(text) as unknown) : null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Crypto (WebCrypto HMAC-SHA256 -> hex)
 * ------------------------------------------------------------------------------------------------- */

function requireSubtle(): SubtleCrypto {
  const cryptoObj = (globalThis as any)?.crypto as Crypto | undefined;
  const subtle = cryptoObj?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto is not available (globalThis.crypto.subtle missing)");
  }
  return subtle;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return ab;
}

export async function hmacSha256Hex(key: Uint8Array, data: Uint8Array): Promise<string> {
  const subtle = requireSubtle();

  const cryptoKey = await subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await subtle.sign("HMAC", cryptoKey, toArrayBuffer(data));
  return bytesToHexLower(new Uint8Array(sig));
}

function bytesToHexLower(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i]!.toString(16).padStart(2, "0");
  }
  return s;
}

/* -------------------------------------------------------------------------------------------------
 * Key decoding (hex/base64/base64url)
 * ------------------------------------------------------------------------------------------------- */

function decodeKeyString(value: string): Uint8Array {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error("Invalid delegation secret");

  if (trimmed.startsWith("hex:")) {
    return hexToBytes(trimmed.slice(4).trim());
  }
  if (trimmed.startsWith("base64:")) {
    return base64ToBytes(trimmed.slice(7).trim());
  }
  if (trimmed.startsWith("base64url:")) {
    return base64UrlToBytes(trimmed.slice(10).trim());
  }

  // Heuristic: strict hex => hex; otherwise base64url (also accepts base64).
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return hexToBytes(trimmed);
  }

  return base64UrlToBytes(trimmed);
}

function hexToBytes(hex: string): Uint8Array {
  const s = hex.trim();
  if (!s || s.length % 2 !== 0) throw new Error("Invalid hex secret");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byteHex = s.slice(i * 2, i * 2 + 2);
    const n = Number.parseInt(byteHex, 16);
    if (!Number.isFinite(n)) throw new Error("Invalid hex secret");
    out[i] = n;
  }
  return out;
}

function base64UrlToBytes(b64url: string): Uint8Array {
  // Normalize base64url -> base64 and pad.
  const s = b64url.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s + (padLen === 0 ? "" : "=".repeat(padLen));
  return base64ToBytes(padded);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/\s+/g, "");
  if (!s) return new Uint8Array();

  // Prefer atob when present (it is in many isolate/browser-like runtimes).
  const atobFn = (globalThis as any)?.atob as ((x: string) => string) | undefined;
  if (typeof atobFn === "function") {
    const bin = atobFn(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }

  // Fallback base64 decoder (minimal, supports '=' padding).
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const table = new Uint8Array(256);
  table.fill(255);
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  table["=".charCodeAt(0)] = 254;

  if (s.length % 4 !== 0) throw new Error("Invalid base64 secret");

  let padding = 0;
  if (s.endsWith("==")) padding = 2;
  else if (s.endsWith("=")) padding = 1;

  const outLen = (s.length / 4) * 3 - padding;
  const out = new Uint8Array(outLen);

  let outIdx = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c0 = table[s.charCodeAt(i)]!;
    const c1 = table[s.charCodeAt(i + 1)]!;
    const c2 = table[s.charCodeAt(i + 2)]!;
    const c3 = table[s.charCodeAt(i + 3)]!;

    if (c0 === 255 || c1 === 255 || c2 === 255 || c3 === 255) {
      throw new Error("Invalid base64 secret");
    }

    const isPad2 = c2 === 254;
    const isPad3 = c3 === 254;

    const b0 = c0 === 254 ? 0 : c0;
    const b1 = c1 === 254 ? 0 : c1;
    const b2 = c2 === 254 ? 0 : c2;
    const b3 = c3 === 254 ? 0 : c3;

    const n = (b0 << 18) | (b1 << 12) | (b2 << 6) | b3;

    if (outIdx < outLen) out[outIdx++] = (n >>> 16) & 255;
    if (!isPad2 && outIdx < outLen) out[outIdx++] = (n >>> 8) & 255;
    if (!isPad3 && outIdx < outLen) out[outIdx++] = n & 255;
  }

  return out;
}
