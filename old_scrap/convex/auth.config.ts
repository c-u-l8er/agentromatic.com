import { AuthConfig } from "convex/server";

/**
 * Convex auth configuration for Clerk.
 *
 * Setup requirements (Clerk):
 * - Create a JWT template named **"convex"** (do not rename it).
 * - In that template's settings, note the **Issuer URL**.
 *
 * Setup requirements (Convex env):
 * - Set `CLERK_JWT_ISSUER_DOMAIN` to the Issuer URL from Clerk's "convex" JWT template.
 *
 * After adding/updating this file or env var:
 * - re-run `npx convex dev` (or `npx convex deploy`) to sync auth config.
 */
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!issuerDomain) {
  throw new Error(
    "Missing CLERK_JWT_ISSUER_DOMAIN. Set it to the Issuer URL from Clerk's JWT template named 'convex'.",
  );
}

export default {
  providers: [
    {
      domain: issuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
