import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // Allow the dev server to serve files from monorepo workspaces (e.g. `packages/shared`).
      allow: ["..", "../.."],
    },
  },
});
