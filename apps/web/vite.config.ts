import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

/**
 * Vite config (monorepo)
 *
 * Goal:
 * - Convex writes `CONVEX_URL` to the repo root `.env.local`.
 * - The web app expects `VITE_CONVEX_URL` (client-exposed env var).
 *
 * This config loads env from the repo root and maps:
 *   CONVEX_URL -> VITE_CONVEX_URL
 * for both dev and build, so you don't need to duplicate `.env.local` files.
 */

export default defineConfig(({ mode }) => {
  // `apps/web` directory (ESM-safe)
  const appDir = path.dirname(fileURLToPath(import.meta.url));

  // Repo root: `<repo>/apps/web` -> `<repo>`
  const repoRoot = path.resolve(appDir, "../..");

  // Load ALL env vars from repo root (no prefix filter).
  // This reads `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` in `repoRoot`.
  const rootEnv = loadEnv(mode, repoRoot, "");

  // Prefer an explicitly-set VITE_CONVEX_URL; otherwise fall back to CONVEX_URL from root.
  const resolvedConvexUrl =
    (rootEnv.VITE_CONVEX_URL || process.env.VITE_CONVEX_URL || "").trim() ||
    (rootEnv.CONVEX_URL || process.env.CONVEX_URL || "").trim() ||
    "";

  // Ensure Vite will expose `import.meta.env.VITE_CONVEX_URL` to the client.
  // Vite only exposes env vars with the `VITE_` prefix, but `loadEnv()` merges `process.env`,
  // so we set it here before Vite finalizes env injection.
  if (resolvedConvexUrl && !process.env.VITE_CONVEX_URL) {
    process.env.VITE_CONVEX_URL = resolvedConvexUrl;
  }

  if (!resolvedConvexUrl) {
    // Don't hard-fail here; AppConvex.tsx will throw a clear runtime error if it's missing.
    // This keeps `vite` CLI behavior predictable and avoids breaking unrelated commands.
    console.warn(
      [
        "[agentromatic] Missing Convex URL.",
        "Expected either:",
        "  - VITE_CONVEX_URL in repo root env, OR",
        "  - CONVEX_URL in repo root `.env.local` (written by Convex).",
        "",
        "If Convex already created it, ensure you're running `npx convex dev` once and that repo root `.env.local` exists.",
      ].join("\n"),
    );
  }

  return {
    plugins: [react()],

    // Tell Vite to treat repo root as the env directory.
    envDir: repoRoot,

    server: {
      fs: {
        // Allow the dev server to serve files from monorepo workspaces (e.g. `packages/shared`).
        allow: ["..", "../.."],
      },
    },
  };
});
